import type { Metadata } from "next";
import "./globals.css";
 
export const metadata: Metadata = {
  title: "游戏蓝图 | Game Blueprint",
  description: "游戏玩家、创作者与数据分析者的综合性平台 — 查、析、记、设",
};
 
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
