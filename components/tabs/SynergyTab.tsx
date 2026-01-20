
import React, { useState, useMemo, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { calculateSuccessionMatrixAsync } from '../../services/mathService';
import { NumberBall } from '../NumberBall';
import { Users, ArrowRight, Activity, Zap, ShieldCheck, Heart, UserMinus, Search, Target, Network, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SynergyTabProps { drawName: string; }

export const SynergyTab: React.FC<SynergyTabProps> = ({ drawName }) => {
    const { history, correlationMatrix, loading: nexusLoading } = useNexus();
    const [selectedNum, setSelectedNum] = useState<number | null>(null);
    const [successors, setSuccessors] = useState<{ number: number; prob: number }[]>([]);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    useEffect(() => {
        if (selectedNum && history.length > 10) {
            setLoadingAnalysis(true);
            calculateSuccessionMatrixAsync(history).then(({ matrix, totals }) => {
                const results = matrix[selectedNum] || {};
                const total = totals[selectedNum] || 1;
                const sorted = Object.entries(results)
                    .map(([n, count]) => ({ number: parseInt(n), prob: Math.round(((count as number) / total) * 100) }))
                    .sort((a, b) => b.prob - a.prob)
                    .slice(0, 5);
                setSuccessors(sorted);
                setLoadingAnalysis(false);
            });
        }
    }, [selectedNum, history]);

    const affinities = useMemo(() => {
        if (!selectedNum || !correlationMatrix[selectedNum]) return [];
        return Object.entries(correlationMatrix[selectedNum].affinities)
            .map(([n, score]) => ({ number: parseInt(n), score: Math.round((score as number) * 100) }))
            .sort((a, b) => b.score - a.score)
            .filter(a => a.number !== selectedNum)
            .slice(0, 6);
    }, [selectedNum, correlationMatrix]);

    const nemesis = useMemo(() => {
        if (!selectedNum || !correlationMatrix[selectedNum]) return [];
        return Object.entries(correlationMatrix[selectedNum].affinities)
            .map(([n, score]) => ({ number: parseInt(n), score: Math.round((score as number) * 100) }))
            .sort((a, b) => b.score - a.score) 
            .filter(a => a.number !== selectedNum)
            .slice(0, 3);
    }, [selectedNum, correlationMatrix]);

    const socialPressure = useMemo(() => {
        if (affinities.length === 0) return 0;
        return Math.round(affinities.reduce((acc, a) => acc + a.score, 0) / affinities.length);
    }, [affinities]);

    if (nexusLoading) return <div className="flex flex-col items-center justify-center p-24 gap-6 animate-pulse"><Users className="text-indigo-500 animate-spin" size={48} /><p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Extraction des liens synaptiques...</p></div>;

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] group-hover:bg-indigo-600/20 transition-all duration-1000"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="text-center md:text-left">
                        <div className="flex items-center gap-3 mb-2">
                             <Network size={16} className="text-indigo-400" />
                             <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Social Topology Unit</span>
                        </div>
                        <h3 className="text-2xl md:text-4xl font-black text-white tracking-tighter uppercase">Moteur de <span className="text-indigo-500">Synergie</span></h3>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Matrix Selector - FOND BLANC HAUT CONTRASTE */}
                <div className="lg:col-span-5 bg-white p-8 rounded-[3rem] shadow-xl border border-slate-200 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50 -ml-10 -mt-10"></div>
                    
                    <div className="flex justify-between items-center mb-8 px-2 relative z-10">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Search size={14} className="text-indigo-600"/> Sélecteur de Vecteur
                        </h4>
                        {selectedNum && (
                            <button onClick={() => setSelectedNum(null)} className="text-[9px] font-black text-rose-600 uppercase bg-rose-50 px-3 py-1 rounded-full border border-rose-100 transition-all active:scale-95 shadow-sm">Reset</button>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-10 gap-1.5 md:gap-2.5 relative z-10 bg-slate-50/50 p-4 rounded-[2rem] border border-slate-100">
                        {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                onClick={() => setSelectedNum(n)}
                                className={`aspect-square rounded-xl flex items-center justify-center text-[10px] font-black transition-all duration-300 border shadow-sm ${selectedNum === n ? 'bg-indigo-600 text-white border-indigo-700 scale-110 shadow-lg z-10 ring-4 ring-indigo-50' : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30'}`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Results Panel */}
                <div className="lg:col-span-7">
                    <AnimatePresence mode="wait">
                        {selectedNum ? (
                            <motion.div key={selectedNum} initial={{ opacity: 0, x: 20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -20, scale: 1.05 }} className="space-y-6">
                                <div className="bg-slate-900 text-white p-10 rounded-[3.5rem] shadow-2xl border border-indigo-500/20 relative overflow-hidden flex items-center gap-10">
                                    <NumberBall number={selectedNum} size="xl" isAttractor />
                                    <div>
                                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-2">Focus Intra-Social</div>
                                        <h4 className="text-4xl font-black tracking-tighter uppercase">Signature {selectedNum}</h4>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col group">
                                        <h5 className="font-black text-slate-800 uppercase text-[11px] tracking-widest mb-8 flex items-center gap-3"><Heart size={16} className="text-emerald-500"/> Cercle d'Affinités</h5>
                                        <div className="space-y-4 flex-1">
                                            {affinities.map((a, i) => (
                                                <div key={a.number} className="flex items-center justify-between group/item">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[9px] font-black text-slate-400 w-4">#{i+1}</span>
                                                        <NumberBall number={a.number} size="sm" />
                                                        <span className="text-sm font-bold text-slate-700">N°{a.number}</span>
                                                    </div>
                                                    <span className="text-xs font-black text-emerald-600">{a.score}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col">
                                        <h5 className="font-black text-slate-800 uppercase text-[11px] tracking-widest mb-8 flex items-center gap-3"><ArrowRight size={16} className="text-indigo-500"/> Succession T+1</h5>
                                        <div className="space-y-4 flex-1">
                                            {loadingAnalysis ? (
                                                <div className="h-full flex flex-col items-center justify-center gap-4 py-10"><RefreshCw size={24} className="text-indigo-500 animate-spin" /></div>
                                            ) : successors.length > 0 ? successors.map((s, i) => (
                                                <div key={s.number} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[9px] font-black text-slate-400 w-4">#{i+1}</span>
                                                        <NumberBall number={s.number} size="sm" />
                                                        <span className="text-sm font-bold text-slate-700">N°{s.number}</span>
                                                    </div>
                                                    <span className="text-xs font-black text-indigo-600">{s.prob}%</span>
                                                </div>
                                            )) : <div className="text-center py-10 text-slate-400 italic text-xs">Vecteur isolé.</div>}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/40 rounded-[3.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center p-12">
                                <Users size={40} className="text-slate-300 mb-8" />
                                <h4 className="text-xl font-black text-slate-400 uppercase tracking-tighter">Diagnostic de Synergie</h4>
                                <p className="text-sm text-slate-500 mt-3 max-w-xs font-medium leading-relaxed">Sélectionnez un numéro dans la grille blanche pour isoler ses trajectoires.</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

const RefreshCw = ({size, className}:any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
);
