import React, { useMemo, useState, useEffect } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { NumberBall } from '../NumberBall';
import { gapSequencePatternService } from '../../services/prediction/gapSequencePatternService';
import { sequencePatternAnalyzer } from '../../services/prediction/sequencePatternAnalyzer';
import { StatsSkeleton } from '../skeletons/StatsSkeleton';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  Cell
} from 'recharts';
import { 
  Activity, 
  Brain, 
  Sparkles, 
  Sliders, 
  Search, 
  Flame, 
  Info,
  Compass,
  Settings,
  Layers,
  ChevronRight
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

export const GapPatternTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const history = useNexusStore(state => state.history);
  const loading = useNexusStore(state => state.loading);

  const [selectedNum, setSelectedNum] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'number' | 'gap' | 'mean' | 'lag1' | 'signal'>('signal');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // SequencePatternAnalyzer Configuration
  const [windowSize, setWindowSize] = useState<number>(3);
  const [minRecurrence, setMinRecurrence] = useState<number>(0.5);

  // Compute Gap Sequence Analysis report reactively on history or draw change
  const report = useMemo(() => {
    if (!history || history.length === 0) return null;
    return gapSequencePatternService.analyzePatterns(drawName, history);
  }, [drawName, history]);

  // Compute sliding window sequence patterns dynamically
  const sequencePatternResults = useMemo(() => {
    if (!history || history.length === 0) return null;
    return sequencePatternAnalyzer.analyze(drawName, history, {
      slidingWindowSize: windowSize,
      minRecurrenceThreshold: minRecurrence,
      maxNumber: 90
    });
  }, [drawName, history, windowSize, minRecurrence]);

  const selectedSequencePattern = useMemo(() => {
    if (!sequencePatternResults) return null;
    return sequencePatternResults.find(r => r.number === selectedNum) || null;
  }, [sequencePatternResults, selectedNum]);

  const bestMatch = useMemo(() => {
    return selectedSequencePattern?.bestMatch || null;
  }, [selectedSequencePattern]);

  // Set default selected number when report loads
  useEffect(() => {
    if (report && report.topResonatingNumbers.length > 0) {
      setSelectedNum(report.topResonatingNumbers[0]);
    }
  }, [report]);

  const selectedStats = useMemo(() => {
    if (!report) return null;
    return report.stats[selectedNum] || null;
  }, [report, selectedNum]);

  // Transform sequence for charts
  const sequenceChartData = useMemo(() => {
    if (!selectedStats) return [];
    // Show last 25 gaps for readability
    return selectedStats.gaps.slice(-25).map((gap, index) => ({
      index: index + 1,
      gap,
      mean: selectedStats.meanGap,
      expected: selectedStats.expectedNextGap
    }));
  }, [selectedStats]);

  // Global distribution data filtered for first 30 gaps
  const distributionChartData = useMemo(() => {
    if (!report) return [];
    return report.generalDistribution.slice(0, 30);
  }, [report]);

  // Sorted full table list
  const sortedStatsList = useMemo(() => {
    if (!report) return [];
    const list = Object.values(report.stats);
    
    return list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      
      if (sortBy === 'number') { valA = a.number; valB = b.number; }
      else if (sortBy === 'gap') { valA = a.currentGap; valB = b.currentGap; }
      else if (sortBy === 'mean') { valA = a.meanGap; valB = b.meanGap; }
      else if (sortBy === 'lag1') { valA = a.autocorrelationLag1; valB = b.autocorrelationLag2; }
      else if (sortBy === 'signal') { valA = a.signalScore; valB = b.signalScore; }
      
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [report, sortBy, sortOrder]);

  const filteredStatsList = useMemo(() => {
    if (!sortedStatsList) return [];
    if (!searchTerm.trim()) return sortedStatsList;
    const query = parseInt(searchTerm.trim());
    if (isNaN(query)) return [];
    return sortedStatsList.filter(s => s.number === query);
  }, [sortedStatsList, searchTerm]);

  if (loading || !report) return <StatsSkeleton />;

  const handleSelectNumber = (num: number) => {
    try { audioEngine.play('click'); } catch(e) {}
    setSelectedNum(num);
  };

  const handleToggleSort = (field: 'number' | 'gap' | 'mean' | 'lag1' | 'signal') => {
    try { audioEngine.play('click'); } catch(e) {}
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const CustomGapTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950/95 border border-slate-800 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs font-bold font-sans">
          <p className="text-white mb-1.5 uppercase tracking-wider text-[10px] text-slate-400">Index de Tirage: {payload[0].payload.index}</p>
          <p className="text-amber-400">Écart observé: <span className="text-white font-black">{payload[0].value}</span></p>
          {payload[1] && <p className="text-emerald-400">Moyenne historique: <span className="text-white font-black">{payload[1].value}</span></p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12 w-full overflow-hidden">
      
      {/* HEADER HERO */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900/40 to-emerald-950/20 p-6 md:p-8 rounded-[2.5rem] border border-indigo-500/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Brain size={140} className="text-emerald-500 animate-pulse" />
        </div>
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest">
            <Activity size={12} className="animate-pulse" />
            Moteur de Retour à la Moyenne Continûment Différentiable
          </div>
          <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white leading-tight">
            Analyseur Prédictif des Séquences d'Écarts
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl font-medium">
            Ce module modélise mathématiquement les cycles d'écarts de chaque numéro en tant que processus autorégressif de Lag-1 déterministe. 
            Il calcule l'autocorrélation temporelle, la variance continue short/long-term, et extrait la résonance fréquentielle pour isoler les dérives de convergence.
          </p>
        </div>
      </div>

      {/* TOP DECK: RESONANCE & FATIGUE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        
        {/* TOP RESONANCE */}
        <div className="bg-white dark:bg-slate-800/80 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Compass size={80} className="text-amber-500 animate-spin" style={{ animationDuration: '60s' }} />
          </div>
          <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <Sparkles className="text-amber-500 animate-pulse" size={18}/> Top 10 Résonances Actuelles
          </h4>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black mb-6">
            Numéros dont l'écart actuel correspond parfaitement à la projection cyclique d'autocorrélation (Lag-1)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {report.topResonatingNumbers.map((num) => {
              const stat = report.stats[num];
              const isSelected = selectedNum === num;
              return (
                <button
                  key={num}
                  onClick={() => handleSelectNumber(num)}
                  className={`flex flex-col items-center p-3 rounded-2xl transition-all border text-center ${
                    isSelected 
                      ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 scale-105 z-10' 
                      : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100/40 dark:border-slate-800/50 hover:border-amber-500/40'
                  }`}
                >
                  <div className="mb-2">
                    <NumberBall number={num} size="sm" />
                  </div>
                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                    Gap: {stat.currentGap}
                  </span>
                  <span className="text-[9px] text-amber-500 font-extrabold uppercase mt-1">
                    R: {Math.round(stat.resonanceScore * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TOP FATIGUE */}
        <div className="bg-white dark:bg-slate-800/80 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Flame size={80} className="text-emerald-500" />
          </div>
          <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <Flame className="text-emerald-500 animate-pulse" size={18}/> Top 10 Fatigue / Surretard
          </h4>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black mb-6">
            Numéros ayant le retard le plus anormal au vu de leur propre historique (Normal CDF inverse)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {report.topFatigueNumbers.map((num) => {
              const stat = report.stats[num];
              const isSelected = selectedNum === num;
              return (
                <button
                  key={num}
                  onClick={() => handleSelectNumber(num)}
                  className={`flex flex-col items-center p-3 rounded-2xl transition-all border text-center ${
                    isSelected 
                      ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20 scale-105 z-10' 
                      : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100/40 dark:border-slate-800/50 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="mb-2">
                    <NumberBall number={num} size="sm" />
                  </div>
                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                    Gap: {stat.currentGap}
                  </span>
                  <span className="text-[9px] text-emerald-500 font-extrabold uppercase mt-1">
                    F: {Math.round(stat.fatigueScore * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* MIDDLE SECTION: DETAIL OF SELECTED NUMBER & CHART */}
      {selectedStats && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white dark:bg-slate-800/80 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 shadow-sm">
          
          {/* PROFILE DATA (COL 4) */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <NumberBall number={selectedNum} size="lg" />
                <div>
                  <h4 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                    Profil d'Écarts {selectedNum}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                    Moteur de convergence harmonique
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-100/30 dark:border-slate-800/60">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Écart Actuel</span>
                  <span className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                    {selectedStats.currentGap}
                    {selectedStats.currentGap > selectedStats.meanGap ? (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded font-bold uppercase">Overdue</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/10 text-sky-500 rounded font-bold uppercase">Rapid</span>
                    )}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-100/30 dark:border-slate-800/60">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Écart Moyen (Historique)</span>
                  <span className="text-xl font-black text-slate-800 dark:text-white">
                    {selectedStats.meanGap}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-100/30 dark:border-slate-800/60">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Écart Max</span>
                  <span className="text-xl font-black text-slate-800 dark:text-white">
                    {selectedStats.maxGap}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-100/30 dark:border-slate-800/60">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Autocorrélation Lag-1</span>
                  <span className={`text-xl font-black flex items-center gap-1 ${
                    selectedStats.autocorrelationLag1 > 0.1 
                      ? 'text-emerald-500' 
                      : selectedStats.autocorrelationLag1 < -0.1 
                      ? 'text-amber-500' 
                      : 'text-slate-500'
                  }`}>
                    {selectedStats.autocorrelationLag1 > 0 ? '+' : ''}{selectedStats.autocorrelationLag1.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* SIGNAL GAUGES */}
              <div className="space-y-3 mt-6 border-t border-slate-100 dark:border-slate-800/60 pt-6">
                <div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    <span>Indice de Fatigue (Due-Factor) :</span>
                    <span className="text-emerald-500 font-extrabold">{Math.round(selectedStats.fatigueScore * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${selectedStats.fatigueScore * 100}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    <span>Indice de Résonance Cyclique :</span>
                    <span className="text-amber-500 font-extrabold">{Math.round(selectedStats.resonanceScore * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${selectedStats.resonanceScore * 100}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    <span>Facteur de Compression (Volatility Pinch) :</span>
                    <span className="text-indigo-500 font-extrabold">{selectedStats.compressionFactor.toFixed(2)}x</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, selectedStats.compressionFactor * 50)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-950/20 to-slate-950/20 p-4 rounded-2xl border border-indigo-500/10 text-[10px] text-slate-400 leading-relaxed font-bold">
              <span className="text-indigo-400 font-extrabold uppercase block mb-1">Projection Temporelle :</span>
              Écart mathématiquement attendu pour le prochain tirage : <span className="text-white font-extrabold">{selectedStats.expectedNextGap}</span> tirages.
              La résonance est maximale lorsque l'écart actuel ({selectedStats.currentGap}) approche de cette valeur.
            </div>
          </div>

          {/* HISTORICAL SEQUENCE CHART (COL 8) */}
          <div className="lg:col-span-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-6">
                <div>
                  <h5 className="text-xs md:text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                    Séquence Temporelle des 25 Derniers Écarts
                  </h5>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                    Ligne d'onde d'écarts observés vs moyenne historique
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-bold">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="inline-block w-3 h-0.5 bg-indigo-500" /> Observé
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="inline-block w-3 h-0.5 bg-emerald-500 stroke-dasharray-3" /> Moyenne
                  </div>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sequenceChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} vertical={false} />
                    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} />
                    <Tooltip content={<CustomGapTooltip />} />
                    <ReferenceLine y={selectedStats.meanGap} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1.5} />
                    <Line 
                      type="monotone" 
                      dataKey="gap" 
                      name="Écart"
                      stroke="#6366f1" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#6366f1', strokeWidth: 1.5, stroke: '#1e293b' }} 
                      activeDot={{ r: 6, strokeWidth: 0 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100/30 dark:border-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-500">
                <Info size={14} className="text-indigo-400 flex-shrink-0" />
                <span>Score Signal de Synthèse :</span>
                <span className="text-indigo-500 font-extrabold text-sm">{selectedStats.signalScore}%</span>
              </div>
              <div className="flex gap-2">
                <div className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg font-black uppercase text-[10px]">
                  {selectedStats.autocorrelationLag1 > 0 ? '🔄 Tendance Persistante' : '🔀 Retour d\'Oscillation'}
                </div>
                <div className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg font-black uppercase text-[10px]">
                  Confiance : 88%
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* SECTION EXCLUSIVE : ANALYSEUR SÉQUENTIEL PAR FENÊTRE GLISSANTE */}
      {selectedSequencePattern && (
        <div className="bg-white dark:bg-slate-800/80 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 shadow-sm relative overflow-hidden space-y-6">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <Sliders size={120} className="text-indigo-500 animate-pulse" />
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-100 dark:border-slate-800/80 pb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest mb-2">
                <Settings size={12} className="animate-spin" style={{ animationDuration: '10s' }} />
                Contrôle Stochastique Déterministe
              </div>
              <h4 className="text-sm md:text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Layers className="text-indigo-500" size={18} /> SequencePatternAnalyzer : Détection de Récurrences Séquentielles
              </h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black">
                Ajustement en temps réel de l'algorithme d'affinité séquentielle pour le numéro {selectedNum}
              </p>
            </div>

            {/* CONFIGURATION CONTROLS */}
            <div className="flex flex-wrap items-center gap-6 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100/40 dark:border-slate-800/60">
              {/* SLIDING WINDOW SIZE */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Taille de la Fenêtre Glissante (N-Gaps) : <span className="text-indigo-500 font-extrabold">{windowSize}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400">2</span>
                  <input
                    type="range"
                    min="2"
                    max="5"
                    step="1"
                    value={windowSize}
                    onChange={(e) => {
                      try { audioEngine.play('click'); } catch(e) {}
                      setWindowSize(parseInt(e.target.value));
                    }}
                    className="w-32 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-[9px] font-bold text-slate-400">5</span>
                </div>
              </div>

              {/* MIN RECURRENCE THRESHOLD */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Seuil de Récurrence Minimal : <span className="text-indigo-500 font-extrabold">{minRecurrence.toFixed(1)}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400">0.1</span>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={minRecurrence}
                    onChange={(e) => {
                      try { audioEngine.play('click'); } catch(e) {}
                      setMinRecurrence(parseFloat(e.target.value));
                    }}
                    className="w-32 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-[9px] font-bold text-slate-400">2.0</span>
                </div>
              </div>
            </div>
          </div>

          {/* DETAILED RESULTS FOR SELECTED NUMBER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* CURRENT WINDOW & RECENT SEQUENCE */}
            <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-100/50 dark:border-slate-800/50 space-y-4">
              <div>
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                  Séquence Récente Active
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Derniers écarts consécutifs enregistrés chronologiquement pour ce numéro :
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {selectedSequencePattern.recentSequence && selectedSequencePattern.recentSequence.length > 0 ? (
                  selectedSequencePattern.recentSequence.map((gap, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="flex flex-col items-center justify-center w-11 h-11 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-500/30 text-indigo-500 dark:text-indigo-400">
                        <span className="text-sm font-black font-mono">{gap}</span>
                        <span className="text-[7px] uppercase font-black tracking-wider text-slate-400">Gap {i + 1}</span>
                      </div>
                      {i < selectedSequencePattern.recentSequence.length - 1 && (
                        <ChevronRight size={14} className="text-slate-300 dark:text-slate-700" />
                      )}
                    </div>
                  ))
                ) : (
                  <span className="text-xs font-bold text-slate-400 italic">Aucun écart suffisant</span>
                )}
              </div>
            </div>

            {/* MATCHED HISTORICAL PATTERN */}
            <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-100/50 dark:border-slate-800/50 space-y-4">
              <div>
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                  Meilleure Correspondance Séquentielle
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Pattern historique ayant la plus forte résonance de similarité gaussienne :
                </p>
              </div>

              {bestMatch ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    {bestMatch.pattern.map((gap, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <div className="px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded text-xs font-mono font-black text-slate-700 dark:text-slate-300">
                          {gap}
                        </div>
                        {i < bestMatch.pattern.length - 1 && (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </div>
                    ))}
                    <div className="ml-2 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-[9px] font-extrabold uppercase">
                      f: {bestMatch.frequency}x
                    </div>
                  </div>

                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 space-y-1">
                    <div>Prochain Écart attendu : <span className="text-slate-800 dark:text-white font-black">{bestMatch.nextExpectedGap}</span></div>
                    <div>Confiance de résonance : <span className="text-indigo-500 font-extrabold">{bestMatch.confidence}%</span></div>
                  </div>
                </div>
              ) : (
                <div className="h-12 flex items-center justify-center text-xs font-bold text-slate-400 italic">
                  Aucune récurrence détectée avec ce seuil
                </div>
              )}
            </div>

            {/* STOCHASTIC RESONANCE SCORE */}
            <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-100/50 dark:border-slate-800/50 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                  Score de Signal Déterministe
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Mesure de la probabilité de rupture par résonance de pattern stochastique :
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Score de Résonance</span>
                  <span className={`text-xl font-black font-mono ${
                    selectedSequencePattern.stochasticScore > 75 
                      ? 'text-emerald-500' 
                      : selectedSequencePattern.stochasticScore > 40 
                      ? 'text-indigo-500' 
                      : 'text-slate-400'
                  }`}>
                    {selectedSequencePattern.stochasticScore}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      selectedSequencePattern.stochasticScore > 75 
                        ? 'bg-emerald-500' 
                        : selectedSequencePattern.stochasticScore > 40 
                        ? 'bg-indigo-500' 
                        : 'bg-slate-400'
                    }`} 
                    style={{ width: `${selectedSequencePattern.stochasticScore}%` }} 
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* BOTTOM BENTO: FULL TABLE AND MATRIX */}
      <div className="bg-white dark:bg-slate-800/80 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-6">
        
        {/* INTERACTIVE NAVIGATION CONTROL */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-6">
          <div>
            <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-1 flex items-center gap-2 uppercase tracking-widest">
              <Sliders className="text-indigo-500" size={18}/> Cartographie Complète des Signaux
            </h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black">
              Filtrage et tri multi-critères des dynamiques de séquences de l'historique complet
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-full md:w-52">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600" size={14} />
              <input
                type="text"
                placeholder="Chercher numéro..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-full text-slate-700 dark:text-white placeholder-slate-400 font-bold focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* FULL LIST OF ALL 90 NUMBERS */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-sans">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800/80 text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-wider uppercase">
                <th className="pb-3 text-center cursor-pointer hover:text-indigo-500 transition-colors" onClick={() => handleToggleSort('number')}>
                  Numéro {sortBy === 'number' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="pb-3 text-center cursor-pointer hover:text-indigo-500 transition-colors" onClick={() => handleToggleSort('gap')}>
                  Écart Actuel {sortBy === 'gap' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="pb-3 text-center cursor-pointer hover:text-indigo-500 transition-colors" onClick={() => handleToggleSort('mean')}>
                  Écart Moyen {sortBy === 'mean' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="pb-3 text-center cursor-pointer hover:text-indigo-500 transition-colors" onClick={() => handleToggleSort('lag1')}>
                  Autocorrélation Lag-1 {sortBy === 'lag1' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="pb-3 text-center">Expected Next</th>
                <th className="pb-3 text-center">Fatigue Score</th>
                <th className="pb-3 text-center">Resonance Score</th>
                <th className="pb-3 text-center cursor-pointer hover:text-indigo-500 transition-colors" onClick={() => handleToggleSort('signal')}>
                  Signal Combiné {sortBy === 'signal' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="pb-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40 font-bold">
              {filteredStatsList.slice(0, searchTerm ? 5 : 20).map((s) => {
                const isSelected = selectedNum === s.number;
                return (
                  <tr 
                    key={s.number} 
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer ${
                      isSelected ? 'bg-indigo-500/5 dark:bg-indigo-500/10' : ''
                    }`}
                    onClick={() => handleSelectNumber(s.number)}
                  >
                    <td className="py-2.5 text-center flex items-center justify-center">
                      <NumberBall number={s.number} size="sm" />
                    </td>
                    <td className="py-2.5 text-center text-slate-800 dark:text-white font-extrabold text-sm">
                      {s.currentGap}
                    </td>
                    <td className="py-2.5 text-center text-slate-500">
                      {s.meanGap}
                    </td>
                    <td className={`py-2.5 text-center ${s.autocorrelationLag1 > 0.1 ? 'text-emerald-500' : s.autocorrelationLag1 < -0.1 ? 'text-amber-500' : 'text-slate-400'}`}>
                      {s.autocorrelationLag1 > 0 ? '+' : ''}{s.autocorrelationLag1}
                    </td>
                    <td className="py-2.5 text-center text-slate-500">
                      {s.expectedNextGap}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-black rounded-full ${
                        s.fatigueScore > 0.8 
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                          : s.fatigueScore > 0.5 
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-400'
                      }`}>
                        {Math.round(s.fatigueScore * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-black rounded-full ${
                        s.resonanceScore > 0.8 
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-400'
                      }`}>
                        {Math.round(s.resonanceScore * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-12 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-full rounded-full" 
                            style={{ width: `${s.signalScore}%` }} 
                          />
                        </div>
                        <span className="text-slate-800 dark:text-white font-black text-[11px] min-w-[28px] text-right">
                          {Math.round(s.signalScore)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectNumber(s.number);
                        }}
                        className={`text-[9px] uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                          isSelected 
                            ? 'bg-indigo-500 text-white border-indigo-600' 
                            : 'bg-transparent text-slate-400 hover:text-slate-800 dark:hover:text-white border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {isSelected ? 'Actif' : 'Voir'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!searchTerm && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 text-center font-bold">
            Affichage des 20 numéros les plus significatifs selon le critère de tri actif.
          </p>
        )}
      </div>

      {/* GLOBAL GEOMETRIC DISTRIBUTIONS CHART */}
      <div className="bg-white dark:bg-slate-800/80 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 shadow-sm">
        <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <Compass className="text-emerald-500" size={18}/> Distribution Empirique des Écarts Globaux
        </h4>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black mb-6">
          Densité historique cumulée de toutes les transitions pour analyser l'enveloppe exponentielle de décroissance
        </p>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distributionChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} vertical={false} />
              <XAxis dataKey="gap" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 'bold' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip cursor={{ fill: '#334155', opacity: 0.1 }} />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]}>
                {distributionChartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={index < 5 ? '#10b981' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};
