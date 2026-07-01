import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "AI 简报 · 今日 AI 圈在发生什么",
  description: "每天自动汇总 OpenAI、Anthropic 的官方动态，AI 总结成简体中文，30 秒读完。",
  openGraph: {
    title: "AI 简报 · 今日 AI 圈在发生什么",
    description: "每天自动汇总 OpenAI、Anthropic 的官方动态，AI 总结成简体中文，30 秒读完。",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
