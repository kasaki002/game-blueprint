 "use client";
 
 import { useParams } from "next/navigation";
 import { InspirationEditor } from "@/components/inspiration/inspiration-editor";
 
 export default function NoteDetailPage() {
   const params = useParams<{ noteId: string }>();
   return (
     <div className="flex h-full gap-6">
       <div className="flex-1">
         <InspirationEditor noteId={params.noteId} />
       </div>
     </div>
   );
 }
