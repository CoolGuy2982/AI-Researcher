import React, { useState } from 'react';
import { ToolActivity } from '../types';

interface ToolActivityFeedProps {
  activities: ToolActivity[];
}

const ToolBadge: React.FC<{ name: string }> = ({ name }) => {
  const colors: Record<string, string> = {
    'run_shell_command': 'bg-gray-900 text-white',
    'Bash': 'bg-gray-900 text-white',
    'write_file': 'bg-blue-50 text-blue-600',
    'read_file': 'bg-green-50 text-green-600',
    'edit_file': 'bg-yellow-50 text-yellow-700',
    'google_web_search': 'bg-purple-50 text-purple-600',
    'web_fetch': 'bg-indigo-50 text-indigo-600',
  };
  const colorClass = colors[name] || 'bg-gray-50 text-gray-600';

  return (
    <span className={`px-2 py-0.5 rounded text-[8px] mono uppercase tracking-wider font-bold ${colorClass}`}>
      {name.replace('run_shell_command', 'shell')}
    </span>
  );
};

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'running') {
    return <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />;
  }
  if (status === 'success') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-400">
        <polyline points="20,6 9,17 4,12" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-red-400">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
};

const ActivityItem: React.FC<{ activity: ToolActivity }> = ({ activity }) => {
  const [expanded, setExpanded] = useState(false);

  const paramStr = activity.parameters
    ? Object.entries(activity.parameters)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ')
    : '';

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 rounded-xl border border-gray-50 hover:border-gray-100 transition-colors animate-in fade-in slide-in-from-right-1 duration-300"
    >
      <div className="flex items-center gap-2">
        <StatusDot status={activity.status} />
        <ToolBadge name={activity.toolName} />
        {paramStr && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[9px] mono text-gray-300 hover:text-gray-600 truncate max-w-[200px] transition-colors"
          >
            {paramStr}
          </button>
        )}
      </div>
      {expanded && activity.output && (
        <pre className="mt-1 ml-5 text-[10px] mono text-gray-400 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed bg-gray-50 p-2 rounded-lg">
          {activity.output.slice(0, 2000)}
        </pre>
      )}
    </div>
  );
};

const ToolActivityFeed: React.FC<ToolActivityFeedProps> = ({ activities }) => {
  if (activities.length === 0) {
    return (
      <div className="p-8 glass rounded-[32px] border border-gray-100 shadow-[0_20px_60px_rgba(0,0,0,0.02)] animate-in zoom-in-98 duration-500 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gray-50 overflow-hidden">
          <div className="h-full bg-black/40 animate-progress-minimal w-1/3 rounded-full"></div>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-black rounded-full shadow-sm animate-pulse"></div>
            <span className="text-[9px] text-black uppercase tracking-[0.5em] font-black">Initializing Research Agent</span>
          </div>
        </div>
      </div>
    );
  }

  const runningCount = activities.filter(a => a.status === 'running').length;
  const completedCount = activities.filter(a => a.status === 'success').length;

  return (
    <div className="p-6 glass rounded-[32px] border border-gray-100 shadow-[0_20px_60px_rgba(0,0,0,0.02)] animate-in zoom-in-98 duration-500 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gray-50 overflow-hidden">
        <div className="h-full bg-black/40 animate-progress-minimal w-1/3 rounded-full"></div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-[0.4em] font-black text-black">Research Agent</div>
          <div className="text-[8px] text-gray-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
            {runningCount > 0 && <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse"></span>}
            {completedCount} steps completed{runningCount > 0 ? ` · ${runningCount} running` : ''}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {activities.slice(-15).map((activity) => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
};

export default ToolActivityFeed;
