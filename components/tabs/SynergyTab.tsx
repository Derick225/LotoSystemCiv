import React, { useState, useMemo, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { calculateSuccessionMatrixAsync } from '../../services/mathService';
import { NumberBall } from '../NumberBall';
import { Users, ArrowRight, Activity, Zap, Info, Star, Search, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SynergyTabProps { drawName: string; }

export const SynergyTab: React.FC<SynergyTabProps> = ({ drawName }) => {
    const { history, correlationMatrix, loading: nexusLoading } = useNexus();
    const [selectedNum, setSelectedNum] = useState<number | null>(null);
    const [successors, setSuccessors] = useState<{ number: number; prob: number }[]>([]);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    // Chargement de la matrice de succession quand on sélectionne un numéro
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

    // Calcul des affinités (amis) depuis la matrice de corrélation
    const affinities = useMemo(() => {
        if (!selectedNum || !correlationMatrix[selectedNum]) return [];
        return Object.entries(correlationMatrix[selectedNum].affinities)
            .map(([n, score]) => ({ number: parseInt(n), score: Math.round((score as number) * 100) }))
            .sort((a, b) => b.score - a.score)
            .filter(a => a.number !== selectedNum)
            .slice(0, 5);
    }, [selectedNum, correlationMatrix]);

    if (nexusLoading) return <div className="p-20 text-center animate-pulse text-indigo-500">Ouverture du moteur de synergie...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header explicatif */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full blur-[80px]"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-center md:text-left">
                        <h3 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase">Moteur de <span className="text-indigo-500">Synergie</span></h3>
                        <p className="text-slate-400 text-sm mt-2 max-w-xl font-medium">
                            Découvrez les relations sociales entre les numéros. Sélectionnez un numéro pour voir avec qui il sort et qui il appelle au tirage suivant.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 px-6 py-4 bg-white/5 rounded-3xl border border-white/10">
                        <Activity size={24} className="text-indigo-400 animate-pulse" />
                        <div className="text-left">
                            <div className="text-[10px] font-black text-slate-500 uppercase">Status</div>
                            <div className="text-xs font-bold text-emerald-400 uppercase">Analyse Active</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Grille de sélection 1-90 */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-800 p-6 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-6 px-2">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Search size={14}/> Choisir un Numéro
                        </h4>
                        {selectedNum && (
                            <button onClick={() => setSelectedNum(null)} className="text-[9px] font-black text-rose-500 uppercase bg-rose-50 px-2 py-1 rounded-lg">Effacer</button>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-10 gap-1.5 md:gap-2">
                        {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                onClick={() => setSelectedNum(n)}
                                className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-black transition-all duration-300 ${selectedNum === n ? 'bg-indigo-600 text-white scale-110 shadow-lg z-10 ring-2 ring-indigo-300' : 'bg-slate-50 dark:bg-slate-900 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'}`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Détails de la synergie */}
                <div className="lg:col-span-7">
                    <AnimatePresence mode="wait">
                        {selectedNum ? (
                            <motion.div 
                                key={selectedNum}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                {/* Carte Profil Principal */}
                                <div className="bg-slate-900 text-white p-8 rounded-[3.5rem] shadow-2xl border border-indigo-500/20 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-8 opacity-10"><Zap size={80} /></div>
                                    <div className="flex items-center gap-8 relative z-10">
                                        <NumberBall number={selectedNum} size="xl" isAttractor />
                                        <div>
                                            <h4 className="text-3xl font-black tracking-tighter uppercase">Vecteur {selectedNum}</h4>
                                            <p className="text-indigo-300 text-xs font-black uppercase tracking-[0.2em] mt-1">Analyse des Connexions</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* SECTION : AMIS (CORRÉLATION) */}
                                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
                                        <div className="flex items-center gap-3 mb-8">
                                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Users size={18}/></div>
                                            <h5 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-widest">Le Cercle d'Amis</h5>
                                        </div>
                                        
                                        <div className="space-y-4 flex-1">
                                            {affinities.length > 0 ? affinities.map((a, i) => (
                                                <div key={a.number} className="flex items-center justify-between group">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[10px] font-black text-slate-400">#{i+1}</span>
                                                        <NumberBall number={a.number} size="sm" />
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">N°{a.number}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-xs font-black text-emerald-500">{a.score}%</span>
                                                        <div className="w-12 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                                                            <div className="h-full bg-emerald-500" style={{ width: `${a.score}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-center py-10 text-slate-400 italic text-xs">Aucune affinité forte détectée.</div>
                                            )}
                                        </div>
                                        <p className="text-[9px] text-slate-400 mt-6 border-t pt-4 border-slate-100 dark:border-slate-700 font-medium">Ils ont statistiquement tendance à sortir ensemble dans le même tirage.</p>
                                    </div>

                                    {/* SECTION : SUCCESSION (MARKOV) */}
                                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
                                        <div className="flex items-center gap-3 mb-8">
                                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><ArrowRight size={18}/></div>
                                            <h5 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-widest">L'Appel du Futur</h5>
                                        </div>
                                        
                                        <div className="space-y-4 flex-1">
                                            {loadingAnalysis ? (
                                                <div className="h-full flex items-center justify-center animate-pulse"><Activity size={24} className="text-indigo-400"/></div>
                                            ) : successors.length > 0 ? successors.map((s, i) => (
                                                <div key={s.number} className="flex items-center justify-between group">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[10px] font-black text-slate-400">#{i+1}</span>
                                                        <NumberBall number={s.number} size="sm" />
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">N°{s.number}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-xs font-black text-indigo-500">{s.prob}%</span>
                                                        <div className="w-12 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                                                            <div className="h-full bg-indigo-500" style={{ width: `${s.prob}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-center py-10 text-slate-400 italic text-xs">Aucune succession directe identifiée.</div>
                                            )}
                                        </div>
                                        <p className="text-[9px] text-slate-400 mt-6 border-t pt-4 border-slate-100 dark:border-slate-700 font-medium">Quand le {selectedNum} sort, voici ceux qui le suivent le plus souvent au tirage suivant.</p>
                                    </div>
                                </div>

                                {/* Conseil de l'Oracle */}
                                <div className="bg-indigo-50 dark:bg-indigo-950/30 p-6 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/50 flex gap-4 items-start">
                                    <ShieldCheck className="text-indigo-500 shrink-0 mt-1" size={24} />
                                    <div>
                                        <h5 className="text-[11px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-1">Observation de Synergie</h5>
                                        <p className="text-xs text-indigo-800/80 dark:text-indigo-200/80 font-medium leading-relaxed">
                                            Le numéro {selectedNum} présente une signature {affinities[0]?.score > 30 ? 'très sociable' : 'isolée'}. 
                                            {successors[0]?.prob > 15 ? ` Sa connexion avec le numéro ${successors[0].number} est particulièrement robuste sur l'historique récent.` : ' Ses transitions vers le futur sont actuellement diffuses et peu prévisibles.'}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/40 rounded-[3.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center p-12">
                                <Users size={64} className="text-slate-300 dark:text-slate-700 mb-6" />
                                <h4 className="text-xl font-black text-slate-400 uppercase tracking-tighter">Prêt pour le profilage</h4>
                                <p className="text-sm text-slate-500 mt-2 max-w-xs font-medium">
                                    Touchez un numéro dans la grille pour extraire ses amis et ses successeurs potentiels.
                                </p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};