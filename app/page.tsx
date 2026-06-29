import { readFileSync } from "node:fs";
import path from "node:path";

import type { NewsItem } from "@/lib/sources/types";

interface SourceStatus {
  sourceId: string;
  label: string;
  status: "ok" | "error";
  count: number;
  error?: string;
}

interface Brief {
  date: string;
  generatedAt: string;
  sources: SourceStatus[];
  items: NewsItem[];
}

/** 读本地生成的简报快照（data/brief.local.json）。读不到返回 null，页面显示空态而非崩溃。 */
function loadBrief(): Brief | null {
  try {
    const file = path.join(process.cwd(), "data", "brief.local.json");
    return JSON.parse(readFileSync(file, "utf8")) as Brief;
  } catch {
    return null;
  }
}

const fullDate = (iso: string) =>
  new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(
    new Date(iso),
  );

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(iso));

// 来源 chip 的淡色区分，未知来源回退中性灰。
const SOURCE_STYLES: Record<string, string> = {
  openai: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  anthropic: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};
const chipStyle = (id: string) =>
  SOURCE_STYLES[id] ?? "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";

function labelOf(brief: Brief, sourceId: string): string {
  return brief.sources.find((s) => s.sourceId === sourceId)?.label ?? sourceId;
}

export default function Home() {
  const brief = loadBrief();

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-12 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AI 简报</h1>
        <p className="mt-2 text-sm text-neutral-500">
          每天汇总 OpenAI、Anthropic 的官方动态，AI 总结成简体中文。
        </p>
        {brief && <p className="mt-1 text-sm text-neutral-400">{fullDate(brief.date)}</p>}
      </header>

      {!brief || brief.items.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-500">
          今日暂无更新，或数据源暂不可用。
        </p>
      ) : (
        <ul className="space-y-4">
          {brief.items.map((item) => (
            <li
              key={item.guid ?? item.link}
              className="rounded-2xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
            >
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${chipStyle(item.sourceId)}`}
                >
                  {labelOf(brief, item.sourceId)}
                </span>
                <time className="text-neutral-400">{shortDate(item.publishedAt)}</time>
              </div>

              <h2 className="mt-3 text-lg font-semibold leading-snug text-neutral-900">
                {item.titleZh}
              </h2>

              {item.summaryZh && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.summaryZh}</p>
              )}

              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                阅读原文
                <span aria-hidden>→</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {brief && (
        <footer className="mt-10 border-t border-neutral-200 pt-6 text-xs text-neutral-400">
          <p>
            内容由 AI 自动总结，专有名词保留英文；请以
            <span className="text-neutral-500"> 阅读原文 </span>
            为准。
          </p>
          <p className="mt-1">最后更新：{fullDate(brief.generatedAt)}</p>
        </footer>
      )}
    </main>
  );
}
