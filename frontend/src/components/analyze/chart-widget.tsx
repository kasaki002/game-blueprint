 "use client";
 
 import { useEffect, useRef } from "react";
 import * as d3 from "d3";
 
 interface Props {
   type: "radar" | "bar" | "timeline";
   data: Record<string, unknown>[];
   width?: number;
   height?: number;
 }
 
 export function ChartWidget({ type, data, width = 400, height = 300 }: Props) {
   const svgRef = useRef<SVGSVGElement>(null);
 
   useEffect(() => {
     if (!svgRef.current || !data.length) return;
 
     const svg = d3.select(svgRef.current);
     svg.selectAll("*").remove();
     const rows = data.map((item, index) => ({
       label: String(item.label ?? item.name ?? index + 1),
       value: Number(item.value ?? item.score ?? 0),
     }));
     const margin = { top: 18, right: 18, bottom: 48, left: 42 };

     if (type === "bar" || type === "timeline") {
       const x = d3.scaleBand().domain(rows.map((row) => row.label)).range([margin.left, width - margin.right]).padding(0.25);
       const y = d3.scaleLinear().domain([0, d3.max(rows, (row) => row.value) || 1]).nice().range([height - margin.bottom, margin.top]);
       svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x)).selectAll("text").attr("transform", "rotate(-20)").style("text-anchor", "end");
       svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));
       svg.selectAll("rect").data(rows).join("rect")
         .attr("x", (row) => x(row.label) || 0).attr("y", (row) => y(row.value))
         .attr("width", x.bandwidth()).attr("height", (row) => y(0) - y(row.value))
         .attr("rx", 4).attr("fill", "hsl(var(--primary))");
     } else {
       const radius = Math.min(width, height) * 0.35;
       const center = [width / 2, height / 2] as const;
       const max = d3.max(rows, (row) => row.value) || 1;
       const points = rows.map((row, index) => {
         const angle = (Math.PI * 2 * index) / rows.length - Math.PI / 2;
         const distance = radius * row.value / max;
         return [center[0] + Math.cos(angle) * distance, center[1] + Math.sin(angle) * distance] as [number, number];
       });
       svg.append("path").attr("d", d3.line().curve(d3.curveLinearClosed)(points))
         .attr("fill", "hsl(var(--primary) / 0.22)").attr("stroke", "hsl(var(--primary))").attr("stroke-width", 2);
       rows.forEach((row, index) => {
         const angle = (Math.PI * 2 * index) / rows.length - Math.PI / 2;
         svg.append("text").attr("x", center[0] + Math.cos(angle) * (radius + 18))
           .attr("y", center[1] + Math.sin(angle) * (radius + 18)).attr("text-anchor", "middle")
           .attr("font-size", 11).attr("fill", "currentColor").text(row.label);
       });
     }
   }, [type, data, width, height]);
 
   return <svg ref={svgRef} width={width} height={height} className="text-muted-foreground" />;
 }
