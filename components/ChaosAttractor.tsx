
import React, { useMemo } from 'react';
import { DrawResult } from '../types';
import { Activity, Wind, AlertTriangle, ShieldCheck, Gauge } from 'lucide-react';
import { useNexus } from './NexusProvider';

interface ChaosAttractorProps {
    history: DrawResult[];
}

export const ChaosAttractor: React.FC<ChaosAttractorProps> = ({ history }) => {
    const { regime, volatility } = useNexus();
    
    const turbulence = volatility?.score || 50;
    
    const status = useMemo(() => {
        if (turbulence > 75) return { 
            label: "TEMPÊTE (Hasard pur)", 
            color: "text-rose-500", 
            bg: "bg-rose-500/10",
            desc: "Le jeu est imprévisible. Évitez les grosses mises.",
            icon: <AlertTriangle className="text-rose-500" size={32} />
        };
        if (turbulence > 40) return { 
            label: "BRÈSE (Variable)", 
            color: "text-indigo-400", 
            bg: "bg-indigo-500/10",
            desc: "Le jeu alterne entre logique et surprise.",
            icon: <Wind className="text-indigo-400" size={32} />
        };
        return { 
            label: "CALME (Régularité)", 
            color: "text-emerald-500", 
            bg: "bg-emerald-500/10",
            desc: "Les patterns historiques sont respectés. Idéal pour l'IA.",
            icon: <ShieldCheck className="text-emerald-500" size={32} />
        };
    }, [turbulence]);

    return (
        <div className="bg-slate-950 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden p-8">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                    <Gauge size={16} className="text-indigo-400" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Moniteur de Turbulence</span>
                </div>
            </div>

            <div className="flex flex-col items-center text-center space-y-6">
                <div className={`p-6 rounded-full ${status.bg} shadow-2xl relative group`}>
                    <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-500/20 animate-spin-slow"></div>
                    {status.icon}
                </div>

                <div>
                    <h3 className={`text-2xl font-black uppercase tracking-tighter ${status.color}`}>
                        {status.label}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2 font-medium max-w-[200px] mx-auto leading-relaxed">
                        {status.desc}
                    </p>
                </div>

                <div className="w-full space-y-2">
                    <div className="flex justify-between text-[8px] font-black text-slate-500 uppercase tracking-widest">
                        <span>Linaire</span>
                        <span>Turbulent</span>
                    </div>
                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5 shadow-inner">
                        <div 
                            className={`h-full transition-all duration-1000 ${turbulence > 75 ? 'bg-rose-500' : turbulence > 40 ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                            style={{ width: `${turbulence}%` }}
                        ></div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">{turbulence}% de décalage stochastique</div>
                </div>
            </div>
            
            {/* Décoration radar subtile */}
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        </div>
    );
};
