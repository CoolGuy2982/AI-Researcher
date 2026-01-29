import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '../types';

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ nodes, edges }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<any, any>>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom as any);

    const g = svg.append("g");
    const linkGroup = g.append("g").attr("class", "links");
    const nodeGroup = g.append("g").attr("class", "nodes");

    const nodesData = nodes.map(d => ({ ...d }));
    const edgesData = edges.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(nodesData)
      .force("link", d3.forceLink(edgesData).id((d: any) => d.id).distance(160).strength(0.1))
      .force("charge", d3.forceManyBody().strength(-600))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(70));

    simulationRef.current = simulation as any;

    const link = linkGroup
      .selectAll("line")
      .data(edgesData)
      .join("line")
      .attr("stroke", "#f1f1f1")
      .attr("stroke-width", 1.25)
      .attr("stroke-dasharray", (d: any) => d.label ? "3 3" : "0");

    const node = nodeGroup
      .selectAll("g")
      .data(nodesData)
      .join("g")
      .attr("class", "cursor-pointer group")
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedNode(d as GraphNode);
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltipPos({ 
            x: event.clientX - rect.left, 
            y: event.clientY - rect.top 
          });
        }
      })
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    // Glowing aura for frontier nodes
    node.filter((d: any) => d.type === 'frontier')
      .append("circle")
      .attr("r", 16)
      .attr("fill", "rgba(0,0,0,0.03)")
      .attr("class", "animate-pulse");

    node.append("circle")
      .attr("r", (d: any) => d.type === 'frontier' ? 12 : d.type === 'paper' ? 9 : 7)
      .attr("fill", (d: any) => {
        if (d.type === 'frontier') return "#000";
        if (d.url) return "#fff"; // Sources are distinct white circles
        return "#fafafa";
      })
      .attr("stroke", (d: any) => {
        if (d.type === 'frontier') return "#000";
        if (d.url) return "#e5e7eb";
        return "#f1f1f1";
      })
      .attr("stroke-width", 1.5)
      .attr("class", "transition-all duration-300 hover:stroke-black shadow-sm");

    // Indicator for nodes with external links
    node.filter((d: any) => !!d.url)
      .append("circle")
      .attr("r", 2)
      .attr("cy", -12)
      .attr("fill", "#3b82f6")
      .attr("class", "opacity-60");

    node.append("text")
      .text((d: any) => d.label)
      .attr("dx", 18)
      .attr("dy", 4)
      .attr("font-size", (d: any) => d.type === 'frontier' ? "10px" : "9px")
      .attr("font-weight", (d: any) => d.type === 'frontier' ? "900" : "500")
      .attr("fill", (d: any) => d.type === 'frontier' ? "#000" : "#9ca3af")
      .attr("class", "select-none tracking-tight pointer-events-none group-hover:fill-black transition-colors");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    svg.on("click", () => setSelectedNode(null));

    const handleResize = () => {
      if (!containerRef.current || !svgRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      simulation.force("center", d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.3).restart();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      simulation.stop();
      window.removeEventListener('resize', handleResize);
    };
  }, [nodes, edges]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#fcfcfc] overflow-hidden">
      {/* Legend & Header */}
      <div className="absolute top-8 left-8 flex flex-col gap-5 pointer-events-none z-10">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.5em] font-black text-black">Knowledge Lattice</span>
          <span className="text-[8px] text-gray-300 uppercase tracking-widest font-bold">Scientific Context Mapping</span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-black shadow-sm"></span> 
            <span className="text-[9px] uppercase tracking-[0.2em] text-gray-600 font-bold">Frontier</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full border border-gray-200 bg-white shadow-sm ring-2 ring-blue-50/50"></span> 
            <span className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-medium">Source Material</span>
          </div>
        </div>
      </div>

      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Node Detail Tooltip */}
      {selectedNode && (
        <div 
          className="absolute z-20 animate-in fade-in zoom-in-95 duration-200"
          style={{ left: tooltipPos.x, top: tooltipPos.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          <div className="glass border border-white/60 shadow-[0_20px_60px_rgba(0,0,0,0.08)] rounded-[24px] p-6 w-72 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[9px] uppercase tracking-[0.2em] text-gray-300 font-bold">{selectedNode.type}</div>
              {selectedNode.url && (
                <div className="w-5 h-5 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100/50">
                  <img src={`https://www.google.com/s2/favicons?domain=${new URL(selectedNode.url).hostname}&sz=32`} className="w-3 h-3 grayscale" alt="" />
                </div>
              )}
            </div>
            <div className="text-[14px] font-bold text-black mb-2 leading-snug tracking-tight">{selectedNode.label}</div>
            {selectedNode.description && (
              <div className="text-[11px] text-gray-500 leading-relaxed mb-5 font-light">
                {selectedNode.description}
              </div>
            )}
            {selectedNode.url && (
              <a 
                href={selectedNode.url} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-black text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-lg active:scale-95 group/link"
              >
                Open Source
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
              </a>
            )}
          </div>
          <div className="w-3.5 h-3.5 glass border-r border-b border-white/60 rotate-45 mx-auto -mt-2 shadow-sm"></div>
        </div>
      )}

      {/* Navigation Help */}
      <div className="absolute bottom-10 right-10 flex flex-col items-end gap-2 text-[9px] uppercase tracking-[0.2em] text-gray-200 font-bold pointer-events-none select-none">
        <div>Scroll <span className="text-gray-100">Zoom</span></div>
        <div>Drag <span className="text-gray-100">Pan</span></div>
        <div>Click <span className="text-gray-100">Details</span></div>
      </div>
    </div>
  );
};

export default KnowledgeGraph;