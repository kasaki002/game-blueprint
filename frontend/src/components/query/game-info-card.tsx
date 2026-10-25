 "use client";
 
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
import type { GameSummary } from "@/lib/types";
import { AnalyzeButton } from "./analyze-button";
import Link from "next/link";
import { ArrowRight, CalendarDays, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
 
 interface Props {
   game: GameSummary;
 }
 
 export function GameInfoCard({ game }: Props) {
   return (
     <Card className="overflow-hidden transition-shadow hover:shadow-sm">
       <div className="grid sm:grid-cols-[128px_minmax(0,1fr)]">
         <div className="hidden min-h-44 bg-muted sm:block">
           {game.cover_url ? <img src={game.cover_url} alt={game.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Gamepad2 className="h-7 w-7 text-muted-foreground" /></div>}
         </div>
         <div className="min-w-0">
           <CardHeader className="pb-3">
             <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base">
               {game.name}
               {game.aliases.length > 0 && (
                 <span className="text-sm font-normal text-muted-foreground">
                   ({game.aliases.join(" / ")})
                 </span>
               )}
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-2">
             {game.genres.length > 0 && (
               <div className="flex flex-wrap gap-1">
                 {game.genres.map((g) => (
                   <Badge key={g} variant="secondary">{g}</Badge>
                 ))}
               </div>
             )}
             <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
               {game.developers.length > 0 && <span>开发商：{game.developers.join("、")}</span>}
               {game.release_date && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{game.release_date}</span>}
             </div>
             {game.summary && (
               <p className="line-clamp-2 text-sm leading-6">{game.summary}</p>
             )}
             <div className="flex flex-wrap gap-2 pt-1">
               <Link href={`/query/${game.id}`}><Button variant="outline" size="sm">查看详情<ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
               <AnalyzeButton gameId={game.id} />
             </div>
           </CardContent>
         </div>
       </div>
     </Card>
   );
 }
