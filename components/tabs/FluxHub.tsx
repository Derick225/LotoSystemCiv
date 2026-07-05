
import React, { useState, useMemo, useRef } from 'react';
import { DrawResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { formatDate, syncDrawExternal } from '../../services/lotteryService';
import { useNexusStore } from '../../store/useNexusStore';
import { RefreshCw, Search, Activity, Clock, Binary, Download, GitCompare, SearchCode, Calendar, Layers, TrendingUp, BarChart3, ChevronDown, ChevronUp, Cpu, Info } from 'lucide-react';
import { ExportService } from '../../services/exportService';
import { useToast } from '../ui/Toast';
import { ListSkeleton } from '../skeletons/ListSkeleton';
import { SimilarityFinder } from '../SimilarityFinder';
import { DrawExamine } from '../DrawExamine';
import { HeatmapCalendar } from '../HeatmapCalendar';
import { useVirtualizer } from '@tanstack/react-virtual';
import { audioEngine } from '../../utils/audioEngine';
import { motion, AnimatePresence } from 'framer-motion';
import { useFluxMath } from '../../hooks/useFluxMath';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';

// Row Component extracted logic
const renderDrawRow = (draw: DrawResult, onSimilarity: (d: DrawResult) => void, onExamine: (d: DrawResult) => void) => {
    if (!draw) return null;

    // Détection rapide si Machine a des numéros
    const hasMachine = draw.machine && draw.machine.length > 0;
    
    // Somme pour donner un indicateur visuel rapide (Densité)
    const sum = draw.gagnants.reduce((a,b) => a+b, 0);
    const sumColor = sum > 250 ? 'text-rose-400' : sum < 180 ? 'text-blue-400' : 'text-slate-400';

    return (
        <div className="px-1 h-full pb-3">
            <div 
                className="bg-white dark:bg-slate-900/60 p-4 sm:p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg dark:hover:shadow-indigo-500/5 hover:border-indigo-400/50 dark:hover:border-indigo-500/50 transition-all duration-300 group relative overflow-hidden h-full flex flex-col justify-center cursor-default backdrop-blur-sm"
                onClick={() => { audioEngine.play('click'); onExamine(draw); }}
            >
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 w-full relative z-10">
                    {/* Meta Info */}
                    <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center w-full md:w-auto md:min-w-[140px] text-left">
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{draw.drawName}</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl md:text-2xl font-black text-slate-800 dark:text-white leading-none tracking-tighter">
                                    {formatDate(draw.date).split('/')[0]} <span className="text-slate-400 dark:text-slate-500 text-sm ml-0.5">{['JAN','FEV','MAR','AVR','MAI','JUN','JUL','AOU','SEP','OCT','NOV','DEC'][parseInt(formatDate(draw.date).split('/')[1])-1] || formatDate(draw.date).split('/')[1]}</span>
                                </span>
                                <span className="text-[10px] font-mono font-bold text-slate-400 border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 rounded-md">
                                    {formatDate(draw.date).split('/')[2]}
                                </span>
                            </div>
                        </div>
                        <div className="md:hidden flex gap-2">
                             {/* Mobile Actions */}
                             <button onClick={(e) => { e.stopPropagation(); onSimilarity(draw); }} className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl active:scale-95"><GitCompare size={14}/></button>
                        </div>
                    </div>
                    
                    {/* Numbers */}
                    <div className="flex flex-col items-center gap-3 w-full md:w-auto flex-1">
                        <div className="flex gap-1.5 md:gap-2 flex-wrap justify-center">
                            {draw.gagnants.map((n, i) => <NumberBall key={`${n}-${i}`} number={n} size="sm" />)}
                        </div>
                        {hasMachine && (
                            <div className="flex items-center gap-3 px-4 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80 w-full md:w-auto justify-center">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                                    <Binary size={10}/> MAC
                                </span>
                                <div className="flex gap-2 flex-wrap justify-center items-center">
                                    {draw.machine!.map((n, i) => (
                                        <span key={`${n}-${i}`} className="text-xs font-mono font-bold text-slate-500 w-5 text-center">{n}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stats & Actions (Desktop) */}
                    <div className="hidden md:flex items-center gap-5">
                        <div className="text-center px-4 py-2 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800/80 min-w-[70px]">
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Somme</div>
                            <div className={`text-sm font-black ${sumColor}`}>{sum}</div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <button onClick={(e) => { e.stopPropagation(); onSimilarity(draw); }} className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:scale-110 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all shadow-sm" title="Trouver Similitudes">
                                <GitCompare size={16} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onExamine(draw); }} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:scale-110 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm" title="Audit Complet">
                                <SearchCode size={16} />
                            </button>
                        </div>
                    </div>
                </div>
                
                {/* Visual indicator on hover */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            </div>
        </div>
    );
};

export const FluxHub: React.FC<{ history: DrawResult[] }> = ({ history }) => {
  const currentDrawName = useNexusStore(state => state.currentDrawName);
  const refreshData = useNexusStore(state => state.refreshData);
  const loading = useNexusStore(state => state.loading);
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [similarityTarget, setSimilarityTarget] = useState<DrawResult | null>(null);
  const [examiningDraw, setExaminingDraw] = useState<DrawResult | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [cyberFilter, setCyberFilter] = useState<'all' | 'entropy_high' | 'entropy_low' | 'harmonic_even' | 'harmonic_odd'>('all');

  const handleManualRefresh = async () => {
      if (!currentDrawName) return;
      showToast("Synchronisation API...", "info");
      audioEngine.play('scan');
      await syncDrawExternal(currentDrawName);
      await refreshData(currentDrawName, true);
      showToast("Flux mis à jour.", "success");
      audioEngine.play('success');
  };

  // Assurer l'isolation hermétique et la convergence (TIRAGE ISOLATION RULE)
  const purifiedHistory = useMemo(() => {
      return purifyHistoryForDraw(currentDrawName, history);
  }, [currentDrawName, history]);

  // Filtrage cybernétique multicouche déterministe
  const filteredHistory = useMemo(() => {
      let result = purifiedHistory;

      // 1. Recherche plein texte / numéros
      if (searchTerm) {
          const term = searchTerm.toLowerCase();
          result = result.filter(h => 
              formatDate(h.date).includes(term) || 
              h.gagnants.some(n => n.toString() === term) ||
              h.drawName.toLowerCase().includes(term)
          );
      }

      // 2. Filtres cybernétiques complexes de distribution
      if (cyberFilter !== 'all') {
          // Évaluation préliminaire des moyennes de somme globales pour évaluer entropie locale
          const sums = result.map(h => h.gagnants.reduce((a, b) => a+b, 0));
          const meanSum = sums.length > 0 ? (sums.reduce((a, b) => a+b, 0) / sums.length) : 0;
          
          result = result.filter(h => {
              const hSum = h.gagnants.reduce((a, b) => a+b, 0);
              const evens = h.gagnants.filter(n => n % 2 === 0).length;
              const odds = h.gagnants.length - evens;

              if (cyberFilter === 'entropy_high') {
                  // Écart de somme faible par rapport au centre gravitationnel
                  return Math.abs(hSum - meanSum) <= 15;
              }
              if (cyberFilter === 'entropy_low') {
                  // Écart de somme élevé par rapport au centre gravitationnel (Anomalies spectrales)
                  return Math.abs(hSum - meanSum) > 15;
              }
              if (cyberFilter === 'harmonic_even') {
                  // Dominante de nombres pairs
                  return evens > odds;
              }
              if (cyberFilter === 'harmonic_odd') {
                  // Dominante de nombres impairs
                  return odds > evens;
              }
              return true;
          });
      }

      return result;
  }, [history, searchTerm, cyberFilter]);

  // Utilisation du Web Worker pour évaluer les métriques cybernétiques sur le flux filtré
    // @ts-ignore - auto generated by cleanup
  const { metrics, isCalculating } = useFluxMath(filteredHistory);
  const { entropyStats, hurstStats, speedStats, spectrumStats, topCorrelations, trajectoryPoints } = metrics;

  if (loading && history.length === 0) return <ListSkeleton />;

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
      count: filteredHistory.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => window.innerWidth < 768 ? 165 : 140, // Responsive height estimation based on refined UI padding
      overscan: 5,
  });

  return (
    <div className="space-y-6 animate-fade-in pb-4 w-full max-w-7xl mx-auto px-1 md:px-0 h-[calc(100dvh-210px)] md:h-[calc(100dvh-220px)] flex flex-col">
        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-4 sm:p-5 rounded-[2rem] shadow-xl border border-slate-200/60 dark:border-slate-800/60 relative z-30 mx-auto w-full shrink-0">
            <div className="flex items-center gap-4 px-2 w-full md:w-auto">
                <div className="p-3 bg-indigo-600 dark:bg-indigo-500 rounded-2xl text-white shadow-lg shadow-indigo-500/30 ring-4 ring-indigo-50 dark:ring-indigo-900/30">
                    <Activity size={20} />
                </div>
                <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider mb-0.5">Master Flux</h3>
                    <div className="flex items-center gap-2">
                        <Clock size={12} className="text-indigo-400" />
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{filteredHistory.length} Signatures</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-2.5 w-full md:w-auto justify-center sm:justify-end">
                {/* View Switcher */}
                <div className="flex bg-slate-100/80 dark:bg-slate-950/50 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                    <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-800 shadow-md text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Liste"><Activity size={16}/></button>
                    <button onClick={() => setViewMode('calendar')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-800 shadow-md text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Calendrier"><Calendar size={16}/></button>
                </div>

                <button 
                    onClick={() => { audioEngine.play('click'); setShowAnalytics(!showAnalytics); }} 
                    className={`px-4 py-2.5 rounded-2xl transition-all border text-xs font-black uppercase tracking-wider flex items-center gap-2 ${showAnalytics ? 'bg-indigo-600 text-white border-indigo-500 shadow-xl shadow-indigo-500/30 ring-2 ring-indigo-500/20 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : 'bg-slate-50 dark:bg-slate-950/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md'}`}
                    title="Analyse Métrique du Flux"
                >
                    <TrendingUp size={16} />
                    <span>Métrique</span>
                    {showAnalytics ? <ChevronUp size={14} className="ml-1 opacity-70" /> : <ChevronDown size={14} className="ml-1 opacity-70" />}
                </button>

                <div className="relative flex-1 sm:w-56 group min-w-[150px]">
                    <input 
                        type="text" 
                        placeholder="Rechercher (Date, N°)..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 font-bold text-xs outline-none focus:ring-4 ring-indigo-500/10 focus:border-indigo-400 transition-all text-slate-800 dark:text-white placeholder-slate-400 shadow-inner" 
                    />
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex gap-2.5">
                    <button onClick={() => ExportService.exportHistoryToCSV(history, `Flux_${currentDrawName}`)} className="p-3 bg-slate-50 dark:bg-slate-950/50 text-slate-600 dark:text-slate-300 rounded-2xl hover:bg-white dark:hover:bg-slate-800 transition border border-slate-200 dark:border-slate-800 hover:shadow-md" title="Export CSV">
                        <Download size={18}/>
                    </button>
                    <button onClick={handleManualRefresh} className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-500 active:scale-95 transition-all ring-2 ring-emerald-500/20 ring-offset-2 ring-offset-white dark:ring-offset-slate-900">
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""}/>
                    </button>
                </div>
            </div>
        </div>

        {/* Panel d'Analyse Cybernétique du Flux (Shannon & Hurst Spectral + Trajectory + Spectrum) */}
        <AnimatePresence>
            {showAnalytics && (
                <motion.div
                    initial={{ opacity: 0, height: 0, y: -20 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -20 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden w-full shrink-0 relative z-10"
                >
                    <div className="bg-slate-900 dark:bg-slate-950/80 backdrop-blur-3xl p-6 md:p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl shadow-indigo-500/10 mb-4 space-y-8 relative overflow-hidden">
                        {/* Background Elements */}
                        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        
                        {/* Title block */}
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 ring-1 ring-indigo-500/30 shadow-inner">
                                    <Cpu size={20} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black uppercase tracking-widest text-white">Analyse Cybernétique du Flux Réel</h4>
                                    <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">Calcul matriciel de l'entropie spectrale de Shannon et auto-corrélation temporelle de Hurst.</p>
                                </div>
                            </div>
                            <div className="text-right hidden sm:block">
                                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-slate-700/50 uppercase shadow-sm">
                                    {currentDrawName || 'Global'}
                                </span>
                            </div>
                        </div>

                        {/* Cyber Cohort Selector Block */}
                        <div className="flex flex-col gap-3 bg-slate-950/40 p-4 rounded-3xl border border-slate-800/60 relative z-10">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                <Layers size={14} className="text-indigo-500" />
                                Sélection Cohortes Cybernétiques
                            </span>
                            <div className="flex flex-wrap gap-2.5">
                                {([
                                    { id: 'all', label: 'Harmonique Totale', desc: 'Flux originel brut' },
                                    { id: 'entropy_high', label: 'Filtre Stochastique Stable', desc: 'Sommes équilibrées' },
                                    { id: 'entropy_low', label: 'Anomalies de Dérive', desc: 'Sommes déviantes' },
                                    { id: 'harmonic_even', label: 'Cohorte Paire', desc: 'Dominance paire' },
                                    { id: 'harmonic_odd', label: 'Cohorte Impaire', desc: 'Dominance impaire' }
                                ] as const).map((cohort) => (
                                    <button
                                        key={cohort.id}
                                        onClick={() => { audioEngine.play('click'); setCyberFilter(cohort.id); }}
                                        className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${cyberFilter === cohort.id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/20 ring-offset-2 ring-offset-slate-900' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-700'}`}
                                        title={cohort.desc}
                                    >
                                        {cohort.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Trajectoire en pur SVG déterministe */}
                        {trajectoryPoints.length > 0 ? (
                            <div className="bg-slate-950/60 p-5 md:p-6 rounded-3xl border border-slate-800/60 relative z-10">
                                <div className="flex justify-between items-center mb-5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <TrendingUp size={14} className="text-indigo-400" />
                                        Trajectoire Temporelle du Chaos (Sommes de Tirage)
                                    </span>
                                    <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-widest border border-slate-800 px-2 py-1 rounded-lg">
                                        Série relative (T-24 ➜ T)
                                    </span>
                                </div>
                                <div className="h-32 w-full relative">
                                    <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 120" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="cyber-gradient" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                                                <stop offset="50%" stopColor="#a855f7" stopOpacity="0.8" />
                                                <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
                                            </linearGradient>
                                        </defs>
                                        {/* Ligne médiane de somme moyenne */}
                                        <line x1="0" y1="60" x2="1000" y2="60" stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
                                        
                                        {/* Path de la courbe */}
                                        {trajectoryPoints.length > 1 && (() => {
                                            const pathData = trajectoryPoints.map((pt, index) => {
                                                const x = (index / (trajectoryPoints.length - 1)) * 1000;
                                                return `${index === 0 ? 'M' : 'L'} ${x} ${pt.normY}`;
                                            }).join(' ');
                                            
                                            return <path d={pathData} stroke="url(#cyber-gradient)" strokeWidth="2" fill="none" className="transition-all duration-300 animate-dash" />;
                                        })()}
                                        
                                        {/* Points et étiquettes */}
                                        {trajectoryPoints.map((pt, index) => {
                                            const x = (index / (trajectoryPoints.length - 1)) * 1000;
                                            return (
                                                <g key={index} className="group/dot cursor-pointer">
                                                    <circle 
                                                        cx={x} 
                                                        cy={pt.normY} 
                                                        r="3.5" 
                                                        className="fill-indigo-600 dark:fill-indigo-400 stroke-slate-950 transition-all duration-200 group-hover/dot:r-5 focus:outline-none" 
                                                        strokeWidth="1.5"
                                                    />
                                                    <title>{`Tirage: ${pt.label}\nSomme: ${pt.sum}`}</title>
                                                </g>
                                            );
                                        })}
                                    </svg>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center p-4 text-[10px] text-slate-500 uppercase">Aucune trajectoire évaluable avec le filtre actif.</div>
                        )}

                        {/* Metriques Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 relative z-10">
                            {/* Card 1: Hurst Exponent */}
                            <div className="bg-slate-950/60 p-5 rounded-[2rem] border border-slate-800/60 hover:border-slate-700/60 transition-all flex flex-col justify-between group/card shadow-lg shadow-black/20">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Exposant de Hurst</span>
                                    <div className="text-amber-400 p-1.5 bg-amber-500/10 rounded-lg group-hover/card:bg-amber-500/20 transition-colors" title="Signifie le caractère persistant ou anti-persistant de la suite numérique.">
                                        <Info size={14} />
                                    </div>
                                </div>
                                <div className="my-3">
                                    <div className={`text-3xl font-mono font-black tracking-tighter ${hurstStats.color}`}>
                                        {hurstStats.hurst.toFixed(4)}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 mt-2 uppercase flex items-center gap-2 tracking-widest">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                                        {hurstStats.interpretation}
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500/80 leading-relaxed font-medium">
                                    Si H &gt; 0.5, la dynamique du tirage est persistante. H &lt; 0.5 signale un effet de retour systématique vers la moyenne.
                                </p>
                            </div>

                            {/* Card 2: Shannon Entropy */}
                            <div className="bg-slate-950/60 p-5 rounded-[2rem] border border-slate-800/60 hover:border-slate-700/60 transition-all flex flex-col justify-between group/card shadow-lg shadow-black/20">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Entropie de Shannon</span>
                                    <div className="text-indigo-400 p-1.5 bg-indigo-500/10 rounded-lg group-hover/card:bg-indigo-500/20 transition-colors">
                                        <Info size={14} />
                                    </div>
                                </div>
                                <div className="my-3">
                                    <div className="text-3xl font-mono font-black tracking-tighter text-indigo-300">
                                        {entropyStats.entropy.toFixed(4)} <span className="text-xs text-slate-500 font-sans tracking-widest uppercase ml-1">bits</span>
                                    </div>
                                    <div className="text-[10px] font-bold text-indigo-400 mt-2 uppercase tracking-widest">
                                        Pureté spectrale : {(entropyStats.normalized * 100).toFixed(1)}%
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500/80 leading-relaxed font-medium">
                                    Quantifie le désordre pur. Un score de 100% indique une dispersion parfaitement uniforme sur tout le domaine du tirage.
                                </p>
                            </div>

                            {/* Card 3: Topological Velocity */}
                            <div className="bg-slate-950/60 p-5 rounded-[2rem] border border-slate-800/60 hover:border-slate-700/60 transition-all flex flex-col justify-between group/card shadow-lg shadow-black/20">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vitesse Topologique</span>
                                    <div className="text-rose-400 p-1.5 bg-rose-500/10 rounded-lg group-hover/card:bg-rose-500/20 transition-colors">
                                        <Info size={14} />
                                    </div>
                                </div>
                                <div className="my-3">
                                    <div className="text-3xl font-mono font-black tracking-tighter text-rose-400">
                                        {speedStats.topoSpeed.toFixed(2)}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                                        Distance euclidienne
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500/80 leading-relaxed font-medium">
                                    Mesure le déplacement géométrique du vecteur de tirage T à T+1 sur une échelle ordonnée de numéros.
                                </p>
                            </div>

                            {/* Card 4: Signal Deviance */}
                            <div className="bg-slate-950/60 p-5 rounded-[2rem] border border-slate-800/60 hover:border-slate-700/60 transition-all flex flex-col justify-between group/card shadow-lg shadow-black/20">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Déviation Signal</span>
                                    <div className="text-sky-400 p-1.5 bg-sky-500/10 rounded-lg group-hover/card:bg-sky-500/20 transition-colors">
                                        <Info size={14} />
                                    </div>
                                </div>
                                <div className="my-3 flex items-baseline gap-2">
                                    <div className="text-3xl font-mono font-black tracking-tighter text-slate-200">
                                        {speedStats.meanSum.toFixed(1)}
                                    </div>
                                    <span className="text-sm font-mono text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded-lg border border-sky-500/20">
                                        ±{speedStats.stdSum.toFixed(1)}
                                    </span>
                                </div>
                                <p className="text-[10px] text-slate-500/80 leading-relaxed font-medium">
                                    Centre gravitationnel de la somme des numéros du flux. Utile pour identifier les déséquilibres de distribution de masse.
                                </p>
                            </div>
                        </div>

                        {/* Spectrogramme spectral des Nombres */}
                        {spectrumStats.raw.length > 0 && (
                            <div className="bg-slate-950/60 p-5 md:p-6 rounded-3xl border border-slate-800/60 relative z-10 shadow-lg shadow-black/10">
                                <div className="flex justify-between items-center mb-5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <Binary size={14} className="text-indigo-400" />
                                        Densitométrie Spectrale des Numéros Actifs (Z-Score)
                                    </span>
                                    <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-widest border border-slate-800 px-2 py-1 rounded-lg">
                                        Top 10 - Concentration de Phase
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
                                    {spectrumStats.raw.slice(0, 10).map((sp) => {
                                        const zPct = Math.min(Math.max((sp.zScore + 2) / 4 * 100, 10), 95); // normalisé
                                        const barBg = sp.zScore > 0.8 ? 'bg-rose-500' : sp.zScore < -0.8 ? 'bg-sky-500' : 'bg-indigo-500';
                                        const numBg = sp.zScore > 0.8 ? 'bg-rose-500/10' : sp.zScore < -0.8 ? 'bg-sky-500/10' : 'bg-indigo-500/10';
                                        const numColor = sp.zScore > 0.8 ? 'text-rose-400 border-rose-500/30' : sp.zScore < -0.8 ? 'text-sky-400 border-sky-500/30' : 'text-indigo-400 border-indigo-500/30';
                                        return (
                                            <div key={sp.num} className={`border p-3 rounded-[1.25rem] flex flex-col justify-between bg-slate-900/80 backdrop-blur-sm ${numBg} ${numColor} shadow-inner hover:scale-105 transition-transform cursor-default group/sp`}>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[14px] font-mono font-black">
                                                        {sp.num}
                                                    </span>
                                                    <span className="text-[10px] font-mono font-bold opacity-70 bg-slate-950/50 px-1.5 py-0.5 rounded-md">
                                                        {sp.count}x
                                                    </span>
                                                </div>
                                                <div className="mt-3 space-y-1.5">
                                                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden ring-1 ring-white/5">
                                                        <div className={`h-full ${barBg} transition-all duration-500 ease-out`} style={{ width: `${zPct}%` }} />
                                                    </div>
                                                    <div className="flex justify-between text-[8px] opacity-70 font-mono tracking-widest uppercase">
                                                        <span>Z-Score</span>
                                                        <span className="font-bold">{sp.zScore > 0 ? '+' : ''}{sp.zScore.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Correlations and Pairs block */}
                        {topCorrelations.length > 0 && (
                            <div className="bg-slate-950/40 p-5 md:p-6 rounded-3xl border border-slate-800/40 relative z-10">
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-4">
                                    <BarChart3 size={14} className="text-indigo-400" />
                                    Top 5 des Corrélations de Premier Degré (Paires les plus Fréquentes)
                                </h5>
                                <div className="flex flex-wrap gap-3">
                                    {topCorrelations.map((item, index) => (
                                        <div 
                                            key={`${item.pair[0]}-${item.pair[1]}`} 
                                            className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl hover:border-indigo-500/50 hover:bg-slate-800 transition-all cursor-default shadow-sm group/pair"
                                        >
                                            <span className="text-[11px] font-mono text-indigo-400 font-black opacity-80 group-hover/pair:opacity-100">#{index + 1}</span>
                                            <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-slate-200">
                                                <span className="px-2 py-1 bg-slate-950 rounded-lg shadow-inner">{item.pair[0]}</span>
                                                <span className="text-slate-600 text-xs">+</span>
                                                <span className="px-2 py-1 bg-slate-950 rounded-lg shadow-inner">{item.pair[1]}</span>
                                            </div>
                                            <span className="text-[10px] font-bold text-emerald-400 uppercase bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 font-mono ml-2">
                                                {item.count} occ.
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Similarity Overlay */}
        {similarityTarget && (
            <div className="relative animate-slide-up mx-auto w-full mb-4 shrink-0 z-20">
                <button onClick={() => setSimilarityTarget(null)} className="absolute top-4 right-4 z-10 p-2 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-500 hover:text-rose-500 transition font-bold text-xs shadow-sm">Fermer</button>
                <SimilarityFinder currentDraw={similarityTarget} history={purifiedHistory} />
            </div>
        )}

        {/* CALENDAR VIEW */}
        {viewMode === 'calendar' && (
            <div className="animate-fade-in mx-auto w-full overflow-x-auto pb-4 shrink-0">
                <div className="min-w-max flex justify-center p-4">
                    <HeatmapCalendar history={purifiedHistory} />
                </div>
            </div>
        )}

        {/* VIRTUALIZED LIST VIEW */}
        {viewMode === 'list' && (
            <div ref={parentRef} className="flex-1 w-full overflow-y-auto overflow-x-hidden min-h-0 bg-transparent scrollbar-hide py-2">
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const draw = filteredHistory[virtualRow.index];
                        return (
                             <div
                                 key={draw ? `${draw.id}_${virtualRow.key}` : virtualRow.key}
                                 style={{
                                     position: 'absolute',
                                     top: 0,
                                     left: 0,
                                     width: '100%',
                                     height: `${virtualRow.size}px`,
                                     transform: `translateY(${virtualRow.start}px)`,
                                 }}
                             >
                                 {renderDrawRow(draw, setSimilarityTarget, setExaminingDraw)}
                             </div>
                        );
                    })}
                </div>
            </div>
        )}

        {examiningDraw && <DrawExamine result={examiningDraw} history={purifiedHistory} onClose={() => setExaminingDraw(null)} />}
    </div>
  );
};
