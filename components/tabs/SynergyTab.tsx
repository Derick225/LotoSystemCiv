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
            .sort((a, b) => a.score - b.score) 
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
            {/* Header Stratégique */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] group-hover:bg-indigo-600/20 transition-all duration-1000"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="text-center md:text-left">
                        <div className="flex items-center gap-3 mb-2">
                             <Network size={16} className="text-indigo-400" />
                             <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Social Topology Unit</span>
                        </div>
                        <h3 className="text-2xl md:text-4xl font-black text-white tracking-tighter uppercase">Moteur de <span className="text-indigo-500">Synergie</span></h3>
                        <p className="text-slate-400 text-sm mt-3 max-w-xl font-medium leading-relaxed">
                            Chaque numéro possède une "empreinte sociale" unique. Identifiez les attracteurs (Amis) et les causalités (Suites) pour affiner vos grilles de jeu.
                        </p>
                    </div>
                    <div className="flex items-center gap-4 px-8 py-5 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl">
                        <Activity size={24} className="text-emerald-400 animate-pulse" />
                        <div className="text-left">
                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Analyseur</div>
                            <div className="text-xs font-bold text-emerald-400 uppercase">Live Nexus Sync</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Selector Matrix */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900/50 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-8 px-2">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Search size={14}/> Sélection du Vecteur
                        </h4>
                        {selectedNum && (
                            <button onClick={() => setSelectedNum(null)} className="text-[9px] font-black text-rose-500 uppercase bg-rose-50 dark:bg-rose-900/30 px-3 py-1 rounded-full border border-rose-100 dark:border-rose-900/50 transition-all active:scale-95">Réinitialiser</button>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-10 gap-1.5 md:gap-2.5">
                        {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                onClick={() => setSelectedNum(n)}
                                className={`aspect-square rounded-xl flex items-center justify-center text-[10px] font-black transition-all duration-300 ${selectedNum === n ? 'bg-indigo-600 text-white scale-110 shadow-2xl z-10 ring-4 ring-indigo-500/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/40'}`}
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
                            <motion.div 
                                key={selectedNum}
                                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -20, scale: 1.05 }}
                                className="space-y-6"
                            >
                                {/* Profile Card */}
                                <div className="bg-slate-900 text-white p-10 rounded-[3.5rem] shadow-2xl border border-indigo-500/20 relative overflow-hidden flex items-center gap-10">
                                    <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12"><Target size={120} /></div>
                                    <NumberBall number={selectedNum} size="xl" isAttractor />
                                    <div>
                                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-2">Vecteur en Focus</div>
                                        <h4 className="text-4xl font-black tracking-tighter uppercase">Signature {selectedNum}</h4>
                                        <div className="flex items-center gap-4 mt-4">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-slate-500 uppercase">Pression Sociale</span>
                                                <span className="text-xl font-black text-emerald-400">{socialPressure}%</span>
                                            </div>
                                            <div className="h-8 w-px bg-white/10"></div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-slate-500 uppercase">Indice Markov</span>
                                                <span className="text-xl font-black text-indigo-400">{successors[0]?.prob || 0}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* FRIENDS */}
                                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col group">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl"><Heart size={20}/></div>
                                                <h5 className="font-black text-slate-800 dark:text-white uppercase text-[11px] tracking-widest">Le Cercle d'Amis</h5>
                                            </div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase">Corrélation</span>
                                        </div>
                                        
                                        <div className="space-y-4 flex-1">
                                            {affinities.map((a, i) => (
                                                <div key={a.number} className="flex items-center justify-between group/item">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[9px] font-black text-slate-400 w-4">#{i+1}</span>
                                                        <NumberBall number={a.number} size="sm" />
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">N°{a.number}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs font-black text-emerald-500">{a.score}%</div>
                                                        <div className="w-10 h-0.5 bg-slate-100 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                                                            <div className="h-full bg-emerald-500" style={{ width: `${a.score}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* SUCCESSORS */}
                                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl"><ArrowRight size={20}/></div>
                                                <h5 className="font-black text-slate-800 dark:text-white uppercase text-[11px] tracking-widest">Lignée Temporelle</h5>
                                            </div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase">T+1</span>
                                        </div>
                                        
                                        <div className="space-y-4 flex-1">
                                            {loadingAnalysis ? (
                                                <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
                                                    <RefreshCw size={32} className="text-indigo-500 animate-spin" />
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Calcul...</span>
                                                </div>
                                            ) : successors.length > 0 ? successors.map((s, i) => (
                                                <div key={s.number} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[9px] font-black text-slate-400 w-4">#{i+1}</span>
                                                        <NumberBall number={s.number} size="sm" />
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">N°{s.number}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs font-black text-indigo-500">{s.prob}%</div>
                                                        <div className="w-10 h-0.5 bg-slate-100 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                                                            <div className="h-full bg-indigo-500" style={{ width: `${s.prob}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-center py-20 text-slate-400 italic text-xs">Vecteur isolé. Aucun pattern de suite.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Adversaries & Insights */}
                                <div className="grid md:grid-cols-12 gap-6">
                                    <div className="md:col-span-4 bg-rose-50 dark:bg-rose-900/10 p-6 rounded-[2.5rem] border border-rose-100 dark:border-rose-900/50">
                                         <div className="flex items-center gap-2 mb-4">
                                            <UserMinus size={16} className="text-rose-500" />
                                            <h5 className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">Les Ennemis</h5>
                                         </div>
                                         <div className="flex gap-3 justify-center">
                                            {nemesis.map(n => <div key={n.number} className="opacity-50 grayscale hover:grayscale-0 transition-all"><NumberBall number={n.number} size="sm" /></div>)}
                                         </div>
                                    </div>
                                    
                                    <div className="md:col-span-8 bg-indigo-50 dark:bg-indigo-950/30 p-6 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/50 flex gap-5 items-start">
                                        <ShieldCheck className="text-indigo-500 shrink-0 mt-1" size={28} />
                                        <div>
                                            <h5 className="text-[11px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-1">Rapport de Synergie</h5>
                                            <p className="text-xs text-indigo-900/80 dark:text-indigo-200/80 font-medium leading-relaxed">
                                                Le numéro {selectedNum} présente une affinité record avec le {affinities[0]?.number}. 
                                                {successors[0]?.prob > 15 ? ` Sa sortie déclenche statistiquement l'apparition de l'unité ${successors[0].number} avec une fiabilité de ${successors[0].prob}%.` : " Ses trajectoires futures sont actuellement diffuses."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/40 rounded-[3.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center p-12">
                                <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg mb-8">
                                    <Users size={40} className="text-slate-300 dark:text-slate-600" />
                                </div>
                                <h4 className="text-xl font-black text-slate-400 uppercase tracking-tighter">Explorateur de Synergie</h4>
                                <p className="text-sm text-slate-500 mt-3 max-w-xs font-medium leading-relaxed">
                                    Touchez un vecteur dans la matrice pour extraire son profil social et ses prévisions de succession Markovienne.
                                </p>
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
        <path d="M23 4v6h-6"></path>
        <path d="M1 20v-6h6"></path>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
);
