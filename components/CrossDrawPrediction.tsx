
import React, { useState, useEffect } from 'react';
import { analyzeMigrationFlux } from '../services/interGameService';
import { InterGameHeat } from '../types';
import { NumberBall } from './NumberBall';
import { ArrowRight, GitMerge, Activity, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface CrossDrawPredictionProps {
    targetDrawName: string;
}

export const CrossDrawPrediction: React.FC<CrossDrawPredictionProps> = ({ targetDrawName }) => {
    const [data, setData] = useState<InterGameHeat | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await analyzeMigrationFlux(targetDrawName);
                setData(res);
            } catch(e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [targetDrawName]);

    if (loading) return (
        <div className="p-8 text-center animate-pulse flex flex-col items-center gap-2">
            <RefreshCw className="animate-spin text-indigo-500" size={24}/>
            <span className="text-[10px] font-black uppercase text-slate-400">Analyse Flux Inter-Jeux...</span>
        </div>
    );

    if (!data) return (
        <div className="p-6 bg-slate-50 dark:bg-slate-900/30 rounded-3xl border border-slate-200 dark:border-slate-800 text-center">
            <p className="text-xs text-slate-400 font-bold uppercase">Aucune corrélation significative détectée.</p>
        </div>
    );

    return (
        <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900 p-6 rounded-[2.5rem] border border-indigo-500/20 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5"><GitMerge size={80}/></div>
            
            <div className="relative z-10">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                            <Activity size={16}/>
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Influence Externe</h4>
                    </div>
                    <span className="text-[9px] font-bold text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20">
                        Corrélation: {data.correlationFactor}%
                    </span>
                </div>

                <div className="flex items-center justify-between gap-4 mb-6">
                    <div className="text-center">
                        <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Source</div>
                        <div className="text-xs font-black text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                            {data.sourceGame}
                        </div>
                    </div>
                    <ArrowRight className="text-indigo-500 animate-pulse" size={20}/>
                    <div className="text-center">
                        <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Cible</div>
                        <div className="text-xs font-black text-white bg-indigo-600 px-3 py-1.5 rounded-lg shadow-lg">
                            {data.targetGame}
                        </div>
                    </div>
                </div>

                <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase mb-3 text-center">Vecteurs de Transfert Probables</div>
                    <div className="flex justify-center gap-2 flex-wrap">
                        {data.migratingNumbers.map((n, i) => (
                            <motion.div key={n} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}>
                                <NumberBall number={n} size="sm" glow />
                            </motion.div>
                        ))}
                        {data.migratingNumbers.length === 0 && <span className="text-xs text-slate-500 italic">Aucun transfert direct.</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};
