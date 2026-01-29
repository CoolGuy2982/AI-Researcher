
import { Experiment, ExperimentStatus } from '../types';

const STORAGE_KEY = 'frontier_research_experiments_v2';

export const saveExperiments = (experiments: Experiment[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(experiments));
};

export const getExperiments = (): Experiment[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const createNewExperiment = (initialTitle: string = 'Untitled Exploration'): Experiment => {
  const id = crypto.randomUUID();
  const now = Date.now();
  return {
    id,
    title: initialTitle,
    status: ExperimentStatus.DEFINING,
    createdAt: now,
    lastModifiedAt: now,
    chatHistory: [],
    graphNodes: [],
    graphEdges: []
  };
};
