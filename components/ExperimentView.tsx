
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Experiment, ExperimentStatus, Message, GraphNode, GraphEdge } from '../types';
import { createRefinementChat, performDeepResearchStream } from '../services/gemini';
import KnowledgeGraph from './KnowledgeGraph';
import MarkdownRenderer from './MarkdownRenderer';
import { GenerateContentResponse } from "@google/genai";

interface ExperimentViewProps {
  experiment: Experiment;
  onUpdate: (exp: Experiment) => void;
}

const SourceAccordion: React.FC<{ sources: { title: string; uri: string }[] }> = ({ sources }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-6 border border-gray-100 rounded-2xl overflow-hidden glass shadow-sm transition-all duration-300">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-3 text-[9px] uppercase tracking-widest font-bold text-gray-400 hover:bg-white/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`p-0.5 rounded-full bg-black/5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M19 9l-7 7-7-7"/></svg>
          </div>
          Evidence & Citations ({sources.length})
        </div>
      </button>
      {isOpen && (
        <div className="px-3 pb-4 pt-1 flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-300">
          {sources.map((url, i) => {
            const domain = new URL(url.uri).hostname.replace('www.', '');
            return (
              <a 
                key={i} 
                href={url.uri} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white transition-all border border-transparent hover:border-gray-50 group/item"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center group-hover/item:bg-white transition-colors">
                  <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} className="w-4 h-4 grayscale group-hover/item:grayscale-0 transition-all" alt="" />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[11px] text-gray-700 font-medium truncate leading-tight group-hover/item:text-black">
                    {url.title}
                  </span>
                  <span className="text-[9px] text-gray-400 font-medium lowercase tracking-tight">{domain}</span>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-200 group-hover/item:text-gray-400"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ScientificLoader: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-in fade-in duration-1000">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute inset-[-100%] bg-radial-gradient from-gray-50/50 to-transparent blur-[80px] opacity-30 animate-pulse"></div>
        <div className="absolute inset-0 border-[0.5px] border-gray-100 rounded-full animate-spin-extremely-slow">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-[1px] bg-black/20 rounded-full"></div>
        </div>
        <div className="relative w-1 h-1 bg-black rounded-full shadow-[0_0_15px_rgba(0,0,0,0.1)]">
          <div className="absolute inset-[-400%] bg-black/5 rounded-full blur-[15px] animate-breathing-core"></div>
        </div>
      </div>
      <div className="mt-8 text-[9px] mono text-gray-300 uppercase tracking-[0.8em] font-medium animate-pulse select-none">
        Refining
      </div>
    </div>
  );
};

const ExperimentView: React.FC<ExperimentViewProps> = ({ experiment, onUpdate }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const chat = useMemo(() => createRefinementChat(), []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [input]);

  const initialProcessed = useRef(false);
  useEffect(() => {
    if (experiment.chatHistory.length === 1 && experiment.chatHistory[0].role === 'user' && !initialProcessed.current) {
      initialProcessed.current = true;
      processTurn(experiment.chatHistory[0].content);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [experiment.chatHistory, isLoading, experiment.researchProgress]);

  const handleEntityNotFound = async () => {
    const aistudio = (window as any).aistudio;
    if (aistudio?.openSelectKey) {
      await aistudio.openSelectKey();
      onUpdate({
        ...experiment,
        status: ExperimentStatus.DEFINING,
        researchProgress: undefined
      });
      setIsLoading(false);
    }
  };

  const cancelResearch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    onUpdate({
      ...experiment,
      status: ExperimentStatus.DEFINING,
      researchProgress: undefined
    });
    setIsLoading(false);
  };

  const processTurn = async (text: string) => {
    if (isLoading) return;
    setIsLoading(true);
    
    let latestNodes = [...experiment.graphNodes];
    let latestEdges = [...experiment.graphEdges];
    let latestStatus = experiment.status;
    let deepResearchHypothesis = '';

    try {
      let response = await chat.sendMessage({ message: text });
      
      let loopCount = 0;
      const MAX_LOOPS = 8;

      while (loopCount < MAX_LOOPS) {
        const functionCalls = response.functionCalls || [];
        if (functionCalls.length === 0) break;

        const toolResponses = [];
        for (const fc of functionCalls) {
          if (fc.name === 'update_knowledge_graph') {
            const args = fc.args as any;
            if (args.nodes) {
              const nodeMap = new Map(latestNodes.map(n => [n.id, n]));
              args.nodes.forEach((n: GraphNode) => nodeMap.set(n.id, n));
              latestNodes = Array.from(nodeMap.values());
            }
            if (args.edges) {
              const existingIds = new Set(latestNodes.map(n => n.id));
              const validNewEdges = (args.edges as GraphEdge[]).filter(e => 
                existingIds.has(e.source) && existingIds.has(e.target)
              );
              latestEdges = [...latestEdges, ...validNewEdges];
            }
            toolResponses.push({
              id: fc.id,
              name: fc.name,
              response: { result: "Lattice updated." }
            });
          } else if (fc.name === 'initiate_deep_research') {
            const args = fc.args as any;
            deepResearchHypothesis = args.final_hypothesis;
            latestStatus = ExperimentStatus.RESEARCHING;
            toolResponses.push({
              id: fc.id,
              name: fc.name,
              response: { result: "Research Protocol Initiated." }
            });
          }
        }

        onUpdate({
          ...experiment,
          graphNodes: latestNodes,
          graphEdges: latestEdges,
          status: latestStatus,
          lastModifiedAt: Date.now()
        });

        response = await chat.sendMessage({ 
          message: {
            role: 'user',
            parts: toolResponses.map(tr => ({
              functionResponse: { id: tr.id, name: tr.name, response: tr.response }
            }))
          }
        });
        
        loopCount++;
      }

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const resUrls = groundingChunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({
          title: chunk.web.title || chunk.web.uri,
          uri: chunk.web.uri
        }));

      let modelContent = response.text || "Vector refinement continues.";

      const modelMsg: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        content: modelContent,
        timestamp: Date.now(),
        groundingUrls: resUrls
      };

      const finalExp: Experiment = {
        ...experiment,
        chatHistory: [...experiment.chatHistory, modelMsg],
        graphNodes: latestNodes,
        graphEdges: latestEdges,
        status: latestStatus,
        lastModifiedAt: Date.now()
      };

      onUpdate(finalExp);

      if (latestStatus === ExperimentStatus.RESEARCHING) {
        await executeDeepResearch(finalExp, deepResearchHypothesis);
      }
    } catch (err: any) {
      console.error("Turn failure:", err);
      const isRateLimit = err.message?.includes("429") || err.status === 429;
      const isNotFound = err.message?.includes("Requested entity was not found");

      if (isNotFound) {
        await handleEntityNotFound();
        return;
      }

      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        content: isRateLimit 
          ? "The frontier is currently overloaded (Rate Limit Exceeded). Synthesis will resume shortly once the protocol stabilizes." 
          : `Synthesis interrupted: ${err.message || String(err)}. Check project permissions or network.`,
        timestamp: Date.now()
      };
      onUpdate({ ...experiment, chatHistory: [...experiment.chatHistory, errorMsg] });
    } finally {
      setIsLoading(false);
    }
  };

  const executeDeepResearch = async (exp: Experiment, hypothesis: string) => {
    let fullText = "";
    let browsing: string[] = [];
    let thought = "";

    try {
      const aistudio = (window as any).aistudio;
      if (aistudio && !(await aistudio.hasSelectedApiKey())) {
        await handleEntityNotFound();
        return;
      }

      // Stream type is correctly inferred from performDeepResearchStream in services/gemini.ts
      const stream = await performDeepResearchStream(exp.chatHistory.map(m => `${m.role}: ${m.content}`).join('\n'), hypothesis);
      
      try {
        for await (const chunk of stream) {
          if (!chunk) continue;
          
          // Access .text property directly for GenerateContentResponse as per SDK guidelines
          const text = chunk.text;
          if (text) {
            fullText += text;
          }

          const grounding = chunk.candidates?.[0]?.groundingMetadata;
          if (grounding?.groundingChunks) {
            const newUrls = grounding.groundingChunks
              .filter((c: any) => c.web?.uri)
              .map((c: any) => c.web.uri);
            browsing = Array.from(new Set([...browsing, ...newUrls]));
          }

          onUpdate({
            ...exp,
            researchProgress: {
              browsing,
              thoughts: "Autonomous synthesis in progress..." // Thinking summaries are decided by the model internally
            },
            lastModifiedAt: Date.now()
          });
        }
      } catch (streamErr: any) {
        console.warn("Stream interrupted during consumption:", streamErr);
        throw streamErr; 
      }

      onUpdate({
        ...exp,
        status: ExperimentStatus.COMPLETED,
        researchProgress: undefined,
        report: {
          summary: "Frontier Synthesis Complete",
          hypothesis,
          fullContent: fullText || "Autonomous research protocol concluded. Final synthesis refined.",
          citations: browsing
        }
      });
    } catch (err: any) {
      console.error("Deep research failure:", err);
      if (err.message?.includes("Requested entity was not found")) {
        await handleEntityNotFound();
        return;
      }
      onUpdate({ ...exp, status: ExperimentStatus.FAILED });
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const msg: Message = { 
      id: crypto.randomUUID(), 
      role: 'user', 
      content: input, 
      timestamp: Date.now()
    };
    
    onUpdate({ ...experiment, chatHistory: [...experiment.chatHistory, msg] });
    setInput('');
    processTurn(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white overflow-hidden">
      {/* Left Chat Column */}
      <div className="flex-1 flex flex-col border-r border-gray-100 relative bg-white overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 sm:px-12 py-10 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-16 pb-20">
            {experiment.chatHistory.map((msg) => (
              <div key={msg.id} className="group animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div className="text-[8px] mono uppercase tracking-[0.4em] text-gray-300 mb-4 group-hover:text-black transition-colors flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${msg.role === 'user' ? 'bg-gray-100' : 'bg-black/80 shadow-sm'}`}></div>
                  {msg.role === 'user' ? 'Human' : 'Intelligence'}
                </div>
                <div className="text-[16px] font-light leading-relaxed text-gray-800 whitespace-pre-wrap pl-4 border-l border-gray-50 group-hover:border-black/5 transition-all">
                  <MarkdownRenderer content={msg.content} />
                </div>
                {msg.groundingUrls && <SourceAccordion sources={msg.groundingUrls} />}
              </div>
            ))}

            {isLoading && !experiment.researchProgress && (
              <ScientificLoader />
            )}

            {experiment.researchProgress && (
              <div className="p-8 glass rounded-[32px] border border-gray-100 shadow-[0_20px_60px_rgba(0,0,0,0.02)] animate-in zoom-in-98 duration-500 relative overflow-hidden group/card">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gray-50 overflow-hidden">
                  <div className="h-full bg-black/40 animate-progress-minimal w-1/3 rounded-full"></div>
                </div>

                <div className="flex items-start justify-between mb-8">
                  <div className="space-y-1">
                    <div className="text-[9px] uppercase tracking-[0.4em] font-black text-black">Autonomous Synthesis</div>
                    <div className="text-[8px] text-gray-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse"></span>
                      Real-time Browsing
                    </div>
                  </div>
                  <button 
                    onClick={cancelResearch}
                    className="px-4 py-2 bg-black text-white text-[8px] uppercase tracking-widest font-black rounded-full hover:bg-red-600 transition-all active:scale-95 shadow-sm"
                  >
                    Abort Protocol
                  </button>
                </div>

                <div className="space-y-8">
                  {experiment.researchProgress.browsing.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[8px] uppercase tracking-widest text-gray-300 font-bold px-1">Network Sources</div>
                      <div className="flex flex-wrap gap-2">
                        {experiment.researchProgress.browsing.slice(-6).map((url, i) => (
                          <div key={i} className="flex items-center gap-2 px-2.5 py-1 bg-white border border-gray-50 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.01)] animate-in fade-in slide-in-from-right-1">
                            <img src={`https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`} className="w-3 h-3 grayscale opacity-40" alt="" />
                            <span className="text-[9px] text-gray-500 font-medium truncate max-w-[120px]">{new URL(url).hostname}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {experiment.researchProgress.thoughts && (
                    <div className="space-y-3">
                      <div className="text-[8px] uppercase tracking-widest text-gray-300 font-bold px-1">Thinking Process</div>
                      <div className="max-h-24 overflow-y-auto text-[11px] text-gray-400 font-light italic leading-relaxed pl-3 border-l border-gray-100/50">
                        {experiment.researchProgress.thoughts.split('\n').filter(l => l.trim()).slice(-3).map((line, i) => (
                          <p key={i} className="mb-1 opacity-70 line-clamp-2">{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[8px] text-gray-300 font-black uppercase tracking-[0.2em] animate-pulse">Compiling frontier data</span>
                    <span className="text-[8px] text-gray-200 mono">Live</span>
                  </div>
                </div>
              </div>
            )}

            {experiment.report && (
              <div className="bg-white p-10 sm:p-16 rounded-[48px] border border-gray-100 shadow-[0_30px_100px_rgba(0,0,0,0.04)] animate-in slide-in-from-bottom-6 duration-1000">
                <div className="text-[9px] uppercase tracking-[0.6em] font-black text-black mb-12 pb-6 border-b border-gray-50 flex items-center justify-between">
                  Synthesis Report
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-black"></span>
                    <span className="text-[8px] tracking-widest text-gray-400 uppercase">Vector Locked</span>
                  </div>
                </div>
                <div className="mb-16">
                  <h4 className="text-[8px] text-gray-300 uppercase tracking-widest mb-4 font-black">Hypothesis</h4>
                  <p className="text-3xl font-extralight italic leading-tight text-black tracking-tight">
                    "{experiment.report.hypothesis}"
                  </p>
                </div>
                <div className="prose prose-md max-w-none text-gray-700">
                  <MarkdownRenderer content={experiment.report.fullContent} />
                </div>
                {experiment.report.citations && experiment.report.citations.length > 0 && (
                  <div className="mt-16 pt-8 border-t border-gray-50">
                     <h5 className="text-[8px] uppercase tracking-widest text-gray-300 font-bold mb-6">Scientific Citations</h5>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {experiment.report.citations.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100 group">
                             <img src={`https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`} className="w-3.5 h-3.5 grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100" alt="" />
                             <span className="text-[10px] text-gray-500 font-medium truncate">{new URL(url).hostname}</span>
                          </a>
                        ))}
                     </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input Dock */}
        <div className="p-8 pb-12 glass border-t border-gray-50/50">
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            {experiment.status === ExperimentStatus.DEFINING ? (
              <div className="flex flex-col">
                <form onSubmit={handleSend} className="relative group">
                  <textarea
                    ref={textareaRef}
                    autoFocus
                    disabled={isLoading}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Refine the research angle..."
                    className="w-full bg-transparent py-4 pr-12 text-lg font-light outline-none border-b border-gray-100 focus:border-black transition-all placeholder:text-gray-200 resize-none min-h-[56px] overflow-hidden"
                  />
                  <button 
                    type="submit" 
                    disabled={isLoading || !input.trim()} 
                    className="absolute right-0 bottom-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-200 hover:text-black hover:bg-gray-50 transition-all disabled:opacity-0 active:scale-90"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </form>
              </div>
            ) : experiment.status === ExperimentStatus.RESEARCHING ? (
              <div className="text-center py-4 animate-in fade-in duration-1000">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-1.5 h-1.5 bg-black rounded-full shadow-sm animate-pulse"></div>
                  <span className="text-[9px] text-black uppercase tracking-[0.5em] font-black">Frontier Protocol Locked</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Right Graph Column */}
      <div className="w-[48%] bg-[#fcfcfc] overflow-hidden select-none border-l border-gray-50 relative">
        <KnowledgeGraph nodes={experiment.graphNodes} edges={experiment.graphEdges} />
      </div>

      <style>{`
        @keyframes progress-minimal {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .animate-progress-minimal {
          animation: progress-minimal 3.5s infinite cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes breathing-core {
          0%, 100% { transform: scale(0.8); opacity: 0.1; }
          50% { transform: scale(1.4); opacity: 0.3; }
        }
        @keyframes spin-extremely-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-extremely-slow { animation: spin-extremely-slow 30s linear infinite; }
        .animate-breathing-core { animation: breathing-core 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default ExperimentView;
