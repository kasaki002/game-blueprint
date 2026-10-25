"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api-client";
 
 interface Props {
   noteId: string;
 }
 
export function AiSuggestionBar({ noteId }: Props) {
  const [suggestion, setSuggestion] = useState("基于你的灵感内容，AI 可以提供扩展方向和建议。");
  const [loading, setLoading] = useState(false);

  const loadSuggestion = async () => {
    setLoading(true);
    try {
      const result = await api.aiDeepen(noteId, "请给出三个可执行的深化方向") as { response: string };
      setSuggestion(result.response);
    } catch (error) {
      setSuggestion(error instanceof Error ? error.message : "获取建议失败");
    } finally {
      setLoading(false);
    }
  };
   return (
     <Card>
       <CardHeader>
         <CardTitle className="flex items-center gap-2 text-sm">
           <Sparkles className="h-4 w-4" />
           AI 建议
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-2">
         <p className="text-xs text-muted-foreground">
           {suggestion}
         </p>
         <Button variant="secondary" size="sm" className="w-full" onClick={loadSuggestion} disabled={loading}>
           获取建议
         </Button>
       </CardContent>
     </Card>
   );
 }
