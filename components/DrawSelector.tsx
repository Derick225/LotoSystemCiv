
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DRAW_SCHEDULE, SLOT_CONFIG } from '../constants';
import { useNexus } from './NexusProvider';
import { Clock, Target, Calendar, CheckCircle2, Lock, Zap } from 'lucide-react';

const DAYS_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const DrawSelector: React.FC = () => {
  const { drawName, setDrawName } = useNexus();
  
  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const todayName = DAYS_ORDER[todayIndex];
  
  const [activeDay, setActiveDay] = useState(todayName);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const daysContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const timer = setInterval(() => setCurrentTime(new Date()), 60000);
      return () => clearInterval(timer);
  }, []);

  const getDrawStatus = (timeStr: string) => {
      const dayDiff = DAYS_ORDER.indexOf(activeDay) - todayIndex;
      
      if (dayDiff < 0) return 'closed'; 
      if (dayDiff > 0) return 'future'; 

      const [h, m] = timeStr.split(':').map(Number);
      const drawTime = new Date();
      drawTime.setHours(h, m, 0, 0);
      const now = new Date();
      
      const diffMinutes = (drawTime.getTime() - now.getTime()) / 60000;

      if (diffMinutes < -60) return 'closed'; 
      if (diffMinutes <= 0) return 'live'; 
      if (diffMinutes < 120) return 'next'; 
      return 'upcoming';
  };

  const activeSchedule = useMemo(() => {
      return Object.entries(DRAW_SCHEDULE[activeDay] || {}).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
  }, [activeDay]);

  return (
    <div className="space-y-6 animate-fade-in mb-8">
      {/* Header & Clock */}
      <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-800 rounded-xl shadow-lg border border-slate-700">
                <Calendar size={18} className="text-indigo-400"/>
            </div>
            <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none">Calendrier</h3>
                <p className="text-[10px] text-slate-500 font-bold mt-1">Séquence {activeDay}</p>
            </div>
          </div>
          <div className="text-xs font-mono font-black text-slate-400 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800 shadow-inner flex items-center gap-2">
              <Clock size={12} className="text-indigo-500 animate-pulse"/>
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
      </div>

      {/* Day Navigation */}
      <div ref={daysContainerRef} className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {DAYS_ORDER.map((d) => {
            const isToday = d === todayName;
            const isActive = activeDay === d;
            return (
                <button
                    key={d}
                    onClick={() => setActiveDay(d)}
                    className={`
                        relative px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border flex-shrink-0
                        ${isActive 
                            ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 border-indigo-500 text-white shadow-lg shadow-indigo-600/30 scale-[1.02] z-10' 
                            : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                        }
                    `}
                >
                    {d}
                    {isToday && !isActive && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]"></span>}
                </button>
            );
        })}
      </div>

      {/* Schedule Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activeSchedule.map(([time, name]) => {
            const config = SLOT_CONFIG[time] || { color: 'text-slate-400', icon: '⏱️', label: 'Tirage' };
            const isActive = drawName === name;
            const status = getDrawStatus(time);

            // Dynamic Styling based on Status
            let statusClasses = "border-slate-800 bg-slate-900 opacity-60 grayscale";
            let iconElement = <Lock size={14} className="text-slate-600"/>;
            let labelText = "Terminé";
            let borderColor = "border-transparent";

            if (status === 'live') {
                statusClasses = "border-emerald-500/30 bg-emerald-950/20 shadow-[0_0_30px_rgba(16,185,129,0.1)] opacity-100";
                iconElement = <span className="flex h-2.5 w-2.5 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span></span>;
                labelText = "En Cours";
                borderColor = "border-emerald-500/50";
            } else if (status === 'next') {
                statusClasses = "border-indigo-500/30 bg-indigo-950/20 opacity-100";
                iconElement = <Zap size={14} className="text-amber-400 animate-pulse"/>;
                labelText = "Bientôt";
                borderColor = "border-indigo-500/50";
            } else if (status === 'upcoming') {
                statusClasses = "border-slate-700 bg-slate-900 opacity-100";
                iconElement = <Clock size={14} className="text-slate-500"/>;
                labelText = "À venir";
            } else if (status === 'future') {
                statusClasses = "border-slate-800 bg-slate-900/50 opacity-50";
                iconElement = <Calendar size={14} className="text-slate-600"/>;
                labelText = "Planifié";
            } else if (status === 'closed') {
                statusClasses = "border-slate-800 bg-slate-950 opacity-70";
                iconElement = <CheckCircle2 size={14} className="text-emerald-600"/>;
                labelText = "Clôturé";
            }

            if (isActive) {
                statusClasses = "bg-gradient-to-br from-indigo-600 to-indigo-800 border-indigo-400 text-white shadow-2xl scale-[1.03] z-20 ring-2 ring-indigo-400/50 opacity-100";
                borderColor = "border-indigo-400";
            }

            return (
              <div
                key={name}
                onClick={() => setDrawName(name)}
                className={`
                    p-5 rounded-[2rem] border transition-all duration-300 cursor-pointer group relative overflow-hidden flex flex-col justify-between h-36
                    ${statusClasses} ${!isActive ? borderColor : ''}
                `}
              >
                {/* Background Decor */}
                {isActive && <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/20 rounded-full blur-2xl pointer-events-none"></div>}
                
                <div className="flex justify-between items-start relative z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl filter drop-shadow-md">{config.icon}</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-indigo-200' : config.color}`}>
                                {config.label}
                            </span>
                        </div>
                        <h3 className={`text-lg font-black uppercase tracking-tight leading-none ${isActive ? 'text-white' : 'text-slate-200'}`}>
                            {name}
                        </h3>
                    </div>
                    {isActive && <Target size={24} className="text-white animate-spin-slow" />}
                </div>
                
                <div className={`mt-auto flex justify-between items-center relative z-10 pt-3 border-t ${isActive ? 'border-white/20' : 'border-white/5'}`}>
                    <span className={`font-mono text-xs font-bold flex items-center gap-2 ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {iconElement} {time}
                    </span>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500'}`}>
                        {labelText}
                    </span>
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};
