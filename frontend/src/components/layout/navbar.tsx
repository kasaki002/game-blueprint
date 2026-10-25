"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Moon, Sun, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./global-search";
import { api } from "@/lib/api-client";
import { useRouter } from "next/navigation";

const pageNames: Record<string, string> = {
  query: "游戏查询",
  analyze: "游戏分析",
  inspiration: "灵感记录",
  design: "游戏设计",
  login: "登录",
  register: "注册",
};

export function Navbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [username, setUsername] = useState("");
  const router = useRouter();
  const segment = pathname.split("/").filter(Boolean)[0];
  const title = segment ? pageNames[segment] || "游戏蓝图" : "工作台概览";

  useEffect(() => {
    const stored = localStorage.getItem("game-blueprint-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = stored ? stored === "dark" : prefersDark;
    document.documentElement.classList.toggle("dark", shouldUseDark);
    setDark(shouldUseDark);
  }, []);
  useEffect(() => { api.me().then((user) => setUsername((user as { username: string }).username)).catch(() => undefined); }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("game-blueprint-theme", next ? "dark" : "light");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-3 backdrop-blur sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="打开导航" title="打开导航" onClick={onMenuClick}><Menu className="h-5 w-5" /></Button>
        <span className="hidden truncate text-sm font-medium sm:block">{title}</span>
      </div>
      <div className="flex items-center gap-2"><GlobalSearch /><span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"><UserRound className="h-3.5 w-3.5" />{username}</span><Button variant="ghost" size="icon" aria-label={dark ? "切换浅色模式" : "切换深色模式"} title={dark ? "浅色模式" : "深色模式"} onClick={toggleTheme}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" aria-label="退出登录" title="退出登录" onClick={async () => { await api.logout(); router.replace("/login"); router.refresh(); }}><LogOut className="h-4 w-4" /></Button></div>
    </header>
  );
}
