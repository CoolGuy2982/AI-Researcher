import React, { useState, useEffect } from 'react';
import { FileTreeNode } from '../types';
import { getWorkspaceTree } from '../services/research-api';

interface FileBrowserProps {
  experimentId: string;
  isResearchRunning: boolean;
  onFileSelect: (path: string) => void;
  onRunScript: (path: string) => void;
}

const FileIcon: React.FC<{ name: string }> = ({ name }) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || ''))
    return <span className="text-[10px] opacity-40">IMG</span>;
  if (['py'].includes(ext || ''))
    return <span className="text-[10px] text-blue-400">PY</span>;
  if (['md'].includes(ext || ''))
    return <span className="text-[10px] text-gray-400">MD</span>;
  if (['ipynb'].includes(ext || ''))
    return <span className="text-[10px] text-orange-400">NB</span>;
  if (['json', 'yaml', 'yml'].includes(ext || ''))
    return <span className="text-[10px] text-green-400">CFG</span>;
  if (['csv', 'tsv'].includes(ext || ''))
    return <span className="text-[10px] text-purple-400">DAT</span>;
  if (['sh'].includes(ext || ''))
    return <span className="text-[10px] text-yellow-500">SH</span>;
  return <span className="text-[10px] opacity-30">TXT</span>;
};

const isRunnable = (name: string): boolean => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ['py', 'sh'].includes(ext || '');
};

const TreeNode: React.FC<{
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onFileSelect: (path: string) => void;
  onRunScript: (path: string) => void;
}> = ({ node, depth, selectedPath, onFileSelect, onRunScript }) => {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.type === 'directory') {
    return (
      <div>
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 py-1 px-2 cursor-pointer hover:bg-gray-50 rounded-md transition-colors group"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`text-gray-300 transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="text-[11px] font-semibold text-gray-500 group-hover:text-black transition-colors">
            {node.name}
          </span>
        </div>
        {expanded && node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onFileSelect={onFileSelect}
            onRunScript={onRunScript}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={() => onFileSelect(node.path)}
      className={`flex items-center gap-2 py-1 px-2 cursor-pointer rounded-md transition-all group ${
        selectedPath === node.path
          ? 'bg-black/5 border-l-2 border-black'
          : 'hover:bg-gray-50'
      }`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <FileIcon name={node.name} />
      <span className="text-[11px] mono text-gray-600 group-hover:text-black transition-colors truncate flex-1">
        {node.name}
      </span>
      {isRunnable(node.name) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRunScript(node.path);
          }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded bg-black/5 hover:bg-black hover:text-white text-gray-400 transition-all"
          title="Run"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
      )}
    </div>
  );
};

const FileBrowser: React.FC<FileBrowserProps> = ({ experimentId, isResearchRunning, onFileSelect, onRunScript }) => {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTree = async () => {
    try {
      const t = await getWorkspaceTree(experimentId);
      setTree(t);
    } catch { /* workspace may not exist yet */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchTree();
  }, [experimentId]);

  // Auto-refresh during research
  useEffect(() => {
    if (!isResearchRunning) return;
    const interval = setInterval(fetchTree, 5000);
    return () => clearInterval(interval);
  }, [isResearchRunning, experimentId]);

  const handleFileSelect = (path: string) => {
    setSelectedPath(path);
    onFileSelect(path);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[9px] text-gray-300 uppercase tracking-[0.4em] font-bold animate-pulse">Loading workspace</span>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <span className="text-[9px] text-gray-300 uppercase tracking-[0.4em] font-bold">No files yet</span>
        <span className="text-[10px] text-gray-200">Files will appear here as research progresses</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <span className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400">Workspace</span>
        <button
          onClick={fetchTree}
          className="text-[9px] text-gray-300 hover:text-black transition-colors uppercase tracking-wider font-bold"
        >
          Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onFileSelect={handleFileSelect}
            onRunScript={onRunScript}
          />
        ))}
      </div>
    </div>
  );
};

export default FileBrowser;
