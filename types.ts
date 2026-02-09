
export enum ExperimentStatus {
  DEFINING = 'DEFINING',
  RESEARCHING = 'RESEARCHING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'paper' | 'formula' | 'frontier';
  url?: string;
  description?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  id: string;
  timestamp: number;
  groundingUrls?: { title: string; uri: string }[];
  isToolMessage?: boolean;
}

export interface ResearchProgress {
  browsing: string[];
  thoughts: string;
}

export interface ResearchReport {
  summary: string;
  hypothesis: string;
  fullContent: string;
  citations: string[];
}

export interface Experiment {
  id: string;
  title: string;
  status: ExperimentStatus;
  createdAt: number;
  lastModifiedAt: number;
  chatHistory: Message[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  report?: ResearchReport;
  researchProgress?: ResearchProgress;
  executionStatus?: ResearchExecutionStatus;
  cliSessionId?: string;
  findingsContent?: string;
}

// === CLI-backed research types ===

export enum ResearchExecutionStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ABORTED = 'ABORTED',
}

export interface CliStreamEvent {
  type: 'init' | 'message' | 'tool_use' | 'tool_result' | 'error' | 'result' | 'done' | 'aborted';
  timestamp?: string;
  session_id?: string;
  model?: string;
  role?: 'user' | 'assistant';
  content?: string;
  delta?: boolean;
  tool_name?: string;
  tool_id?: string;
  parameters?: Record<string, any>;
  status?: string;
  output?: string;
  stats?: Record<string, any>;
  message?: string;
  exitCode?: number | null;
  [key: string]: any;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  size?: number;
  modifiedAt?: number;
}

export interface ToolActivity {
  id: string;
  toolName: string;
  parameters?: Record<string, any>;
  status: 'running' | 'success' | 'error';
  output?: string;
  startedAt: number;
  completedAt?: number;
}
