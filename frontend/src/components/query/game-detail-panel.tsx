"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, CalendarDays, ExternalLink, Gamepad2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { GameDetail } from "@/lib/types";

export function GameDetailPanel({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { api.getGameDetail(gameId).then((data) => setGame(data as GameDetail)).catch((err) => setError(err instanceof Error ? err.message : "加载失败")).finally(() => setLoading(false)); }, [gameId]);

  if (loading) return <div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded bg-muted" /><div className="h-72 animate-pulse rounded border bg-muted/40" /></div>;
  if (!game) return <div className="border-y py-16 text-center"><p className="text-sm font-medium">未找到游戏</p><p className="mt-1 text-sm text-destructive">{error}</p><Link href="/query"><Button variant="outline" size="sm" className="mt-5"><ArrowLeft className="mr-1 h-4 w-4" />返回查询</Button></Link></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4"><Link href="/query"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />返回查询</Button></Link><Link href={`/analyze?gameId=${game.id}`}><Button size="sm"><BarChart3 className="mr-1 h-4 w-4" />分析此游戏</Button></Link></div>
      <section className="grid gap-6 md:grid-cols-[192px_minmax(0,1fr)]">
        <div className="aspect-[3/4] overflow-hidden rounded-md border bg-muted">{game.cover_url ? <img src={game.cover_url} alt={game.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Gamepad2 className="h-10 w-10 text-muted-foreground" /></div>}</div>
        <div className="min-w-0 space-y-4">
          <div><h1 className="text-2xl font-bold">{game.name}</h1>{game.aliases.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{game.aliases.join(" / ")}</p>}</div>
          <div className="flex flex-wrap gap-1.5">{game.genres.map((genre) => <Badge key={genre}>{genre}</Badge>)}</div>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">开发商</dt><dd className="mt-0.5">{game.developers.join("、") || "暂无"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">发行商</dt><dd className="mt-0.5">{game.publishers.join("、") || "暂无"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">平台</dt><dd className="mt-0.5">{game.platforms.join("、") || "暂无"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">发行日期</dt><dd className="mt-0.5 flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{game.release_date || "暂无"}</dd></div>
          </dl>
          <p className="max-w-3xl text-sm leading-7 text-foreground/85">{game.summary || "暂无游戏简介。"}</p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">评分</CardTitle></CardHeader><CardContent className="space-y-2">{game.ratings.length === 0 ? <p className="text-sm text-muted-foreground">暂无评分数据</p> : game.ratings.map((rating, index) => <div key={index} className="flex items-center justify-between border-b py-2 text-sm last:border-0"><span>{String(rating.source || "来源")}</span><span className="font-medium">{String(rating.score || "-")}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">数据来源</CardTitle></CardHeader><CardContent className="space-y-2">{game.sources.length === 0 ? <p className="text-sm text-muted-foreground">暂无来源信息</p> : game.sources.map((source, index) => { const url = String(source.url || ""); return url ? <a key={index} href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-accent"><span className="truncate">{String(source.name || source.source || `来源 ${index + 1}`)}</span><ExternalLink className="h-3.5 w-3.5" /></a> : <div key={index} className="rounded border px-3 py-2 text-sm">{String(source.name || source.source || `来源 ${index + 1}`)}</div>; })}</CardContent></Card>
      </div>
    </div>
  );
}
