import React, { useState, useEffect, useRef } from 'react';
import { 
    getCyclicCandidates, 
    getSeasonalAffinity, 
    getDayAffinity, 
    getCrossMonthResonanceAnalysis,
    type CyclicCandidate,
    type CrossMonthResonanceAnalysis
} from '../../services/temporalAnalysisService';
import { fetchAssociatedNumbers } from '../../services/lotteryService';
import { NumberBall } from '../NumberBall';
import { useNexusStore } from '../../store/useNexusStore';
import { RotateCw, Link, ArrowRight, Hourglass, Calendar, TrendingUp, Sparkles, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

interface DependencyFlow {
    source: number;
    targets: { number: number; count: number }[];
}

export const TemporalTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const history = useNexusStore(state => state.history);
    const regularity = useNexusStore(state => state.regularity);
    const nexusLoading = useNexusStore(state => state.loading);
    
    const [cyclicData, setCyclicData] = useState<CyclicCandidate[]>([]);
    const [seasonalData, setSeasonalData] = useState<{ number: number; count: number }[]>([]);
    const [decayTrendData, setDecayTrendData] = useState<{ number: number; score: number }[]>([]);
    const [currentMonthName, setCurrentMonthName] = useState("");
    const [dependencies, setDependencies] = useState<DependencyFlow[]>([]);
    const [loadingDeps, setLoadingDeps] = useState(false);
    const [crossMonthResonance, setCrossMonthResonance] = useState<CrossMonthResonanceAnalysis | null>(null);
    
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        const load = async () => {
            if (history.length > 10) {
                // 1. Cycles
                const cycles = await getCyclicCandidates(drawName, history);
                if (isMounted.current) setCyclicData(cycles.slice(0, 6));

                // 2. Saisonnalité
                const seasonal = getSeasonalAffinity(history);
                const monthsFr = [
                    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
                ];
                if (isMounted.current) {
                    setSeasonalData(seasonal.topNumbers.slice(0, 6));
                    setCurrentMonthName(monthsFr[seasonal.monthIndex]);
                }

                // 3. Tendance dynamique amortie
                const dayAff = getDayAffinity(history);
                if (isMounted.current) {
                    setDecayTrendData(dayAff.slice(0, 6));
                }

                // 3.5 Résonance Inter-Mensuelle (Pilier 1)
                const resonanceDetail = getCrossMonthResonanceAnalysis(history);
                if (isMounted.current) {
                    setCrossMonthResonance(resonanceDetail);
                }

                // 4. Dépendances (T-1 -> T)
                setLoadingDeps(true);
                const lastWinners = history[0].gagnants;
                const deps: DependencyFlow[] = [];
                
                await Promise.all(lastWinners.map(async (sourceNum) => {
                    const assoc = await fetchAssociatedNumbers(sourceNum, drawName, history);
                    if (assoc.following.length > 0) {
                        deps.push({
                            source: sourceNum,
                            targets: assoc.following.slice(0, 3)
                        });
                    }
                }));
                
                if (isMounted.current) {
                    setDependencies(deps.sort((a, b) => a.source - b.source));
                    setLoadingDeps(false);
                }
            }
        };
        load();
        return () => { isMounted.current = false; };
    }, [drawName, history, regularity]);

    if (nexusLoading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
            <Hourglass className="text-amber-500 animate-spin" size={48} />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Synchronisation Temporelle...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            
            {/* HERO SECTION: HORLOGES CYCLIQUES */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-8 rounded-3xl shadow-2xl border border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-500"><RotateCw size={180} /></div>
                
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-500 border border-amber-500/30">
                            <Hourglass size={24} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Horloges Cycliques</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Détection de périodicité (Auto-Corrélation)</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {cyclicData.map((c, idx) => (
                            <motion.div 
                                key={c.number}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className={`p-6 rounded-[2rem] border relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 ${c.nextDateEstimate === 'CRITIQUE' ? 'bg-amber-950/30 border-amber-500/30' : 'bg-white/5 border-white/5'}`}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <NumberBall number={c.number} size="md" glow={c.nextDateEstimate === 'CRITIQUE'} />
                                    <div className="text-right">
                                        <div className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${c.nextDateEstimate === 'CRITIQUE' ? 'text-amber-500 border-amber-500/30 bg-amber-500/10 animate-pulse' : 'text-slate-500 border-slate-700'}`}>
                                            {c.nextDateEstimate}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400 font-bold uppercase text-xs tracking-wider">Écart Actuel</span>
                                        <span className="text-white font-mono font-black">{c.gap} <span className="text-slate-600">/ {Math.round(c.avg)} moy</span></span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-500 ${c.nextDateEstimate === 'CRITIQUE' ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${Math.min(100, (c.gap / c.avg) * 100)}%` }}
                                        ></div>
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono text-right">
                                        Précision cycle: {Math.round(c.score)}% (σ ±{c.stdDev.toFixed(1)})
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* SECTION DÉDIÉE : RÉSONANCE INTER-MENSUELLE (PILIER 1) */}
            {crossMonthResonance && crossMonthResonance.sourceMonthIndex !== -1 && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-slate-900/40 via-indigo-950/25 to-slate-900/40 p-8 rounded-3xl border border-indigo-500/15 shadow-xl relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                        <Sparkles size={120} className="text-indigo-400" />
                    </div>
                    
                    <div className="flex flex-col lg:flex-row gap-8 items-start relative z-10">
                        {/* Info card */}
                        <div className="lg:w-5/12 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
                                    <Sparkles size={16} />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400">Stratégie Analytique — Pilier 1</span>
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Résonance Inter-Mensuelle</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Analyse stochastique de l'excitation de cohorte. Le système a identifié une transition temporelle majeure entre le mois de <strong className="text-indigo-300 font-bold">{crossMonthResonance.sourceMonthName}</strong> et le mois en cours (<span className="text-white font-bold">{crossMonthResonance.currentMonthName}</span>) avec un coefficient de similarité de <strong className="text-emerald-400 font-mono">{(crossMonthResonance.correlation * 100).toFixed(1)}%</strong>.
                            </p>
                            
                            <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/10 space-y-1.5">
                                <div className="flex items-center gap-2 text-[10px] font-black text-indigo-300 uppercase tracking-wide">
                                    <Activity size={12} /> Impact Prédictif Direct
                                </div>
                                <p className="text-[11px] text-slate-400 leading-normal">
                                    Les numéros gagnants et machines de {crossMonthResonance.sourceMonthName} projettent un élan d'excitation de <strong>20%</strong> dans le vecteur final de la modélisation temporelle, optimisant ainsi l'alignement continu des prédictions.
                                </p>
                            </div>
                        </div>

                        {/* Visual graph and numbers */}
                        <div className="lg:w-7/12 w-full space-y-6">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Vecteur d'émergence (Cohorte Gagnants + Machines)</span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    {crossMonthResonance.topNumbers.slice(0, 8).map((item) => (
                                        <div 
                                            key={item.number} 
                                            className="flex items-center gap-2 px-3 py-2 bg-slate-950/40 hover:bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/30 rounded-2xl transition-all duration-300"
                                        >
                                            <NumberBall number={item.number} size="sm" />
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Résonance</span>
                                                <span className="text-xs font-mono font-black text-emerald-400">{item.score}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Mini horizontal bar-chart for other months correlation */}
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Matrice de corrélation temporelle croisée (vs {crossMonthResonance.currentMonthName})</span>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                    {crossMonthResonance.allMonthsCorrelation.map(m => {
                                        const isPeak = m.monthIndex === crossMonthResonance.sourceMonthIndex;
                                        return (
                                            <div 
                                                key={m.monthIndex} 
                                                className={`p-2 rounded-xl border flex flex-col justify-between transition-all ${isPeak ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-slate-900/10 border-slate-800/40'}`}
                                            >
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <span className={`text-[9px] font-black uppercase tracking-tight ${isPeak ? 'text-indigo-300 animate-pulse' : 'text-slate-500'}`}>{m.monthName}</span>
                                                    {isPeak && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                                                </div>
                                                <span className={`text-xs font-mono font-bold ${isPeak ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    {(m.correlation * 100).toFixed(1)}%
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* SAISONNALITÉ ET TENDANCES D'AFFINITÉ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* SAISONNALITÉ */}
                <div className="bg-white dark:bg-slate-800/80 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-6 relative z-10">
                        <div className="p-3 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-2xl text-indigo-500 border border-indigo-500/20">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Affinités Saisonnières</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Noyau de Silverman : Mois de {currentMonthName}</p>
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                        {seasonalData.map((item) => {
                            const maxVal = seasonalData[0]?.count || 1;
                            const percentage = Math.round((item.count / maxVal) * 100);
                            return (
                                <div key={item.number} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-slate-800/80 hover:border-indigo-100 dark:hover:border-indigo-900/40 transition-all">
                                    <div className="flex items-center gap-3">
                                        <NumberBall number={item.number} size="sm" />
                                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Densité de présence</span>
                                    </div>
                                    <div className="flex items-center gap-4 w-40">
                                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-indigo-500 transition-all duration-500"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-mono font-bold text-indigo-500 dark:text-indigo-400 w-12 text-right">
                                            {item.count.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* TENDANCE ULTRADIENNE */}
                <div className="bg-white dark:bg-slate-800/80 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-6 relative z-10">
                        <div className="p-3 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl text-emerald-500 border border-emerald-500/20">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Moments Dynamiques</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Séries temporelles avec oubli exponentiel adaptatif</p>
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                        {decayTrendData.map((item) => (
                            <div key={item.number} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-slate-800/80 hover:border-emerald-100 dark:hover:border-emerald-900/40 transition-all">
                                <div className="flex items-center gap-3">
                                    <NumberBall number={item.number} size="sm" />
                                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Force de l'élan amorti</span>
                                </div>
                                <div className="flex items-center gap-4 w-40">
                                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-emerald-500 transition-all duration-500"
                                            style={{ width: `${item.score}%` }}
                                        />
                                    </div>
                                    <span className="text-xs font-mono font-bold text-emerald-500 dark:text-emerald-400 w-12 text-right">
                                        {item.score}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* FLUX DE CAUSALITÉ */}
            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* CAUSAL FLOW */}
                <div className="lg:col-span-12 bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-8 relative z-10">
                        <div>
                            <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                                <Link className="text-indigo-600" size={20} /> Flux de Causalité
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Impact vectoriel T-1 ➔ T</p>
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                        {loadingDeps ? (
                            <div className="py-20 text-center animate-pulse text-slate-400 font-bold text-[10px] uppercase tracking-widest">Calcul des vecteurs...</div>
                        ) : dependencies.map((dep, i) => (
                            <motion.div 
                                key={dep.source}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center gap-4 p-4 rounded-[2rem] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
                            >
                                {/* Source */}
                                <div className="flex flex-col items-center gap-1 min-w-[50px]">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Source</span>
                                    <NumberBall number={dep.source} size="md" />
                                </div>

                                {/* Arrow */}
                                <div className="flex-1 flex items-center justify-center text-slate-300 relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent group-hover:via-indigo-500 transition-all"></div>
                                    </div>
                                    <ArrowRight size={16} className="bg-white dark:bg-slate-800 rounded-full relative z-10 text-indigo-500" />
                                </div>

                                {/* Targets */}
                                <div className="flex gap-2">
                                    {dep.targets.map((tgt) => (
                                        <div key={tgt.number} className="flex flex-col items-center gap-1 group/target">
                                            <span className="text-[10px] font-bold text-indigo-400 opacity-0 group-hover/target:opacity-100 transition-opacity">x{tgt.count}</span>
                                            <NumberBall number={tgt.number} size="sm" />
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
