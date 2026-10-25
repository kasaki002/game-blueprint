"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Lightbulb, Puzzle, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { DesignProject, InspirationNote } from "@/lib/types";

const modules = [
  { title: "游戏查询", action: "搜索游戏资料", description: "查找游戏基础信息、平台、评分和数据来源", icon: Search, href: "/query", accent: "#2563EB" },
  { title: "游戏分析", action: "创建分析报告", description: "使用预设模板或 AI 对话拆解游戏设计", icon: BarChart3, href: "/analyze", accent: "#059669" },
  { title: "灵感记录", action: "记录一个想法", description: "整理创意便签，并使用 AI 深化设计方向", icon: Lightbulb, href: "/inspiration", accent: "#D97706" },
  { title: "游戏设计", action: "继续编辑蓝图", description: "通过节点画布组织玩法、关卡、角色和叙事", icon: Puzzle, href: "/design", accent: "#DC2626" },
];

export function DashboardPage() {
  const [counts, setCounts] = useState({ projects: null as number | null, notes: null as number | null });

  useEffect(() => {
    Promise.allSettled([api.listProjects(), api.listNotes()]).then(([projects, notes]) => {
      setCounts({
        projects: projects.status === "fulfilled" ? (projects.value as DesignProject[]).length : null,
        notes: notes.status === "fulfilled" ? (notes.value as InspirationNote[]).length : null,
      });
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="border-b pb-6">
        <p className="text-xs font-medium text-muted-foreground">工作台概览</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-bold tracking-tight">游戏蓝图</h1><p className="mt-1 text-sm text-muted-foreground">从资料查询到设计落地，继续你的创作流程。</p></div>
          <div className="flex gap-6 text-sm">
            <Link href="/inspiration" className="group"><span className="block text-xl font-semibold">{counts.notes ?? "-"}</span><span className="text-xs text-muted-foreground group-hover:text-foreground">灵感记录</span></Link>
            <Link href="/design" className="group"><span className="block text-xl font-semibold">{counts.projects ?? "-"}</span><span className="text-xs text-muted-foreground group-hover:text-foreground">设计项目</span></Link>
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <div><h2 className="text-sm font-semibold">开始工作</h2><p className="mt-0.5 text-xs text-muted-foreground">选择与你当前目标最接近的模块。</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {modules.map(({ title, action, description, icon: Icon, href, accent }) => (
            <a key={href} href={href} target="_blank" rel="noreferrer">
              <Card className="group h-full overflow-hidden rounded-md transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md">
                <CardContent className="relative flex min-h-32 items-start gap-4 p-5">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted" style={{ color: accent }}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p><span className="mt-3 inline-flex items-center text-xs font-medium">{action}<ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </section>

    </div>
  );
}
