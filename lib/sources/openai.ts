/**
 * OpenAI 数据源（方案第 1 节：官方 RSS，主路径，稳）。
 *
 * 实现统一的 NewsSource 接口：怎么抓是这里的内部事，对外只吐归一化好的 RawItem[]。
 * 抓取复用 lib/fetcher 的 fetchText（10s 超时 + 指数退避重试），自己只管解析与归一化——
 * 用 parseString（而非 rss-parser 自带的 parseURL），确保网络请求走我们统一的容错通道。
 */

import Parser from "rss-parser";

import { fetchText } from "../fetcher";
import type { NewsSource, RawItem } from "./types";

const SOURCE_ID = "openai";
const FEED_URL = "https://openai.com/news/rss.xml";

// 无状态、可复用的单例解析器。
const parser = new Parser();

/**
 * 把一条 RSS item 收敛成统一的 RawItem。
 * link 是溯源核心（方案第 6 节），缺了就丢弃这条 —— 返回 null，由调用方过滤掉。
 */
function normalize(item: Parser.Item): RawItem | null {
  if (!item.link) {
    return null;
  }
  // rss-parser 通常已从 pubDate 生成 ISO 格式的 isoDate；没有就用 pubDate 兜底转换。
  const publishedAt = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : "");
  return {
    sourceId: SOURCE_ID,
    title: item.title ?? "(untitled)",
    link: item.link,
    // contentSnippet 是去掉 HTML 标签的纯文本，喂给 AI 更干净；逐级兜底。
    content: item.contentSnippet ?? item.content ?? item.summary ?? "",
    publishedAt,
    guid: item.guid ?? item.link,
  };
}

export const openaiSource: NewsSource = {
  id: SOURCE_ID,
  label: "OpenAI",
  async fetch(): Promise<RawItem[]> {
    const xml = await fetchText(FEED_URL);
    const feed = await parser.parseString(xml);
    return feed.items.map(normalize).filter((item): item is RawItem => item !== null);
  },
};
