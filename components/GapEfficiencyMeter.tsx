
import React, { useMemo } from 'react';
import type { GapEfficiency } from '../types';
import { NumberBall } from './NumberBall';
import { TrendingUp, AlertOctagon, Thermometer, ArrowUp, Activity, BarChart3, ScanLine } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GapEfficiencyMeterProps {
    data: GapEfficiency[];
}

export const GapEfficiencyMeter: React.FC<GapEfficiencyMeterProps> = ({ data }) => {
    // Filtrage intelligent : On garde ceux qui ont un Z-Score positif significatif (Pression > Moyenne)
    const activeData = useMemo(() => {
        return data
            .filter(d => d.zScore > 0.5) // Filtre de bruit
            .sort((a, b) => b.zScore - a.zScore) // Trie par pression
            .slice(0, 10);
    }, [data]);

    if (activeData.length === 0) return (
        <div className="p-10 text-center text-slate-500 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed backdrop-blur-sm">
            <ScanLine size={48} className="mx-auto mb-4 opacity-30 text-indigo-400 animate-pulse-slow"/>
            <p className="text-xs font-black uppercase tracking-widest">Pression Atmosphérique Normale</p>
            <p className="text-[10px] mt-2 opacity-60">Aucune anomalie d'écart détectée (&gt; 0.5 σ)</p>
        </div>
    );

    return (
        <div className="bg-slate-950 border border-slate-800 p-6 md:p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            
            {/* Header Cybernétique */}
            <div className="flex justify-between items-start mb-8 relative z-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400 shadow-lg">
                        <Activity size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-[0.2em]">Pression Stochastique</h4>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">GEI Monitor v2.0</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                    <span className="text-[10px] font-mono text-indigo-300">σ-Level Analysis</span>
                </div>
            </div>

            {/* Liste des Vecteurs sous Tension */}
            <div className="space-y-3 relative z-10">
                <AnimatePresence>
                    {activeData.map((item, index) => (
                        <motion.div 
                            key={item.number}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`
                                relative p-4 rounded-3xl border transition-all group overflow-hidden
                                ${item.zone === 'CRITICAL' 
                                    ? 'bg-rose-950/30 border-rose-500/30 shadow-[0_0_30px_-10px_rgba(244,63,94,0.3)]' 
                                    : 'bg-slate-900/50 border-white/5 hover:border-indigo-500/30'}
                            `}
                        >
                            {/* Jauge de fond subtile */}
                            <div className="absolute bottom-0 left-0 h-1 bg-slate-800 w-full opacity-30">
                                <div 
                                    className={`h-full transition-all duration-1000 ${item.zScore > 2 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                    style={{ width: `${Math.min(100, item.breakoutProb)}%` }}
                                ></div>
                            </div>

                            <div className="flex items-center gap-5">
                                {/* Numéro & Badge Zone */}
                                <div className="flex flex-col items-center gap-2 shrink-0">
                                    <NumberBall number={item.number} size="md" glow={item.zone === 'CRITICAL'} />
                                    <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                        item.zone === 'CRITICAL' ? 'bg-rose-500 text-white border-rose-400 animate-pulse' :
                                        item.zone === 'HOT' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                                        'bg-slate-800 text-slate-400 border-slate-700'
                                    }`}>
                                        {item.zone}
                                    </span>
                                </div>

                                {/* Métriques Principales */}
                                <div className="flex-1 grid grid-cols-3 gap-2">
                                    {/* Z-Score (Pression) */}
                                    <div className="flex flex-col justify-center pl-2 border-l border-white/5">
                                        <span className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Pression σ</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className={`text-lg font-black font-mono ${item.zScore > 2 ? 'text-rose-400' : 'text-white'}`}>
                                                {item.zScore.toFixed(2)}
                                            </span>
                                            {item.zScore > 1.5 && <ArrowUp size={10} className="text-rose-500 animate-bounce" />}
                                        </div>
                                    </div>

                                    {/* Breakout Prob (Proba) */}
                                    <div className="flex flex-col justify-center pl-2 border-l border-white/5">
                                        <span className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Rupture</span>
                                        <span className="text-lg font-black text-emerald-400 font-mono">
                                            {Math.round(item.breakoutProb)}%
                                        </span>
                                    </div>

                                    {/* Gap Context */}
                                    <div className="flex flex-col justify-center pl-2 border-l border-white/5">
                                        <span className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Écart / Max</span>
                                        <span className="text-xs font-bold text-slate-300 font-mono">
                                            <span className="text-white text-sm">{item.currentGap}</span>
                                            <span className="text-slate-600 mx-1">/</span>
                                            {item.maxGap}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            
            {/* Background Decor */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-[80px] pointer-events-none animate-pulse-slow"></div>
            <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
        </div>
    );
};
