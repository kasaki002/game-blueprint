 "use client";
 
 import { useParams } from "next/navigation";
 import { GameDetailPanel } from "@/components/query/game-detail-panel";
 
 export default function GameDetailPage() {
   const params = useParams<{ gameId: string }>();
   return (
     <div className="space-y-6">
       <GameDetailPanel gameId={params.gameId} />
     </div>
   );
 }
