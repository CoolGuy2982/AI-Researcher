
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
}
