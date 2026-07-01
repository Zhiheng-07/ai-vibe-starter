"use client";

import { useState } from "react";

import type { NewsItem } from "@/lib/sources/types";

/** 默认最多展示的条目数（DESIGN.md §5.3），置顶卡计入其中。 */
const DEFAULT_COUNT = 12;

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(iso));

/** 已单色化墨黑的官方 LOGO（DESIGN.md §1），文件在 public/。 */
const SOURCE_LOGOS: Record<string, { src: string; alt: string }> = {
  openai: { src: "/logo-openai.svg", alt: "OpenAI" },
  anthropic: { src: "/logo-anthropic.svg", alt: "Anthropic" },
};

/** 来源标识：有官方 LOGO 用单色墨黑 LOGO（18px 高，与日期对齐）；未知来源用边注灰文字兜底。 */
function Source({ id, label }: { id: string; label: string }) {
  const logo = SOURCE_LOGOS[id];
  if (logo) {
    return (
      <span className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#f0f0f0]">
        {/* eslint-disable-next-line @next/next/no-img-element -- 静态单色 SVG，无需 next/image 优化 */}
        <img src={logo.src} alt={logo.alt} className="h-[20px] w-auto" />
      </span>
    );
  }
  return <span className="font-ui text-[13px] font-medium tracking-wide text-margin">{label}</span>;
}

function ReadMore({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-1 font-ui text-sm text-margin no-underline hover:text-ink hover:underline"
    >
      阅读原文
      <span aria-hidden>→</span>
    </a>
  );
}

/** 普通卡片：纸白底、锐角、无阴影，靠色差从奶油底浮起。 */
function Card({ item, label }: { item: NewsItem; label: string }) {
  return (
    <li className="bg-paper p-6">
      <div className="flex items-center gap-3">
        <Source id={item.sourceId} label={label} />
        <time className="font-ui text-[13px] text-margin">{shortDate(item.publishedAt)}</time>
      </div>
      <h2 className="mt-3 font-read text-[21px] font-semibold leading-snug text-ink">
        {item.titleZh}
      </h2>
      {item.summaryZh && (
        <p className="mt-2 font-ui text-base leading-relaxed text-body">{item.summaryZh}</p>
      )}
      <ReadMore href={item.link} />
    </li>
  );
}

/** 置顶高亮卡：更粗上边框 + 更大标题 + 灰阶「最新」标记，全用无彩色手段突出（DESIGN.md §5.1）。 */
function PinnedCard({ item, label }: { item: NewsItem; label: string }) {
  return (
    <li className="border-t-2 border-ink bg-paper p-8">
      <div className="flex items-center gap-3">
        <Source id={item.sourceId} label={label} />
        <time className="font-ui text-[13px] text-margin">{shortDate(item.publishedAt)}</time>
        <span className="ml-auto rounded-full bg-ink px-2.5 py-0.5 font-ui text-xs font-medium text-cream">
          最新
        </span>
      </div>
      <h2 className="mt-4 font-read text-[26px] font-semibold leading-tight text-ink">
        {item.titleZh}
      </h2>
      {item.summaryZh && (
        <p className="mt-3 font-ui text-[17px] leading-relaxed text-body">{item.summaryZh}</p>
      )}
      <ReadMore href={item.link} />
    </li>
  );
}

interface BriefListProps {
  /** 置顶条目：最新且在 24h 内时存在，否则 null。 */
  pinned: NewsItem | null;
  /** 其余条目，已按时间从新到旧排好。 */
  rest: NewsItem[];
  /** sourceId → 显示名 的映射。 */
  labels: Record<string, string>;
}

export default function BriefList({ pinned, rest, labels }: BriefListProps) {
  const [expanded, setExpanded] = useState(false);

  const labelOf = (id: string) => labels[id] ?? id;

  // 默认最多 12 条（含置顶）；点击「查看全部」后展开剩余。
  const restLimit = DEFAULT_COUNT - (pinned ? 1 : 0);
  const visibleRest = expanded ? rest : rest.slice(0, restLimit);
  const hiddenCount = rest.length - visibleRest.length;

  return (
    <>
      <ul className="space-y-4">
        {pinned && <PinnedCard item={pinned} label={labelOf(pinned.sourceId)} />}
        {visibleRest.map((item) => (
          <Card key={item.guid ?? item.link} item={item} label={labelOf(item.sourceId)} />
        ))}
      </ul>

      {hiddenCount > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full bg-btn px-5 py-2 font-ui text-sm text-white"
          >
            查看全部（还有 {hiddenCount} 条）
          </button>
        </div>
      )}
    </>
  );
}
