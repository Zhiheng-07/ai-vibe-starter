import { readFileSync } from "node:fs";
import path from "node:path";

import type { NewsItem } from "@/lib/sources/types";

import BriefList from "./components/brief-list";

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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 展示分层（DESIGN.md §5）：按时间从新到旧排序；若最新一条发布在参照时刻的 24h 内，
 * 则置顶高亮，其余平铺。参照时刻用简报的 generatedAt（快照自身的「当时」），
 * 使静态快照也能稳定演示置顶逻辑，且与「这条在简报生成时是否新鲜」语义一致。
 */
function layout(brief: Brief): { pinned: NewsItem | null; rest: NewsItem[] } {
  const sorted = [...brief.items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const ref = new Date(brief.generatedAt).getTime();
  const newest = sorted[0];
  const age = newest ? ref - new Date(newest.publishedAt).getTime() : Infinity;
  const isFresh = age >= 0 && age <= DAY_MS;

  return isFresh ? { pinned: newest, rest: sorted.slice(1) } : { pinned: null, rest: sorted };
}

export default function Home() {
  const brief = loadBrief();
  const hasItems = brief && brief.items.length > 0;
  const { pinned, rest } = hasItems ? layout(brief) : { pinned: null, rest: [] };
  const labels: Record<string, string> = {};
  brief?.sources.forEach((s) => {
    labels[s.sourceId] = s.label;
  });

  return (
    <main className="mx-auto min-h-screen max-w-[720px] px-6 py-12 sm:py-16">
      <header className="mb-12">
        <h1 className="font-display text-[42px] font-bold leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
          AI 简报
        </h1>
        <p className="mt-4 font-ui text-[15px] text-margin">
          每天汇总 OpenAI、Anthropic 的官方动态，AI 总结成简体中文。
        </p>
        {brief && <p className="mt-1 font-ui text-[13px] text-margin">{fullDate(brief.date)}</p>}
      </header>

      {!hasItems ? (
        <p className="bg-paper px-6 py-12 font-read text-base text-margin">
          今日暂无更新，或数据源暂不可用。
        </p>
      ) : (
        <BriefList pinned={pinned} rest={rest} labels={labels} />
      )}

      {brief && (
        <footer className="mt-16 border-t border-[#e3ddd0] pt-8 font-ui text-[13px] text-margin">
          <p>
            内容由 AI 自动总结，专有名词保留英文；请以
            <span className="text-ink"> 阅读原文 </span>
            为准。
          </p>
          <p className="mt-1">最后更新：{fullDate(brief.generatedAt)}</p>
        </footer>
      )}
    </main>
  );
}
