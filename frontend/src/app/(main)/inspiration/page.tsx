 "use client";
 
 import { InspirationList } from "@/components/inspiration/inspiration-list";
 
 export default function InspirationPage() {
   return (
     <div className="flex h-full gap-6">
       <div className="flex-1 space-y-6">
         <div className="flex items-center justify-between">
           <div>
             <h1 className="text-2xl font-bold tracking-tight">灵感记录</h1>
           </div>
         </div>
         <InspirationList />
       </div>
     </div>
   );
 }
