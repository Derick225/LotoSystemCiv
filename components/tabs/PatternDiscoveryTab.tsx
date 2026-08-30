import React, { useState, useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import {
  patternDiscoveryService,
  RecurringSequencePattern,
  PatternType,
  CyclePhase,
} from '../../services/prediction/patternDiscoveryService';
import { NumberBall } from '../NumberBall';
import {
  Workflow,
  Search,
  Sliders,
  ShieldCheck,
  Zap,
  TrendingUp,
  Clock,
  Layers,
  ArrowRight,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Copy,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';

interface PatternDiscoveryTabProps {
  drawName: string;
}

type FilterCategory = 'ALL' | 'PAIR' | 'TRIPLET' | 'TRANSITION' | 'PHASE' | 'PRIMED';

export const PatternDiscoveryTab: React.FC<PatternDiscoveryTabProps> = ({ drawName }) => {
  const history = useNexusStore((state) => state.history);
  const { showToast } = useToast();

  const [cycleLength, setCycleLength] = useState<number>(10);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('ALL');
  const [searchBall, setSearchBall] = useState<string>('');
  const [sortBy, setSortBy] = useState<'confidence' | 'lift' | 'zScore' | 'support' | 'recency'>('confidence');
  const [selectedPattern, setSelectedPattern] = useState<RecurringSequencePattern | null>(null);

  // Compute pattern discovery metrics
  const analysis = useMemo(() => {
    return patternDiscoveryService.discoverPatterns(drawName, history, {
      cycleLength,
      maxPatternsPerCategory: 40,
    });
  }, [drawName, history, cycleLength]);

  // Aggregate and filter patterns
  const filteredPatterns = useMemo(() => {
    let list: RecurringSequencePattern[] = [];

    if (activeCategory === 'ALL') {
      list = [
        ...analysis.topRecurringPairs,
        ...analysis.topRecurringTriplets,
        ...analysis.topCrossCycleTransitions,
      ];
    } else if (activeCategory === 'PAIR') {
      list = analysis.topRecurringPairs;
    } else if (activeCategory === 'TRIPLET') {
      list = analysis.topRecurringTriplets;
    } else if (activeCategory === 'TRANSITION') {
      list = analysis.topCrossCycleTransitions;
    } else if (activeCategory === 'PHASE') {
      list = analysis.topPhaseMotifs;
    } else if (activeCategory === 'PRIMED') {
      list = analysis.activePrimedPatterns;
    }

    // Filter by searched ball number
    if (searchBall.trim() !== '') {
      const targetNum = parseInt(searchBall.trim(), 10);
      if (!isNaN(targetNum)) {
        list = list.filter(
          (p) =>
            p.sequence.includes(targetNum) ||
            (p.targetSequence && p.targetSequence.includes(targetNum)) ||
            (p.completionCandidates && p.completionCandidates.includes(targetNum))
        );
      }
    }

    // Sort list
    return list.sort((a, b) => {
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'lift') return b.lift - a.lift;
      if (sortBy === 'zScore') return b.zScore - a.zScore;
      if (sortBy === 'support') return b.cycleSupport - a.cycleSupport;
      if (sortBy === 'recency') return a.lastSeenCycle - b.lastSeenCycle;
      return 0;
    });
  }, [analysis, activeCategory, searchBall, sortBy]);

  const handleCopyPattern = (seq: number[]) => {
    audioEngine.play('click');
    navigator.clipboard.writeText(seq.join(' - '));
    showToast(`Séquence copiée : [ ${seq.join(' - ')} ]`, 'success');
  };

  const getPhaseBadge = (phase: CyclePhase) => {
    if (phase === 'EARLY') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Phase Début (1-3)</span>;
    }
    if (phase === 'MID') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Phase Milieu (4-7)</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Phase Clôture (8-10)</span>;
  };

  return (
    <div className="w-full space-y-8 animate-fade-in font-sans">
      {/* Header & Strategic Insight */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Workflow size={20} />
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400">
                Analyse Séquentielle & Extraction de Motifs Multi-Cycles
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Pattern Discovery <span className="text-indigo-400">Hub</span>
            </h1>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Identification rigoureuse des séquences, tuples et cascades de transition récurrentes à travers les différents cycles de tirage de <strong className="text-emerald-400">{drawName}</strong>. Filtrage par validation stochastique continue et test de preuve empirique.
            </p>
          </div>

          {/* Quick Metrics KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Cycles Segmentés</span>
              <div className="text-xl font-black font-mono text-indigo-400">
                {analysis.totalCycles} <span className="text-[10px] text-slate-500 font-sans">cycles ({analysis.cycleLength} tirages)</span>
              </div>
            </div>

            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Motifs en Alerte (Primés)</span>
              <div className="text-xl font-black font-mono text-emerald-400 flex items-center gap-1.5">
                <Zap size={16} /> {analysis.activePrimedPatterns.length}
              </div>
            </div>

            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-1 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Avancement Cycle Actif</span>
              <div className="text-xl font-black font-mono text-cyan-400">
                {analysis.activeCycleDrawsCount}/{analysis.cycleLength} <span className="text-[10px] text-slate-500">tirages</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Controls Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-4 border-t border-slate-800/80">
          {/* Cycle Length Selector */}
          <div className="md:col-span-4 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/70 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <Sliders size={13} className="text-indigo-400" /> Résolution du Cycle
              </span>
              <span className="font-mono font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded text-[11px]">
                {cycleLength} tirages / cycle
              </span>
            </div>
            <div className="flex items-center gap-2">
              {[5, 8, 10, 15, 20].map((len) => (
                <button
                  key={len}
                  onClick={() => {
                    setCycleLength(len);
                    audioEngine.play('click');
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    cycleLength === len
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {len}T
                </button>
              ))}
            </div>
          </div>

          {/* Search by Ball */}
          <div className="md:col-span-4 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/70 flex flex-col justify-between">
            <span className="text-slate-400 font-bold text-xs flex items-center gap-1.5 mb-1.5">
              <Search size={13} className="text-indigo-400" /> Filtrer par Numéro Spécifique
            </span>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="90"
                placeholder="Ex: 7, 23, 77..."
                value={searchBall}
                onChange={(e) => setSearchBall(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              {searchBall && (
                <button
                  onClick={() => setSearchBall('')}
                  className="absolute right-2 top-1.5 text-slate-500 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Sort By Dropdown */}
          <div className="md:col-span-4 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/70 flex flex-col justify-between">
            <span className="text-slate-400 font-bold text-xs flex items-center gap-1.5 mb-1.5">
              <Filter size={13} className="text-indigo-400" /> Critère de Classement
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-sans"
            >
              <option value="confidence">Confiance Statistique (%)</option>
              <option value="lift">Sur-Fréquence Lift (vs Aléa)</option>
              <option value="zScore">Preuve Z-Score (Écart Réduit)</option>
              <option value="support">Support (Nombre de Cycles)</option>
              <option value="recency">Récence (Dernière Observation)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Primed Alert Banner (If Any Active Patterns in Current Cycle) */}
      {analysis.activePrimedPatterns.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-emerald-500/10 border border-amber-500/30 rounded-3xl p-5 sm:p-6 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 animate-pulse">
                <Zap size={18} />
              </span>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-amber-300">
                  Motifs Actifs Amorcés dans le Cycle en Cours
                </h3>
                <p className="text-xs text-slate-400">
                  Des numéros précurseurs sont déjà sortis dans ce cycle ({analysis.activeCycleDrawsCount}/{analysis.cycleLength} tirages). Voici les candidats de complétion hautement probabilistes.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveCategory('PRIMED')}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer"
            >
              Voir les {analysis.activePrimedPatterns.length} alertes
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analysis.activePrimedPatterns.slice(0, 3).map((pat) => (
              <div
                key={pat.id}
                className="bg-slate-950/80 p-4 rounded-2xl border border-amber-500/20 space-y-3"
              >
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    Prob. Complétion : {pat.completionProbability}%
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Lift: <strong className="text-emerald-400">{pat.lift}x</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    {pat.sequence.map((num) => (
                      <span
                        key={num}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono border ${
                          analysis.activeCycleNumbers.includes(num)
                            ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {num}
                      </span>
                    ))}
                  </div>

                  {pat.completionCandidates && pat.completionCandidates.length > 0 && (
                    <>
                      <ArrowRight size={14} className="text-amber-400" />
                      <div className="flex gap-1.5">
                        {pat.completionCandidates.map((cand) => (
                          <span
                            key={cand}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black font-mono bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 animate-pulse"
                          >
                            {cand}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs by Pattern Type */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto custom-scrollbar">
        {[
          { id: 'ALL', label: 'Tous les Motifs', count: analysis.topRecurringPairs.length + analysis.topRecurringTriplets.length + analysis.topCrossCycleTransitions.length },
          { id: 'PAIR', label: 'Paires Multi-Cycles', count: analysis.topRecurringPairs.length },
          { id: 'TRIPLET', label: 'Triplets Récurrents', count: analysis.topRecurringTriplets.length },
          { id: 'TRANSITION', label: 'Chaînes de Transition (A ➔ B)', count: analysis.topCrossCycleTransitions.length },
          { id: 'PHASE', label: 'Motifs Phase-Spécifiques', count: analysis.topPhaseMotifs.length },
          { id: 'PRIMED', label: 'En Alerte (Cycle Actif)', count: analysis.activePrimedPatterns.length },
        ].map((tab) => {
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveCategory(tab.id as FilterCategory);
                audioEngine.play('click');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                isActive ? 'bg-indigo-800 text-indigo-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Patterns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredPatterns.length === 0 ? (
          <div className="col-span-2 bg-slate-900/40 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
            <Info size={28} className="mx-auto text-slate-500" />
            <h3 className="text-sm font-bold text-slate-300">Aucun motif récurrent trouvé</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Essayez de modifier la taille de cycle ou de retirer le filtre de recherche par numéro.
            </p>
          </div>
        ) : (
          filteredPatterns.map((pat) => {
            const isTransition = pat.type === 'TRANSITION_CHAIN';
            const isPrimed = pat.activeAlertStatus === 'PRIMED';

            return (
              <div
                key={pat.id}
                onClick={() => setSelectedPattern(pat)}
                className={`bg-slate-900/70 border rounded-3xl p-5 sm:p-6 space-y-4 hover:border-indigo-500/50 transition-all cursor-pointer backdrop-blur-xl relative overflow-hidden group ${
                  isPrimed ? 'border-amber-500/40 shadow-lg shadow-amber-500/5' : 'border-slate-800/80'
                }`}
              >
                {/* Top Badge Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black font-mono uppercase tracking-wider text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                      {pat.type.replace('_', ' ')}
                    </span>
                    {pat.hasEmpiricalProof ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck size={11} /> Preuve Z (+{pat.zScore})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                        Z = {pat.zScore}
                      </span>
                    )}
                  </div>

                  {getPhaseBadge(pat.cyclePhasePreference)}
                </div>

                {/* Number Display & Cascades */}
                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex items-center gap-3">
                    {/* Primary Sequence */}
                    <div className="flex gap-2">
                      {pat.sequence.map((n) => (
                        <NumberBall
                          key={n}
                          number={n}
                          size="md"
                          glow={analysis.activeCycleNumbers.includes(n)}
                          selected={analysis.activeCycleNumbers.includes(n)}
                        />
                      ))}
                    </div>

                    {/* Target Sequence for Transitions */}
                    {isTransition && pat.targetSequence && (
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <ArrowRight size={16} className="text-indigo-400" />
                          <span className="text-[9px] font-mono text-slate-500">Cycle +1</span>
                        </div>
                        <div className="flex gap-2">
                          {pat.targetSequence.map((tn) => (
                            <NumberBall
                              key={tn}
                              number={tn}
                              size="md"
                              glow={analysis.activeCycleNumbers.includes(tn)}
                              selected={analysis.activeCycleNumbers.includes(tn)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const fullSeq = isTransition && pat.targetSequence ? [...pat.sequence, ...pat.targetSequence] : pat.sequence;
                      handleCopyPattern(fullSeq);
                    }}
                    title="Copier la séquence"
                    className="p-2 rounded-xl bg-slate-800/60 hover:bg-indigo-600 text-slate-400 hover:text-white transition-all cursor-pointer"
                  >
                    <Copy size={15} />
                  </button>
                </div>

                {/* Quantitative Metrics Bar */}
                <div className="grid grid-cols-4 gap-2 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/60 text-center font-mono">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Support</span>
                    <span className="text-xs font-bold text-slate-200">
                      {pat.cycleSupport} / {pat.totalCycles} <span className="text-[9px] text-slate-500">cyc</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Lift Aléa</span>
                    <span className="text-xs font-black text-emerald-400">{pat.lift}x</span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Confiance</span>
                    <span className="text-xs font-black text-indigo-400">{pat.confidence}%</span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Intervalle</span>
                    <span className="text-xs font-bold text-amber-400">~{pat.meanCycleInterval} cyc</span>
                  </div>
                </div>

                {/* Occurrence Timeline Matrix */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Historique des Cycles ({pat.totalCycles} cycles)</span>
                    <span className="font-mono">Dernière vue : il y a {pat.lastSeenCycle} cycle(s)</span>
                  </div>
                  <div className="flex gap-1 h-2.5 w-full bg-slate-950 rounded-full p-0.5 overflow-hidden">
                    {Array.from({ length: Math.min(30, pat.totalCycles) }).map((_, idx) => {
                      const cycleNum = pat.totalCycles - 1 - idx;
                      const hasOccurrence = pat.cycleOccurrences.includes(cycleNum);
                      return (
                        <div
                          key={idx}
                          title={`Cycle #${cycleNum + 1}: ${hasOccurrence ? 'Présent' : 'Absent'}`}
                          className={`flex-1 rounded-sm ${
                            hasOccurrence ? 'bg-indigo-500' : 'bg-slate-800/40'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Deep Modal / Slide-Over for Selected Pattern */}
      {selectedPattern && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-2xl animate-scale-in">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                  Détail du Motif Séquentiel
                </span>
                <h3 className="text-xl font-black text-white uppercase mt-1">
                  Séquence Multi-Cycles {selectedPattern.sequence.join(' - ')}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPattern(null)}
                className="text-slate-400 hover:text-white text-lg p-1.5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex justify-center gap-3 py-3">
              {selectedPattern.sequence.map((n) => (
                <NumberBall key={n} number={n} size="lg" />
              ))}
              {selectedPattern.targetSequence && (
                <>
                  <div className="flex flex-col items-center justify-center">
                    <ArrowRight size={20} className="text-indigo-400" />
                  </div>
                  {selectedPattern.targetSequence.map((tn) => (
                    <NumberBall key={tn} number={tn} size="lg" />
                  ))}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Répétitions Confirmées</span>
                <strong className="text-white text-sm">{selectedPattern.cycleSupport} cycles sur {selectedPattern.totalCycles}</strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Sur-Fréquence (Lift)</span>
                <strong className="text-emerald-400 text-sm">{selectedPattern.lift}x la probabilité stochastique</strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Stabilité de Phase</span>
                <strong className="text-indigo-400 text-sm">
                  {selectedPattern.phaseDistribution.early}% Début / {selectedPattern.phaseDistribution.mid}% Milieu / {selectedPattern.phaseDistribution.late}% Fin
                </strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Preuve Empirique Z</span>
                <strong className="text-amber-400 text-sm">Z = {selectedPattern.zScore}</strong>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  handleCopyPattern(selectedPattern.sequence);
                  setSelectedPattern(null);
                }}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-indigo-600/20"
              >
                <Copy size={15} /> Copier le Motif
              </button>
              <button
                onClick={() => setSelectedPattern(null)}
                className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
