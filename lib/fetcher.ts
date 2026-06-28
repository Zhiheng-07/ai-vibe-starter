/**
 * 通用抓取器（方案第 3 节）。
 *
 * 两层职责，对应「超时 / 重试 / 降级」：
 *  - fetchText：单个 URL 的健壮抓取（超时 + 指数退避重试），失败抛错，自己不降级。
 *  - collectSources：跑完一批源，单源失败隔离跳过、其余照常，永不抛——这是「优雅降级」。
 *
 * Node 22 自带全局 fetch / AbortController，无需额外库。
 */

import type { NewsSource, SourceFetchResult } from "./sources/types";

export interface FetchTextOptions {
  /** 单次请求超时，默认 10s。 */
  timeoutMs?: number;
  /** 失败后再试的次数，默认 3（合计最多 4 次请求）。 */
  retries?: number;
  /** 退避基数，默认 1s（间隔为 base * 2^i：1s → 2s → 4s）。 */
  baseDelayMs?: number;
}

/** 单 URL 抓取彻底失败时抛出，携带 url、尝试次数与最后一次原因。 */
export class FetchError extends Error {
  readonly url: string;
  readonly attempts: number;

  constructor(url: string, attempts: number, cause: unknown) {
    super(`Failed to fetch ${url} after ${attempts} attempt(s)`, { cause });
    this.name = "FetchError";
    this.url = url;
    this.attempts = attempts;
  }
}

/** 内部：HTTP 状态非 2xx。retryable 标记是否值得重试（429/5xx 值得，其它 4xx 不值得）。 */
class HttpError extends Error {
  readonly retryable: boolean;

  constructor(status: number, retryable: boolean) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
    this.retryable = retryable;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const JITTER_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 重试只打在「可能自愈」的故障上：超时 / 网络层错误 / 429 / 5xx。其它 4xx 立即放弃。 */
function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.retryable;
  }
  // AbortError（超时）、TypeError（DNS/连接失败）等网络层问题，默认可重试。
  return true;
}

/** 一次请求：超时用 AbortController 控制，finally 里清掉定时器。 */
async function attemptFetch(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new HttpError(response.status, retryable);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓取一个 URL 的响应正文（不解析，由各源自己解析 RSS/HTML）。
 * 带 10s 超时与指数退避重试；用尽仍失败则抛 FetchError，把「要不要降级」交给上层决定。
 */
export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await attemptFetch(url, timeoutMs);
    } catch (error) {
      lastError = error;
      // 不可重试的错误，或重试次数已用尽 → 放弃。
      if (!isRetryable(error) || attempt === retries) {
        throw new FetchError(url, attempt + 1, error);
      }
      // 指数退避 + 抖动，避免多源同时重试形成惊群。
      const backoff = baseDelayMs * 2 ** attempt + Math.random() * JITTER_MS;
      await sleep(backoff);
    }
  }
  // 理论上不可达（循环要么 return 要么 throw），仅为类型完整兜底。
  throw new FetchError(url, retries + 1, lastError);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 跑完一批源：每个源各自 fetch()，用 try/catch 把单源失败隔离——
 * 失败的记 status:'error' 跳过、成功的照常收集，整个函数永不 throw。
 * 「宁可少一个源，不可整页挂」（方案第 3 节）。各源并行，互不阻塞。
 */
export async function collectSources(sources: NewsSource[]): Promise<SourceFetchResult[]> {
  return Promise.all(
    sources.map(async (source): Promise<SourceFetchResult> => {
      try {
        const items = await source.fetch();
        return { sourceId: source.id, label: source.label, status: "ok", items };
      } catch (error) {
        return {
          sourceId: source.id,
          label: source.label,
          status: "error",
          items: [],
          error: errorMessage(error),
        };
      }
    }),
  );
}
