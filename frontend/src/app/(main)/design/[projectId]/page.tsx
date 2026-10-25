 "use client";
 
 import { useParams } from "next/navigation";
 import { DesignWorkbench } from "@/components/design/design-workbench";
 
 export default function DesignWorkbenchPage() {
   const params = useParams<{ projectId: string }>();
   return (
     <div className="h-full">
       <DesignWorkbench projectId={params.projectId} />
     </div>
   );
 }
