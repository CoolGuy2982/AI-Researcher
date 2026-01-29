
import React, { useState } from 'react';
import { Experiment } from '../types';
import { createNewExperiment } from '../services/storage';

interface HomeViewProps {
  experiments: Experiment[];
  onCreate: (exp: Experiment) => void;
  onSelect: (id: string) => void;
}

const HomeView: React.FC<HomeViewProps> = ({ experiments, onCreate, onSelect }) => {
  const [inkling, setInkling] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inkling.trim()) return;
    
    const newExp = createNewExperiment(inkling.slice(0, 30) + (inkling.length > 30 ? '...' : ''));
    // We add the first message immediately
    newExp.chatHistory = [{
      id: crypto.randomUUID(),
      role: 'user',
      content: inkling,
      timestamp: Date.now()
    }];
    onCreate(newExp);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 pt-32 pb-20 relative z-10 h-full flex flex-col">
      <div className="mb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-light tracking-tight mb-4 text-gray-900">
          Define your research's direction vector.
        </h1>
        <p className="text-gray-400 text-lg font-light">
          Narrow down your inklings to the frontier.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-20">
        <div className="relative group max-w-2xl mx-auto">
          <input
            autoFocus
            type="text"
            value={inkling}
            onChange={(e) => setInkling(e.target.value)}
            placeholder="Define your research angle, inklings, vibes, etc."
            className="w-full bg-white border-b border-gray-200 py-6 px-1 text-xl sm:text-2xl font-light outline-none focus:border-black transition-colors placeholder:text-gray-300"
          />
          <button 
            type="submit"
            className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </div>
      </form>

      {experiments.length > 0 && (
        <div className="flex-1">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-8">
            Ongoing Vectors
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {experiments.map((exp) => (
              <div 
                key={exp.id}
                onClick={() => onSelect(exp.id)}
                className="group cursor-pointer border border-gray-100 p-6 rounded-xl hover:border-gray-200 hover:bg-gray-50/50 transition-all"
              >
                <div className="text-xs mono text-gray-400 mb-2">
                  {new Date(exp.createdAt).toLocaleDateString()}
                </div>
                <div className="font-medium text-gray-800 line-clamp-2 mb-4 group-hover:text-black">
                  {exp.title}
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${exp.status === 'COMPLETED' ? 'bg-green-400' : 'bg-blue-400'}`}></div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                    {exp.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeView;
