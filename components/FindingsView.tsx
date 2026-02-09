import React, { useState, useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { getFindings } from '../services/research-api';

interface FindingsViewProps {
  experimentId: string;
  isResearchRunning: boolean;
}

const FindingsView: React.FC<FindingsViewProps> = ({ experimentId, isResearchRunning }) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFindings = async () => {
    try {
      const findings = await getFindings(experimentId);
      setContent(findings);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchFindings();
  }, [experimentId]);

  // Poll during research
  useEffect(() => {
    if (!isResearchRunning) return;
    const interval = setInterval(fetchFindings, 3000);
    return () => clearInterval(interval);
  }, [isResearchRunning, experimentId]);

  // Final fetch after research completes
  useEffect(() => {
    if (!isResearchRunning) {
      fetchFindings();
    }
  }, [isResearchRunning]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[9px] text-gray-300 uppercase tracking-[0.4em] font-bold animate-pulse">Loading findings</span>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-200">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <span className="text-[9px] text-gray-300 uppercase tracking-[0.4em] font-bold">No findings yet</span>
        <span className="text-[10px] text-gray-200 max-w-[200px] text-center">
          The research agent will write findings.md as it makes progress
        </span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-50 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <span className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400">Findings</span>
        {isResearchRunning && (
          <span className="flex items-center gap-1.5 text-[8px] text-gray-300 uppercase tracking-widest font-bold">
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse"></span>
            Updating
          </span>
        )}
      </div>
      <div className="p-6 max-w-3xl mx-auto">
        <MarkdownRenderer content={content} experimentId={experimentId} />
      </div>
    </div>
  );
};

export default FindingsView;
