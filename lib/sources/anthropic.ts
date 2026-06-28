/**
 * Anthropic 数据源（方案第 1 节：官方无 RSS，做「两条腿」）。
 *
 * 主路径：非官方 RSS（第三方个人项目，随时可能停更）。
 * 兜底：主路径拿不到时，自动降级解析官网 anthropic.com/news 的静态 HTML。
 *
 * 失败判定与切换都在本源内部完成，对调度层（collectSources）透明——它只看到
 * 「Anthropic 返回了 N 条」或「彻底失败」，不知道中途降级过。
 * 两条腿都断 → 抛错 → 被 collectSources 接住记 error、跳过该源（其余照常）。
 *
 * 抓取统一复用 lib/fetcher 的 fetchText（10s 超时 + 退避重试），不绕过容错。
 */

import * as cheerio from "cheerio";
import Parser from "rss-parser";

import { fetchText } from "../fetcher";
import type { NewsSource, RawItem } from "./types";

const SOURCE_ID = "anthropic";
const PRIMARY_RSS = "https://tim-hilde.github.io/anthropic-rss/rss.xml";
const FALLBACK_HTML = "https://www.anthropic.com/news";
const SITE_ORIGIN = "https://www.anthropic.com";

const parser = new Parser();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── 主路径：非官方 RSS ────────────────────────────────────────────────

function rssItemToRaw(item: Parser.Item): RawItem | null {
  if (!item.link) {
    return null;
  }
  const publishedAt = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : "");
  return {
    sourceId: SOURCE_ID,
    title: item.title ?? "(untitled)",
    link: item.link,
    content: item.contentSnippet ?? item.content ?? item.summary ?? "",
    publishedAt,
    guid: item.guid ?? item.link,
  };
}

async function fetchFromRss(): Promise<RawItem[]> {
  const xml = await fetchText(PRIMARY_RSS);
  const feed = await parser.parseString(xml);
  return feed.items.map(rssItemToRaw).filter((item): item is RawItem => item !== null);
}

// ── 兜底解析：官网静态 HTML（单独隔离的纯函数）─────────────────────────
//
// 官网改版只改这一个函数。靠稳定结构 a[href^="/news/"] + <time> 提取，
// 不依赖会随构建变化的 hash 类名（如 FeaturedGrid-module-scss-module__…）。

/** 把 'Jun 12, 2026' 这类文本转 ISO；无法解析时回退为「抓取当天」（兜底精度本就较低）。 */
function parseNewsDate(text: string): string {
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString();
}

/** '/news/seoul-office-partnerships' → 'Seoul Office Partnerships'，仅当 heading 缺失时兜底。 */
function slugToTitle(href: string): string {
  const slug = href.split("/").filter(Boolean).pop() ?? "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** 纯函数：输入官网 HTML，输出归一化条目。官网改版时这是唯一要改的地方。 */
export function parseNewsHtml(html: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  const seen = new Set<string>();

  $('a[href^="/news/"]').each((_i, el) => {
    const a = $(el);
    const href = a.attr("href");
    if (!href || seen.has(href)) {
      return;
    }
    seen.add(href);

    const link = new URL(href, SITE_ORIGIN).toString();
    const heading = a.find("h1,h2,h3,h4").first().text().trim();
    const title = heading || slugToTitle(href);
    const publishedAt = parseNewsDate(a.find("time").first().text().trim());
    // 兜底页正文很短，用清洗后的链接文本作 content 喂给 AI。
    const content = a.text().replace(/\s+/g, " ").trim();

    items.push({ sourceId: SOURCE_ID, title, link, content, publishedAt, guid: link });
  });

  return items;
}

async function fetchFromHtml(): Promise<RawItem[]> {
  const html = await fetchText(FALLBACK_HTML);
  return parseNewsHtml(html);
}

// ── 控制流：主源失败（含抓取错、解析错、空结果）→ 自动切兜底 ──────────────

export const anthropicSource: NewsSource = {
  id: SOURCE_ID,
  label: "Anthropic",
  async fetch(): Promise<RawItem[]> {
    let primaryError: unknown;
    try {
      const items = await fetchFromRss();
      // 空也当失败：返回 0 条的源等于没数据，去试兜底（方案：主源随时可能停更/挂掉）。
      if (items.length > 0) {
        return items;
      }
      primaryError = new Error("primary RSS returned no items");
    } catch (error) {
      primaryError = error;
    }

    // 主源没拿到 → 降级官网 HTML 兜底。
    try {
      const items = await fetchFromHtml();
      if (items.length === 0) {
        throw new Error("fallback HTML parsed no items");
      }
      return items;
    } catch (fallbackError) {
      // 两条腿都断 → 抛错，交给 collectSources 记 error、跳过本源。
      throw new Error(
        `Anthropic source failed: primary(${errorMessage(primaryError)}) + fallback(${errorMessage(fallbackError)})`,
      );
    }
  },
};
