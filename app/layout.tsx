import type { ReactNode } from "react";

export const metadata = {
  title: "ai-vibe-starter",
  description: "Reusable Next.js + TypeScript starter scaffold",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
