 "use client";
 
 import { Button } from "@/components/ui/button";
 import { BarChart3 } from "lucide-react";
 import { useRouter } from "next/navigation";
 
 interface Props {
   gameId: string;
 }
 
 export function AnalyzeButton({ gameId }: Props) {
   const router = useRouter();
   return (
     <Button variant="secondary" size="sm" onClick={() => router.push(`/analyze?gameId=${gameId}`)}>
       <BarChart3 className="mr-1 h-4 w-4" />
       分析此游戏
     </Button>
   );
 }
