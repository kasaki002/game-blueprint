"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, Lightbulb, Puzzle, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard },
  { href: "/query", label: "游戏查询", icon: Search },
  { href: "/analyze", label: "游戏分析", icon: BarChart3 },
  { href: "/inspiration", label: "灵感记录", icon: Lightbulb },
  { href: "/design", label: "游戏设计", icon: Puzzle },
];

interface Props { mobileOpen?: boolean; onNavigate?: () => void; onClose?: () => void; }

export function Sidebar({ mobileOpen = false, onNavigate, onClose }: Props) {
  const pathname = usePathname();
  const content = (
    <aside className="flex h-full w-56 flex-col border-r bg-background">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold" onClick={onNavigate}><span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground"><Puzzle className="h-4 w-4" /></span><span>游戏蓝图</span></Link>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="关闭导航" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return <Link key={href} href={href} onClick={onNavigate} aria-current={isActive ? "page" : undefined} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}><Icon className="h-4 w-4" />{label}</Link>;
        })}
      </nav>
      <div className="border-t p-4 text-[11px] text-muted-foreground">查 · 析 · 记 · 设</div>
    </aside>
  );

  return (
    <>
      <div className="hidden shrink-0 md:block">{content}</div>
      <div className={cn("fixed inset-0 z-50 md:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!mobileOpen}>
        <button type="button" aria-label="关闭导航" className={cn("absolute inset-0 bg-foreground/25 backdrop-blur-[1px] transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")} onClick={onClose} />
        <div className={cn("absolute inset-y-0 left-0 transition-transform duration-200 ease-out", mobileOpen ? "translate-x-0" : "-translate-x-full")}>{content}</div>
      </div>
    </>
  );
}
