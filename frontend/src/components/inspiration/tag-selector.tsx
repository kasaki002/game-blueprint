 "use client";
 
 import { useState } from "react";
 import { Badge } from "@/components/ui/badge";
 import { Input } from "@/components/ui/input";
 import { X, Plus } from "lucide-react";
 
 interface Props {
   tags: string[];
   onChange: (tags: string[]) => void;
 }
 
 const presetTags = ["类魂", "Roguelike", "开放世界", "像素风", "RPG", "科幻", "奇幻", "解谜"];
 
 export function TagSelector({ tags, onChange }: Props) {
   const [input, setInput] = useState("");
 
   const addTag = (tag: string) => {
     const t = tag.trim();
     if (t && !tags.includes(t)) {
       onChange([...tags, t]);
     }
     setInput("");
   };
 
   const removeTag = (tag: string) => {
     onChange(tags.filter((t) => t !== tag));
   };
 
   return (
     <div className="space-y-2">
       <div className="flex flex-wrap gap-1">
         {tags.map((tag) => (
           <Badge key={tag} variant="secondary" className="gap-1 pr-1">
             {tag}
             <button type="button" className="grid h-4 w-4 place-items-center rounded hover:bg-foreground/10" aria-label={`移除标签${tag}`} title="移除标签" onClick={() => removeTag(tag)}><X className="h-3 w-3" /></button>
           </Badge>
         ))}
       </div>
       <div className="flex flex-wrap gap-1">
         {presetTags.filter((t) => !tags.includes(t)).map((tag) => (
           <Badge
             key={tag}
             variant="outline"
             className="cursor-pointer"
             onClick={() => addTag(tag)}
           >
             <Plus className="mr-0.5 h-3 w-3" />
             {tag}
           </Badge>
         ))}
       </div>
       <Input
         className="h-8 max-w-xs text-xs"
         placeholder="新建标签..."
         value={input}
         onChange={(e) => setInput(e.target.value)}
         onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(input); } }}
       />
     </div>
   );
 }
