/**
 * DeepSeek 总结 + 翻译（方案第 3、6 节）。
 *
 * 把抓取归一化的英文 RawItem 加工成含中文的 NewsItem：一次 API 调用同时完成
 * 「总结 + 翻译成简体中文」（少一道工序 = 少一半成本和延迟，也避免先翻再总结语义走样）。
 *
 * 健壮性：单条超时 + 对 429/5xx 退避重试 + 并发限流（2–3）+ token 预算截断；
 * 某条彻底失败则降级——退回只保留原英文标题 + 原文链接（summaryZh 留空），绝不让整批崩。
 *
 * 安全红线：DEEPSEEK_API_KEY 只从 process.env 服务端读取，绝不硬编码、绝不进前端、绝不打印。
 * 本模块没有 'use client'，且 key 只在请求头里使用，错误信息只带 HTTP 状态码、不带 key。
 */

import type { NewsItem, RawItem } from "./sources/types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const CONCURRENCY = 3; // 同时进行的总结请求数，避免触发 DeepSeek 限速。
const TIMEOUT_MS = 60_000; // 单条总结超时。
const RETRIES = 2; // 对 429/5xx/网络错的退避重试次数。
const BASE_DELAY_MS = 1_000;
const MAX_CONTENT_CHARS = 4_000; // token 预算：截断过长正文，控制单次成本。
const MAX_OUTPUT_TOKENS = 500;

const SYSTEM_PROMPT = [
  "你是一名简体中文科技资讯编辑。",
  "把用户给出的一条英文资讯，总结并翻译成简体中文。要求：",
  "1) 标题译成简洁、准确的中文标题；",
  "2) 摘要只依据给定的正文内容来写，不要编造正文之外的信息；中文摘要最多 300 字、绝不超过；内容少就写短，不要为凑字数注水；",
  "3) 专有名词保留英文原名，不要音译：如 GPT-5、Claude、API、各模型名等。",
  '   例：英文 "Introducing Claude Opus 4.8" → 中文 "Claude Opus 4.8 发布"，而不是"克劳德·作品 4.8"。',
  '只输出 JSON，格式：{"titleZh": "中文标题", "summaryZh": "中文摘要"}。',
].join("\n");

/** key 只在服务端读取；缺失时显式抛错（配置问题应当让任务失败，而非静默降级全部）。 */
function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/** 调一次 DeepSeek，返回 completion 文本。超时 + 对 429/5xx/网络错退避重试；4xx（如 401）不重试。 */
async function callDeepSeek(apiKey: string, userContent: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: MAX_OUTPUT_TOKENS,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        // 错误信息只带状态码，绝不带 key 或请求头。
        const err = new Error(`DeepSeek HTTP ${response.status}`);
        if (retryable && attempt < RETRIES) {
          lastError = err;
          await sleep(BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw err;
      }

      const data = (await response.json()) as ChatCompletion;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("DeepSeek returned empty completion");
      }
      return content;
    } catch (error) {
      lastError = error;
      // 超时（AbortError）/ 网络错可重试；用尽则抛。
      if (attempt < RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("DeepSeek call failed");
}

/** 把一条 RawItem 加工成 NewsItem。彻底失败则降级：保留原英文标题 + 链接，summaryZh 留空。 */
async function summarizeOne(item: RawItem, apiKey: string): Promise<NewsItem> {
  const userContent = [
    `Title: ${item.title}`,
    `Content: ${item.content.slice(0, MAX_CONTENT_CHARS)}`,
  ].join("\n");

  try {
    const raw = await callDeepSeek(apiKey, userContent);
    const parsed = JSON.parse(raw) as { titleZh?: unknown; summaryZh?: unknown };
    const titleZh = typeof parsed.titleZh === "string" ? parsed.titleZh.trim() : "";
    const summaryZh = typeof parsed.summaryZh === "string" ? parsed.summaryZh.trim() : "";
    if (!titleZh) {
      throw new Error("missing titleZh in completion");
    }
    return { ...item, titleZh, summaryZh };
  } catch {
    // 降级：退回原标题 + 原文链接（已在 item.link），不带 AI 摘要。
    return { ...item, titleZh: item.title, summaryZh: "" };
  }
}

/** 并发限流：最多 limit 个任务同时进行，保持输入顺序。 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * 把一批英文条目总结 + 翻译成中文。并发限流、逐条降级——本函数对单条失败不抛错。
 * （key 缺失会抛错，因为那是配置问题，应让整个生成任务显式失败。）
 */
export async function summarizeItems(items: RawItem[]): Promise<NewsItem[]> {
  if (items.length === 0) {
    return [];
  }
  const apiKey = getApiKey();
  return mapWithConcurrency(items, CONCURRENCY, (item) => summarizeOne(item, apiKey));
}
