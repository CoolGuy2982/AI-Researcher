import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Experiment, ExperimentStatus, ResearchExecutionStatus, Message, GraphNode, GraphEdge, ToolActivity, CliStreamEvent } from '../types';
import { createRefinementChat, performDeepResearchStream } from '../services/gemini';
import { startResearch, sendResearchChat, abortResearch, getFindings, executeScript } from '../services/research-api';
import KnowledgeGraph from './KnowledgeGraph';
import MarkdownRenderer from './MarkdownRenderer';
import FileBrowser from './FileBrowser';
import FileViewer from './FileViewer';
import FindingsView from './FindingsView';
import ToolActivityFeed from './ToolActivityFeed';

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
              <a key={i} href={url.uri} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white transition-all border border-transparent hover:border-gray-50 group/item">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center group-hover/item:bg-white transition-colors">
                  <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} className="w-4 h-4 grayscale group-hover/item:grayscale-0 transition-all" alt="" />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[11px] text-gray-700 font-medium truncate leading-tight group-hover/item:text-black">{url.title}</span>
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

const ScientificLoader: React.FC = () => (
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
    <div className="mt-8 text-[9px] mono text-gray-300 uppercase tracking-[0.8em] font-medium animate-pulse select-none">Refining</div>
  </div>
);

const TerminalOutput: React.FC<{ lines: { stream: string; line: string }[]; exitCode: number | null; onClose: () => void }> = ({ lines, exitCode, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [lines]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-gray-950 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
          <span className="text-[10px] mono text-gray-400 uppercase tracking-wider">Terminal Output</span>
          <div className="flex items-center gap-3">
            {exitCode !== null && <span className={`text-[9px] mono ${exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>exit: {exitCode}</span>}
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>
        <div ref={scrollRef} className="p-4 max-h-[400px] overflow-y-auto">
          {lines.map((l, i) => (<div key={i} className={`text-[12px] mono leading-relaxed ${l.stream === 'stderr' ? 'text-red-400' : 'text-green-300'}`}>{l.line}</div>))}
          {exitCode === null && <div className="text-[12px] mono text-gray-500 animate-pulse">Running...</div>}
        </div>
      </div>
    </div>
  );
};

type RightPanel = 'graph' | 'workspace' | 'findings';

const ExperimentView: React.FC<ExperimentViewProps> = ({ experiment, onUpdate }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeReaderRef = useRef<ReadableStreamDefaultReader<CliStreamEvent> | null>(null);

  const chat = useMemo(() => createRefinementChat(), []);
  const [rightPanel, setRightPanel] = useState<RightPanel>('graph');
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<{ lines: { stream: string; line: string }[]; exitCode: number | null } | null>(null);

  const isResearchRunning = experiment.executionStatus === ResearchExecutionStatus.RUNNING;

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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [experiment.chatHistory, isLoading, toolActivities, experiment.researchProgress]);

  const handleEntityNotFound = async () => {
    const aistudio = (window as any).aistudio;
    if (aistudio?.openSelectKey) {
      await aistudio.openSelectKey();
      onUpdate({ ...experiment, status: ExperimentStatus.DEFINING, researchProgress: undefined });
      setIsLoading(false);
    }
  };

  const cancelResearch = async () => {
    try { await abortResearch(experiment.id); } catch { }
    onUpdate({ ...experiment, status: ExperimentStatus.DEFINING, executionStatus: ResearchExecutionStatus.ABORTED, researchProgress: undefined });
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
              const ids = new Set(latestNodes.map(n => n.id));
              const valid = (args.edges as GraphEdge[]).filter(e => ids.has(e.source) && ids.has(e.target));
              latestEdges = [...latestEdges, ...valid];
            }
            toolResponses.push({ id: fc.id, name: fc.name, response: { result: "Lattice updated." } });
          } else if (fc.name === 'initiate_deep_research') {
            deepResearchHypothesis = (fc.args as any).final_hypothesis;
            latestStatus = ExperimentStatus.RESEARCHING;
            toolResponses.push({ id: fc.id, name: fc.name, response: { result: "Research Protocol Initiated." } });
          }
        }

        onUpdate({ ...experiment, graphNodes: latestNodes, graphEdges: latestEdges, status: latestStatus, lastModifiedAt: Date.now() });
        response = await chat.sendMessage({ message: { role: 'user', parts: toolResponses.map(tr => ({ functionResponse: { id: tr.id, name: tr.name, response: tr.response } })) } });
        loopCount++;
      }

      const modelMsg: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        content: response.text || "Vector refinement continues.",
        timestamp: Date.now(),
        groundingUrls: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter((c: any) => c.web).map((c: any) => ({ title: c.web.title || c.web.uri, uri: c.web.uri }))
      };

      const finalExp: Experiment = { ...experiment, chatHistory: [...experiment.chatHistory, modelMsg], graphNodes: latestNodes, graphEdges: latestEdges, status: latestStatus, lastModifiedAt: Date.now() };
      onUpdate(finalExp);

      if (latestStatus === ExperimentStatus.RESEARCHING) {
        await executeDeepResearch(finalExp, deepResearchHypothesis);
      }
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) { await handleEntityNotFound(); return; }
      onUpdate({ ...experiment, chatHistory: [...experiment.chatHistory, { id: crypto.randomUUID(), role: 'model', content: `Synthesis interrupted: ${err.message || String(err)}`, timestamp: Date.now() }] });
    } finally {
      setIsLoading(false);
    }
  };

  const executeDeepResearch = async (exp: Experiment, hypothesis: string) => {
    let fullText = "";
    let thoughts = "";

    try {
      const aistudio = (window as any).aistudio;
      if (aistudio && !(await aistudio.hasSelectedApiKey())) { await handleEntityNotFound(); return; }

      const stream = await performDeepResearchStream(exp.chatHistory.map(m => `${m.role}: ${m.content}`).join('\n'), hypothesis);
      
      for await (const chunk of stream) {
        if (!chunk) continue;
        
        // Handle Interactions API chunk structure
        if (chunk.event_type === 'content.delta') {
          if (chunk.delta.type === 'text') {
            fullText += chunk.delta.text;
          } else if (chunk.delta.type === 'thought_summary') {
            thoughts = chunk.delta.content?.text || thoughts;
          }
        }

        onUpdate({
          ...exp,
          researchProgress: { browsing: [], thoughts: thoughts || "Autonomous synthesis in progress..." },
          lastModifiedAt: Date.now()
        });
      }

      const finalWithReport: Experiment = {
        ...exp,
        researchProgress: undefined,
        report: {
          summary: "Frontier Synthesis Complete",
          hypothesis,
          fullContent: fullText || "Autonomous research protocol concluded. Synthesis refined.",
          citations: []
        },
        lastModifiedAt: Date.now()
      };

      onUpdate(finalWithReport);
      await executeResearch(finalWithReport, hypothesis);

    } catch (err: any) {
      console.error("Deep research failure:", err);
      onUpdate({ ...exp, status: ExperimentStatus.FAILED });
    }
  };

  const consumeEventStream = async (stream: ReadableStream<CliStreamEvent>, exp: Experiment) => {
    if (activeReaderRef.current) try { activeReaderRef.current.cancel(); } catch { }
    const reader = stream.getReader();
    activeReaderRef.current = reader;

    try {
      while (true) {
        const { done, value: event } = await reader.read();
        if (done) break;

        switch (event.type) {
          case 'init':
            onUpdate({ ...exp, cliSessionId: event.session_id || undefined, executionStatus: ResearchExecutionStatus.RUNNING });
            setRightPanel('workspace');
            break;
          case 'tool_use':
            setToolActivities(prev => [...prev, { id: event.tool_id || crypto.randomUUID(), toolName: event.tool_name || 'unknown', parameters: event.parameters, status: 'running', startedAt: Date.now() }]);
            break;
          case 'tool_result':
            setToolActivities(prev => prev.map(a => a.id === event.tool_id ? { ...a, status: (event.status === 'success' ? 'success' : 'error') as any, output: event.output, completedAt: Date.now() } : a));
            break;
          case 'message':
            if (event.role === 'assistant' && event.content) {
              exp = { ...exp, chatHistory: [...exp.chatHistory, { id: crypto.randomUUID(), role: 'model', content: event.content, timestamp: Date.now() }], lastModifiedAt: Date.now() };
              onUpdate(exp);
            }
            break;
          case 'done':
            const finalStatus = event.status === 'completed' ? ResearchExecutionStatus.COMPLETED : ResearchExecutionStatus.FAILED;
            const findings = await getFindings(exp.id);
            onUpdate({ ...exp, executionStatus: finalStatus, status: finalStatus === ResearchExecutionStatus.COMPLETED ? ExperimentStatus.COMPLETED : ExperimentStatus.FAILED, findingsContent: findings || undefined, lastModifiedAt: Date.now() });
            if (findings) setRightPanel('findings');
            break;
        }
      }
    } finally {
      reader.releaseLock();
      if (activeReaderRef.current === reader) activeReaderRef.current = null;
    }
  };

  const executeResearch = async (exp: Experiment, hypothesis: string) => {
    setToolActivities([]);
    try {
      const chatSummary = exp.chatHistory.map(m => `${m.role === 'user' ? 'Human' : 'AI'}: ${m.content}`).join('\n\n') + (exp.report ? `\n\nSYNTHESIS REPORT:\n${exp.report.fullContent}` : '');
      onUpdate({ ...exp, executionStatus: ResearchExecutionStatus.RUNNING });
      const stream = await startResearch({ experimentId: exp.id, hypothesis, experimentTitle: exp.title, chatSummary });
      await consumeEventStream(stream, exp);
    } catch (err: any) {
      onUpdate({ ...exp, executionStatus: ResearchExecutionStatus.FAILED, status: ExperimentStatus.FAILED });
    }
  };

  const handleResearchChat = async (message: string) => {
    if (!message.trim()) return;
    setIsLoading(true);
    const updatedExp = { ...experiment, chatHistory: [...experiment.chatHistory, { id: crypto.randomUUID(), role: 'user', content: message, timestamp: Date.now() }] };
    onUpdate(updatedExp);
    try {
      const stream = await sendResearchChat(experiment.id, message, experiment.cliSessionId);
      await consumeEventStream(stream, updatedExp);
    } catch (err: any) {
      onUpdate({ ...updatedExp, chatHistory: [...updatedExp.chatHistory, { id: crypto.randomUUID(), role: 'model', content: `Error: ${err.message}`, timestamp: Date.now() }] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunScript = async (scriptPath: string) => {
    const command = scriptPath.endsWith('.sh') ? `sh ${scriptPath}` : `python ${scriptPath}`;
    setTerminalOutput({ lines: [], exitCode: null });
    try {
      const stream = await executeScript(experiment.id, command);
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.stream === 'exit') setTerminalOutput(prev => prev ? { ...prev, exitCode: (value as any).code } : null);
        else setTerminalOutput(prev => prev ? { ...prev, lines: [...prev.lines, value] } : null);
      }
    } catch (err: any) {
      setTerminalOutput(prev => prev ? { ...prev, lines: [...prev.lines, { stream: 'stderr', line: err.message }], exitCode: -1 } : null);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || (isLoading && !isResearchRunning)) return;
    if (experiment.status === ExperimentStatus.RESEARCHING || experiment.status === ExperimentStatus.COMPLETED) handleResearchChat(input);
    else {
      onUpdate({ ...experiment, chatHistory: [...experiment.chatHistory, { id: crypto.randomUUID(), role: 'user', content: input, timestamp: Date.now() }] });
      processTurn(input);
    }
    setInput('');
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white overflow-hidden">
      <div className="flex-1 flex flex-col border-r border-gray-100 relative bg-white overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 sm:px-12 py-10 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-16 pb-20">
            {experiment.chatHistory.map((msg) => (
              <div key={msg.id} className="group animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div className="text-[8px] mono uppercase tracking-[0.4em] text-gray-300 mb-4 flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${msg.role === 'user' ? 'bg-gray-100' : 'bg-black/80 shadow-sm'}`}></div>
                  {msg.role === 'user' ? 'Human' : 'Intelligence'}
                </div>
                <div className="text-[16px] font-light leading-relaxed text-gray-800 whitespace-pre-wrap pl-4 border-l border-gray-50 group-hover:border-black/5 transition-all">
                  <MarkdownRenderer content={msg.content} />
                </div>
                {msg.groundingUrls && <SourceAccordion sources={msg.groundingUrls} />}
              </div>
            ))}

            {isLoading && toolActivities.length === 0 && !isResearchRunning && !experiment.researchProgress && <ScientificLoader />}

            {experiment.researchProgress && (
              <div className="p-8 glass rounded-[32px] border border-gray-100 shadow-sm animate-in zoom-in-98 duration-500 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gray-50 overflow-hidden">
                  <div className="h-full bg-black/40 animate-progress-minimal w-1/3 rounded-full"></div>
                </div>
                <div className="text-[9px] uppercase tracking-[0.4em] font-black text-black mb-4">Autonomous Synthesis</div>
                <div className="text-[12px] text-gray-500 font-light italic leading-relaxed">
                  {experiment.researchProgress.thoughts}
                </div>
              </div>
            )}

            {(isResearchRunning || toolActivities.length > 0) && <ToolActivityFeed activities={toolActivities} />}

            {experiment.report && (
              <div className="bg-white p-10 sm:p-16 rounded-[48px] border border-gray-100 shadow-sm animate-in slide-in-from-bottom-6 duration-1000">
                <div className="text-[9px] uppercase tracking-[0.6em] font-black text-black mb-8 pb-6 border-b border-gray-50">Synthesis Report</div>
                <div className="prose prose-md max-w-none text-gray-700">
                  <MarkdownRenderer content={experiment.report.fullContent} />
                </div>
              </div>
            )}

            {experiment.findingsContent && experiment.status === ExperimentStatus.COMPLETED && (
              <div className="bg-white p-10 sm:p-16 rounded-[48px] border border-gray-100 shadow-sm animate-in slide-in-from-bottom-6 duration-1000">
                <div className="text-[9px] uppercase tracking-[0.6em] font-black text-black mb-8 pb-6 border-b border-gray-50">Research Findings</div>
                <div className="prose prose-md max-w-none text-gray-700">
                  <MarkdownRenderer content={experiment.findingsContent} experimentId={experiment.id} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-8 pb-12 glass border-t border-gray-50/50">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSend} className="relative group">
              <textarea
                ref={textareaRef}
                autoFocus
                disabled={isLoading && !isResearchRunning}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
                placeholder="Message the research agent..."
                className="w-full bg-transparent py-4 pr-12 text-lg font-light outline-none border-b border-gray-100 focus:border-black transition-all placeholder:text-gray-200 resize-none min-h-[56px] overflow-hidden"
              />
              <button type="submit" disabled={(isLoading && !isResearchRunning) || !input.trim()} className="absolute right-0 bottom-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-200 hover:text-black hover:bg-gray-50 transition-all disabled:opacity-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="w-[48%] bg-[#fcfcfc] overflow-hidden select-none border-l border-gray-50 relative flex flex-col">
        <div className="flex items-center gap-0 border-b border-gray-100 bg-white">
          {(['graph', 'workspace', 'findings'] as RightPanel[]).map((tab) => (
            <button key={tab} onClick={() => { setRightPanel(tab); setSelectedFile(null); }} className={`flex-1 py-3 text-[9px] uppercase tracking-[0.3em] font-bold transition-all border-b-2 ${rightPanel === tab ? 'text-black border-black' : 'text-gray-300 border-transparent hover:text-gray-500'}`}>
              {tab === 'graph' ? 'Knowledge Lattice' : tab === 'workspace' ? 'Workspace' : 'Findings'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {rightPanel === 'graph' && <KnowledgeGraph nodes={experiment.graphNodes} edges={experiment.graphEdges} />}
          {rightPanel === 'workspace' && !selectedFile && <FileBrowser experimentId={experiment.id} isResearchRunning={isResearchRunning} onFileSelect={setSelectedFile} onRunScript={handleRunScript} />}
          {rightPanel === 'workspace' && selectedFile && <FileViewer experimentId={experiment.id} filePath={selectedFile} onClose={() => setSelectedFile(null)} onRun={() => handleRunScript(selectedFile)} />}
          {rightPanel === 'findings' && <FindingsView experimentId={experiment.id} isResearchRunning={isResearchRunning} />}
        </div>
      </div>

      {terminalOutput && <TerminalOutput lines={terminalOutput.lines} exitCode={terminalOutput.exitCode} onClose={() => setTerminalOutput(null)} />}

      <style>{`
        @keyframes progress-minimal { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .animate-progress-minimal { animation: progress-minimal 3.5s infinite cubic-bezier(0.4, 0, 0.2, 1); }
        @keyframes breathing-core { 0%, 100% { transform: scale(0.8); opacity: 0.1; } 50% { transform: scale(1.4); opacity: 0.3; } }
        .animate-breathing-core { animation: breathing-core 6s ease-in-out infinite; }
        @keyframes spin-extremely-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-extremely-slow { animation: spin-extremely-slow 30s linear infinite; }
      `}</style>
    </div>
  );
};

export default ExperimentView;