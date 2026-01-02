import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getDailySummary, getNextScheduledDraw, fetchGlobalStats, checkAndSyncRecentResults } from '../services/lotteryService';
import { analyzeIntraDraw } from '../services/intraDrawService';
import { useNexus } from './NexusProvider';
import { useGlobalMarketHistory } from '../hooks/useLottery';
import type { Draw, DrawResult } from '../types';
import { NumberBall } from './NumberBall';
import { InfoTooltip } from './ui/InfoTooltip';
import { TicketXRay } from './TicketXRay';
import { 
    Flame, Calendar, Clock, Activity, 
    RefreshCw, 
    Binary, Signal, Database, 
    Zap, Microscope, ArrowUpRight, ShieldCheck, HeartPulse, Cpu, Monitor
} from 'lucide-react';
import { useToast } from './ui/Toast';
import { useIsFetching } from '@tanstack/react-query';
import { WatchlistMonitor } from './WatchlistMonitor';
import { motion, AnimatePresence } from 'framer-motion';
import { audioEngine } from '../utils/audioEngine';

interface SummaryItem {
    time: string;
    name: string;
    result: DrawResult | null;
}

interface GlobalDashboardProps {
    onSelectDraw: (draw: Draw) => void;
}

const LatestResultHero: React.FC<{ result: DrawResult, onAnalyze: () => void }> = ({ result, onAnalyze }) => {
    const metrics = useMemo(() => analyzeIntraDraw(result), [result]);
    const [showXRay, setShowXRay] = useState(false);
    
    return (
        <div className="relative overflow-hidden rounded-[4rem] p-8 md:p-14 text-white shadow-2xl group border border-white/5 mb-12 transition-all duration-700 bg-slate-950">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-black opacity-90"></div>
            
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[140px] -mr-48 -mt-48 group-hover:bg-indigo-500/20 transition-all duration-1000"></div>

            <div className="relative z-10">
                <div className="flex flex-col lg:flex-row gap-12 items-center justify-between">
                    <div className="flex-1 space-y-8 text-center lg:text-left">
                        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
                            <motion.div 
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="inline-flex items-center gap-2.5 px-5 py-2 bg-indigo-500/10 rounded-full border border-indigo-500/30 text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300"
                            >
                                <Signal size={14} className="text-indigo-400 animate-pulse" /> Signal Entrant • {result.drawName}
                            </motion.div>
                            <div className="inline-flex items-center gap-2.5 px-5 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/30 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
                                <ShieldCheck size={14} /> Donnée Vérifiée
                            </div>
                        </div>
                        
                        <h2 className="text-6xl md:text-8xl font-black tracking-tighter leading-none text-white drop-shadow-2xl">
                            {result.drawName || 'TERMINAL'}
                        </h2>
                        
                        <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                            <InfoTooltip title="Somme Sigma (Σ)" content="Masse numérique totale du tirage. Moyenne théorique: 227.5.">
                                <div className="px-6 py-4 bg-black/40 rounded-3xl border border-white/5 backdrop-blur-xl flex flex-col items-center min-w-[120px] hover:border-indigo-500/50 transition-colors shadow-inner">
                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1.5">Somme Σ</span>
                                    <span className={`text-2xl font-mono font-black ${Math.abs(metrics.sum - 227.5) > 50 ? 'text-rose-400' : 'text-emerald-400'}`}>{metrics.sum}</span>
                                </div>
                            </InfoTooltip>

                            <InfoTooltip title="Complexité Arithmétique" content="Score d'imprévisibilité structurelle (0-10).">
                                <div className="px-6 py-4 bg-black/40 rounded-3xl border border-white/5 backdrop-blur-xl flex flex-col items-center min-w-[120px] hover:border-indigo-500/50 transition-colors shadow-inner">
                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1.5">Complexité</span>
                                    <span className="text-2xl font-mono font-black text-indigo-400">{metrics.acValue}/10</span>
                                </div>
                            </InfoTooltip>

                            <button 
                                onClick={(e) => { e.stopPropagation(); audioEngine.play('click'); setShowXRay(!showXRay); }}
                                className={`px-6 py-4 rounded-3xl border flex flex-col items-center min-w-[120px] transition-all transform active:scale-95 shadow-xl
                                  ${showXRay 
                                    ? 'bg-indigo-600 border-indigo-400 shadow-indigo-500/30' 
                                    : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                            >
                                <span className="text-[9px] font-black uppercase tracking-widest mb-1.5 opacity-60">Diagnostic</span>
                                <div className="flex items-center gap-2">
                                    <Microscope size={16} />
                                    <span className="text-xs font-black uppercase tracking-widest">Rayon-X</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-10 bg-black/40 p-10 md:p-14 rounded-[4.5rem] border border-white/10 backdrop-blur-3xl shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-indigo-600/5 opacity-30" />
                        <div className="flex gap-4 md:gap-6 relative z-10">
                            {result.gagnants.map((n, i) => (
                                <motion.div 
                                    key={n} 
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: i * 0.1, type: "spring" }}
                                    className="transform hover:scale-110 transition-transform duration-500"
                                >
                                    <NumberBall number={n} size="lg" isAttractor={i===0} confidence={92} />
                                </motion.div>
                            ))}
                        </div>
                        
                        <div className="flex items-center gap-8 w-full px-4 relative z-10">
                            <div className="h-px flex-1 bg-white/10"></div>
                            <div className="flex items-center gap-5">
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] flex items-center gap-2">
                                    <Binary size={14} /> Machine Loop
                                </span>
                                <div className="flex gap-3">
                                    {result.machine?.map((n) => (
                                        <span key={n} className="text-sm font-mono font-black text-slate-400 opacity-50 hover:opacity-100 transition-opacity">{n}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="h-px flex-1 bg-white/10"></div>
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                  {showXRay && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-12 overflow-hidden"
                      >
                          <TicketXRay numbers={result.gagnants} score={Math.round((metrics.acValue/10)*100)} showTitle={false} />
                      </motion.div>
                  )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ onSelectDraw }) => {
    const { showToast } = useToast();
    const { regime, volatility, refreshData } = useNexus(); 
    const { data: recentGlobalResults } = useGlobalMarketHistory();
    const isFetchingGlobal = useIsFetching();
    
    const latestResult = recentGlobalResults && recentGlobalResults.length > 0 ? recentGlobalResults[0] : null;
    
    const [summary, setSummary] = useState<SummaryItem[]>([]);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [nextDraw, setNextDraw] = useState<{name: string, timeLeft: string, isUrgent: boolean} | null>(null);
    const [globalHot, setGlobalHot] = useState<{number: number, count: number}[]>([]);
    const [fullSyncing, setFullSyncing] = useState(false);

    const isMounted = useRef(true);

    const loadDailySummary = useCallback(async () => {
        if (!isMounted.current) return;
        setLoadingSummary(true);
        const daysOrder = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const today = daysOrder[new Date().getDay()];
        
        try {
            const summaryData = await getDailySummary(today);
            if (isMounted.current) setSummary(summaryData);
        } catch (e) { 
            console.error(e); 
        } finally { 
            if (isMounted.current) setLoadingSummary(false); 
        }
    }, []);

    const loadHotStats = useCallback(async () => {
        try {
            const data = await fetchGlobalStats();
            if (isMounted.current) setGlobalHot(data.slice(0, 6));
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            const next = getNextScheduledDraw();
            if (next && isMounted.current) {
                const now = new Date();
                const [h, m] = next.time.split(':').map(Number);
                const targetDate = new Date();
                targetDate.setHours(h, m, 0, 0);
                if (targetDate < now) targetDate.setDate(targetDate.getDate() + 1);
                const diffMs = targetDate.getTime() - now.getTime();
                
                const isUrgent = diffMs < 600000; 
                const hh = Math.floor(diffMs / 3600000);
                const mm = Math.floor((diffMs % 3600000) / 60000);
                const ss = Math.floor((diffMs % 60000) / 1000);
                
                setNextDraw({ 
                    name: next.name, 
                    timeLeft: `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`,
                    isUrgent
                });
            }
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        isMounted.current = true;
        loadDailySummary();
        loadHotStats();
        const syncTimer = setInterval(() => checkAndSyncRecentResults().then(loadDailySummary), 300000);
        return () => { isMounted.current = false; clearInterval(syncTimer); };
    }, [loadDailySummary, loadHotStats]);

    // FIX: Renamed implementation for clarity and usage consistency
    const handleManualSync = async () => {
        audioEngine.play('scan');
        setFullSyncing(true);
        try {
            const count = await checkAndSyncRecentResults();
            await loadDailySummary();
            showToast(count > 0 ? `${count} signaux synchronisés.` : "Noyau à jour.", "success");
            if (count > 0) audioEngine.play('success');
        } catch (e) {
            showToast("Sync cloud interrompue.", "error");
            audioEngine.play('error');
        } finally {
            setFullSyncing(false);
        }
    };

    return (
        <div className="space-y-12 animate-fade-in pb-24">
            
            {/* Core Status Monitoring Bar */}
            <div className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-[3.5rem] border border-white/5 flex flex-col md:flex-row justify-between items-center gap-10">
                <div className="flex items-center gap-6">
                    <div className="p-5 bg-indigo-600 rounded-[2rem] shadow-2xl shadow-indigo-600/30 text-white group hover:rotate-6 transition-all">
                        <Monitor size={32} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Console Maître</h2>
                        <div className="flex flex-wrap items-center gap-6 mt-3">
                            <div className="flex items-center gap-2">
                                <HeartPulse size={16} className="text-rose-500 animate-pulse" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculateur IA : <span className="text-white">{regime?.regime || 'IDLE'}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Activity size={16} className="text-indigo-400" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entropie (Σ) : <span className="text-white">{volatility?.score || 0}%</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Signal size={16} className="text-emerald-400" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sat-Link : <span className="text-emerald-500">ACTIF</span></span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <button 
                    // FIX: Changed from handleManualRefresh to handleManualSync
                    onClick={handleManualSync}
                    disabled={fullSyncing}
                    className="group px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shadow-xl flex items-center gap-4 active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw size={18} className={`${fullSyncing ? 'animate-spin' : 'group-hover:rotate-180'} transition-transform duration-700 text-indigo-400`} />
                    <span className="text-xs font-black uppercase tracking-widest text-white">Cloud Sync Pulse</span>
                </button>
            </div>

            <WatchlistMonitor />

            {latestResult && (
                <LatestResultHero result={latestResult} onAnalyze={() => onSelectDraw({ name: latestResult.drawName || 'Recent', day: 'Today', time: 'Now' })} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* PROCHAIN TIRAGE WIDGET */}
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`lg:col-span-8 rounded-[4rem] p-10 md:p-14 text-white shadow-2xl relative overflow-hidden group border transition-all duration-700 ${nextDraw?.isUrgent ? 'bg-rose-950 border-rose-500/40 ring-4 ring-rose-500/10 shadow-rose-900/40' : 'bg-slate-900 border-white/5'}`}
                >
                    <div className={`absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[160px] -mr-48 -mt-48 transition-colors duration-1000 ${nextDraw?.isUrgent ? 'bg-rose-500/20' : 'bg-indigo-600/10'}`}></div>
                    
                    <div className="relative z-10 flex flex-col h-full">
                        <div className="flex justify-between items-start">
                            <div className="inline-flex items-center gap-3 px-5 py-2 bg-white/5 rounded-full border border-white/10 backdrop-blur-2xl">
                                <Clock className={`w-5 h-5 ${nextDraw?.isUrgent ? 'text-rose-400 animate-spin' : 'text-indigo-400'}`} />
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">T-Sequence Alpha</span>
                            </div>
                            {nextDraw?.isUrgent && (
                                <span className="px-4 py-1.5 bg-rose-600 text-white text-[9px] font-black uppercase rounded-xl animate-pulse shadow-lg shadow-rose-600/40">Imminence Détectée</span>
                            )}
                        </div>

                        <div className="mt-14 mb-10">
                            <h3 className="text-4xl md:text-7xl font-black tracking-tighter leading-tight truncate">
                                {nextDraw ? nextDraw.name : 'Vecteur Temporel...'}
                            </h3>
                            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest mt-4">Ouverture du flux dans :</p>
                        </div>

                        <div className="bg-black/50 backdrop-blur-3xl rounded-[3rem] p-10 border border-white/10 flex flex-col items-center justify-center shadow-inner group-hover:border-white/20 transition-all">
                            <div className={`text-6xl md:text-[8rem] font-mono font-black tracking-tighter transition-all duration-500 ${nextDraw?.isUrgent ? 'text-rose-400 scale-105' : 'text-white'}`}>
                                {nextDraw ? nextDraw.timeLeft : '00:00:00'}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* TOP FREQUENCE 7J */}
                <div className="lg:col-span-4 bg-white/5 backdrop-blur-md rounded-[4rem] p-10 shadow-2xl border border-white/5 relative overflow-hidden flex flex-col h-full">
                    <h3 className="font-black text-white flex items-center gap-4 mb-10 text-2xl tracking-tight uppercase">
                        <Flame className="w-7 h-7 text-orange-500" /> High-Heat 7d
                    </h3>
                    <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {globalHot.length === 0 ? (
                            [1,2,3,4,5].map(i => <div key={i} className="h-16 bg-white/5 rounded-2xl animate-pulse"></div>)
                        ) : 
                        globalHot.slice(0, 5).map((stat, i) => (
                            <motion.div 
                              key={stat.number} 
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/5 hover:border-indigo-500/30 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-black text-slate-600 group-hover:text-indigo-400">#{i+1}</span>
                                    <NumberBall number={stat.number} size="sm" confidence={Math.round(80 - i * 3)} />
                                </div>
                                <div className="text-right">
                                    <span className="text-xl font-mono font-black text-white">{stat.count}</span>
                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Signaux</div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* FLUX DU JOUR */}
            <section className="mt-20">
                <div className="flex items-center gap-5 mb-12 px-6">
                    <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-600/20"><Calendar size={24}/></div>
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Flux Séquentiel</h2>
                        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">Fenêtre temporelle active du jour</p>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {loadingSummary ? (
                        [1,2,3,4].map(i => <div key={i} className="h-64 bg-white/5 rounded-[3rem] animate-pulse border border-white/5"></div>)
                    ) :
                    summary.map((item, idx) => {
                        const isCompleted = item.result !== null;
                        return (
                            <motion.div
                                key={item.name}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                onClick={() => onSelectDraw({ day: 'Today', time: item.time, name: item.name })}
                                className={`group p-8 rounded-[3rem] border transition-all duration-500 cursor-pointer hover:scale-[1.03] flex flex-col h-full relative overflow-hidden ${isCompleted ? 'bg-indigo-600/5 border-emerald-500/20 hover:border-emerald-500/50 shadow-2xl' : 'bg-black/40 border-white/5 opacity-60 hover:opacity-100'}`}
                            >
                                <div className="flex justify-between items-start mb-8 relative z-10">
                                    <span className={`text-[11px] font-black uppercase tracking-widest ${isCompleted ? 'text-emerald-500' : 'text-indigo-400'}`}>{item.time}</span>
                                    {isCompleted && <Signal size={12} className="text-emerald-500 animate-pulse" />}
                                </div>

                                <h3 className="font-black text-2xl text-white mb-8 group-hover:text-indigo-400 transition-colors uppercase truncate relative z-10">{item.name}</h3>
                                
                                <div className="mt-auto relative z-10">
                                    {item.result ? (
                                        <div className="space-y-6">
                                            <div className="flex gap-2.5 flex-wrap">
                                                {item.result.gagnants.map((n) => (
                                                    <div key={n} className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-[10px] font-black">{n}</div>
                                                ))}
                                            </div>
                                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                                <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase group-hover:text-slate-300">
                                                    <Microscope size={12} /> Analyser
                                                </div>
                                                <ArrowUpRight size={14} className="text-slate-600 group-hover:text-indigo-300 transition-all"/>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-8 bg-black/20 rounded-[2.5rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-3">
                                            <div className="w-2 h-2 bg-indigo-500/30 rounded-full animate-pulse shadow-[0_0_10px_#6366f1]"></div>
                                            <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Pending</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};