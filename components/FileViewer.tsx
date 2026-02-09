import React, { useState, useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { readWorkspaceFile } from '../services/research-api';

interface FileViewerProps {
  experimentId: string;
  filePath: string;
  onClose: () => void;
  onRun?: () => void;
}

const FileViewer: React.FC<FileViewerProps> = ({ experimentId, filePath, onClose, onRun }) => {
  const [content, setContent] = useState<string>('');
  const [mimeType, setMimeType] = useState<string>('text/plain');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ext = filePath.split('.').pop()?.toLowerCase();
  const isScript = ['py', 'sh'].includes(ext || '');
  const isMarkdown = ext === 'md';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '');

  useEffect(() => {
    setLoading(true);
    setError(null);
    readWorkspaceFile(experimentId, filePath)
      .then(({ content: c, mimeType: m }) => {
        setContent(c);
        setMimeType(m);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [experimentId, filePath]);

  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-black transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[11px] mono text-gray-600 truncate">{filePath}</span>
        </div>
        {isScript && onRun && (
          <button
            onClick={onRun}
            className="px-3 py-1.5 bg-black text-white text-[8px] uppercase tracking-widest font-black rounded-full hover:bg-gray-800 transition-all active:scale-95 flex items-center gap-1.5"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            Run
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="text-[9px] text-gray-300 uppercase tracking-[0.4em] font-bold animate-pulse">Loading</span>
          </div>
        )}

        {error && (
          <div className="p-6 text-center">
            <span className="text-[11px] text-red-400">{error}</span>
          </div>
        )}

        {!loading && !error && isImage && (
          <div className="p-6 flex items-center justify-center">
            <img src={content} alt={fileName} className="max-w-full max-h-[600px] rounded-lg shadow-sm" />
          </div>
        )}

        {!loading && !error && isMarkdown && (
          <div className="p-6 max-w-3xl mx-auto">
            <MarkdownRenderer content={content} experimentId={experimentId} />
          </div>
        )}

        {!loading && !error && !isImage && !isMarkdown && (
          <pre className="p-4 text-[12px] mono leading-relaxed text-gray-700 whitespace-pre-wrap overflow-x-auto">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
};

export default FileViewer;
