 "use client";
 
 import { Badge } from "@/components/ui/badge";
 
 interface Props {
   source: string; // steam | wiki | igdb | etc.
 }
 
 const sourceColors: Record<string, string> = {
   steam: "bg-blue-100 text-blue-800",
   wiki: "bg-gray-100 text-gray-800",
   igdb: "bg-purple-100 text-purple-800",
 };
 
 export function SourceBadge({ source }: Props) {
   const color = sourceColors[source.toLowerCase()] || "bg-muted text-muted-foreground";
   return <Badge variant="outline" className={color}>{source}</Badge>;
 }
