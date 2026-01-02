
import React, { useState } from 'react';
import { DRAW_SCHEDULE } from '../constants';
import { useNexus } from './NexusProvider';
import { Clock, Target } from 'lucide-react';

export const DrawSelector: React.FC = () => {
  const { drawName, setDrawName } = useNexus();
  const days = Object.keys(DRAW_SCHEDULE);
  const [activeDay, setActiveDay] = useState(days[new Date().getDay() - 1] || 'Lundi');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
        {days.map(d => (
          <button
            key={d}
            onClick={() => setActiveDay(d)}
            className={`px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeDay === d ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/40' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(DRAW_SCHEDULE[activeDay]).map(([time, name]) => (
          <div
            key={name}
            onClick={() => setDrawName(name)}
            className={`p-6 rounded-[2.5rem] border transition-all cursor-pointer group ${drawName === name ? 'bg-indigo-900/30 border-indigo-500 shadow-2xl' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}
          >
            <div className="flex justify-between items-start mb-4">
              <span className="text-indigo-400 font-mono text-xs flex items-center gap-1">
                <Clock size={12} /> {time}
              </span>
              {drawName === name && <Target size={14} className="text-indigo-500 animate-pulse" />}
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight group-hover:translate-x-1 transition-transform">{name}</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase mt-2 tracking-widest">Tensor Vector Active</p>
          </div>
        ))}
      </div>
    </div>
  );
};
