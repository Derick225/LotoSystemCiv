
import React, { useState } from 'react';
import { DRAW_SCHEDULE, SLOT_CONFIG } from '../constants';
import { useNexus } from './NexusProvider';
import { Clock, Target, Calendar } from 'lucide-react';

export const DrawSelector: React.FC = () => {
  const { drawName, setDrawName } = useNexus();
  const days = Object.keys(DRAW_SCHEDULE);
  // Jour actuel par défaut, mais modifiable
  const [activeDay, setActiveDay] = useState(days[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] || 'Lundi');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-slate-800 rounded-xl"><Calendar size={16} className="text-indigo-400"/></div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Calendrier des Tirages</h3>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
        {days.map(d => (
          <button
            key={d}
            onClick={() => setActiveDay(d)}
            className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeDay === d ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/40 scale-105' : 'bg-slate-900 text-slate-500 hover:text-slate-300 border border-slate-800'}`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(DRAW_SCHEDULE[activeDay]).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([time, name]) => {
            const config = SLOT_CONFIG[time] || { color: 'text-slate-400', icon: '⏱️', label: 'Tirage' };
            const isActive = drawName === name;

            return (
              <div
                key={name}
                onClick={() => setDrawName(name)}
                className={`p-5 rounded-[2rem] border transition-all cursor-pointer group relative overflow-hidden ${isActive ? 'bg-indigo-900/40 border-indigo-500 shadow-2xl ring-1 ring-indigo-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}
              >
                {isActive && <div className="absolute top-0 right-0 p-3"><Target size={16} className="text-indigo-400 animate-pulse" /></div>}
                
                <div className="flex flex-col h-full justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">{config.icon}</span>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${config.color}`}>{config.label}</span>
                        </div>
                        <h3 className="text-lg font-black text-white uppercase tracking-tight leading-none group-hover:translate-x-1 transition-transform">{name}</h3>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
                        <span className="text-slate-400 font-mono text-xs flex items-center gap-1 font-bold">
                            <Clock size={12} /> {time}
                        </span>
                        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-700'}`}></div>
                    </div>
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};
