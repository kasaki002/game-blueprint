 "use client";
 
 import { useParams } from "next/navigation";
 import { ReportViewer } from "@/components/analyze/report-viewer";
 
 export default function ReportPage() {
   const params = useParams<{ reportId: string }>();
   return (
     <div className="space-y-6">
       <ReportViewer reportId={params.reportId} />
     </div>
   );
 }
