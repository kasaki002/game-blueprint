 "use client";
 
 import { GameSearchBar } from "@/components/query/game-search-bar";
 
 export default function QueryPage() {
   return (
     <div className="space-y-6">
       <div>
         <h1 className="text-2xl font-bold tracking-tight">游戏查询</h1>
       </div>
       <GameSearchBar />
     </div>
   );
 }
