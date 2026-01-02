
import React from 'react';
import { useNexus } from '../NexusProvider';
import { getNextScheduledDraw } from '../../services/lotteryService';
import { Zap, Clock, TrendingUp, AlertTriangle } from 'lucide-react';

export const MarqueeTicker: React.FC = () => {
    const { history, volatility, regime } = useNexus();
    
    if (history.length === 0) return null;

    const lastDraw = history[0];
    const nextDraw = getNextScheduledDraw();
    const nextTime = nextDraw ? `${nextDraw.time} (${nextDraw.name})` : 'Demain';

    const items = [
        { icon: <Zap size={12} className="text-amber-400"/>, text: `DERNIER: ${lastDraw.drawName.toUpperCase()} [ ${lastDraw.gagnants.join('-')} ]`, color: 'text-white' },
        { icon: <Clock size={12} className="text-indigo-400"/>, text: `PROCHAIN: ${nextTime}`, color: 'text-indigo-200' },
        { icon: <TrendingUp size={12} className="text-emerald-400"/>, text: `RÉGIME: ${regime?.regime || 'CALIBRATION'}`, color: 'text-emerald-200' },
        { icon: <AlertTriangle size={12} className="text-rose-400"/>, text: `VOLATILITÉ: ${volatility?.score || 0}%`, color: volatility?.score && volatility.score > 60 ? 'text-rose-300' : 'text-slate-400' }
    ];

    return (
        <div className="bg-slate-950 border-y border-white/5 h-8 flex items-center overflow-hidden relative z-40">
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-950 to-transparent z-10"></div>
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent z-10"></div>
            
            <div className="animate-marquee whitespace-nowrap flex items-center gap-12 px-4">
                {[...items, ...items, ...items].map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${item.color}`}>
                        {item.icon}
                        <span>{item.text}</span>
                    </div>
                ))}
            </div>
            <style>{`
                .animate-marquee { animation: marquee 30s linear infinite; }
                @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-33.33%); } }
            `}</style>
        </div>
    );
};
