 "use client";
 
 import { ChatPanel } from "@/components/analyze/chat-panel";
 
 export default function ChatPage() {
   return (
     <div className="flex h-full flex-col">
       <div className="mb-4">
         <h1 className="text-2xl font-bold tracking-tight">AI 对话</h1>
       </div>
       <ChatPanel />
     </div>
   );
 }
