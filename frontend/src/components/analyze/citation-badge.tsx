 "use client";
 
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
 
 interface Props {
   source: string;
   url?: string;
 }
 
export function CitationBadge({ source, url }: Props) {
  const badge = (
    <Badge variant="outline" className={url ? "cursor-pointer gap-1 hover:bg-accent" : "gap-1"}>
      <BookOpen className="h-3 w-3" />{source}
    </Badge>
  );

  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {badge}
    </a>
  ) : badge;
}
