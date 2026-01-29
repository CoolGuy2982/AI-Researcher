
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import AsciiBackground from './components/AsciiBackground';
import HomeView from './components/HomeView';
import ExperimentView from './components/ExperimentView';
import { Experiment } from './types';
import { getExperiments, saveExperiments } from './services/storage';

const App: React.FC = () => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(null);

  useEffect(() => {
    setExperiments(getExperiments());
  }, []);

  const handleUpdateExperiments = (updated: Experiment[]) => {
    setExperiments(updated);
    saveExperiments(updated);
  };

  const handleCreateExperiment = (newExp: Experiment) => {
    const updated = [newExp, ...experiments];
    handleUpdateExperiments(updated);
    setActiveExperimentId(newExp.id);
  };

  const activeExperiment = experiments.find(e => e.id === activeExperimentId);

  return (
    <Layout 
      onHomeClick={() => setActiveExperimentId(null)}
      title={activeExperiment ? activeExperiment.title : "Frontier"}
    >
      {!activeExperimentId ? (
        <>
          <AsciiBackground />
          <HomeView 
            experiments={experiments} 
            onCreate={handleCreateExperiment}
            onSelect={setActiveExperimentId}
          />
        </>
      ) : (
        activeExperiment && (
          <ExperimentView 
            experiment={activeExperiment}
            onUpdate={(updatedExp) => {
              const newList = experiments.map(e => e.id === updatedExp.id ? updatedExp : e);
              handleUpdateExperiments(newList);
            }}
          />
        )
      )}
    </Layout>
  );
};

export default App;
