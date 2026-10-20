import React, { useState, useMemo, useEffect } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import {
  patternDiscoveryService,
  RecurringSequencePattern,
  CyclePhase,
  PatternCandidateSelection,
} from '../../services/prediction/patternDiscoveryService';
import { saveTicket } from '../../services/userPreferencesService';
import { NumberBall } from '../NumberBall';
import {
  Workflow,
  Search,
  Sliders,
  ShieldCheck,
  Zap,
  Clock,
  ArrowRight,
  Info,
  Copy,
  Filter,
  BrainCircuit,
  Sparkles,
  Target,
  BookmarkCheck,
  PlusCircle,
  RotateCcw,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';

interface PatternDiscoveryTabProps {
  drawName: string;
}

type FilterCategory =
  | 'ALL'
  | 'PAIR'
  | 'TRIPLET'
  | 'TRANSITION'
  | 'PHASE'
  | 'PRIMED'
  | 'PERIODIC';

type SortCriteria =
  | 'compositeScore'
  | 'confidence'
  | 'pmi'
  | 'renewalHazard'
  | 'lift'
  | 'zScore'
  | 'support'
  | 'recency';

export const PatternDiscoveryTab: React.FC<PatternDiscoveryTabProps> = ({ drawName }) => {
  const history = useNexusStore((state) => state.history);
  const { showToast } = useToast();

  const [cycleLength, setCycleLength] = useState<number>(10);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('ALL');
  const [searchBall, setSearchBall] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortCriteria>('compositeScore');
  const [selectedPattern, setSelectedPattern] = useState<RecurringSequencePattern | null>(null);
  const [customSelection, setCustomSelection] = useState<number[]>([]);
  const [isSavingTicket, setIsSavingTicket] = useState<boolean>(false);

  // Compute pattern discovery, reasoning & synthesized selection metrics
  const analysis = useMemo(() => {
    return patternDiscoveryService.discoverPatterns(drawName, history, {
      cycleLength,
      maxPatternsPerCategory: 40,
    });
  }, [drawName, history, cycleLength]);

  // Initialize tactical selection with the engine's optimal 5-ball convergence synthesis
  useEffect(() => {
    if (analysis.recommendedSelection?.optimalFive?.length) {
      setCustomSelection(analysis.recommendedSelection.optimalFive);
    } else {
      setCustomSelection([]);
    }
  }, [drawName, cycleLength, analysis.recommendedSelection]);

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
    } else if (activeCategory === 'PERIODIC') {
      list = analysis.topPeriodicResonancePatterns ?? [];
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

    // Sort list continuously
    return [...list].sort((a, b) => {
      if (sortBy === 'compositeScore') {
        return (b.reasoning?.compositeScore ?? b.confidence) - (a.reasoning?.compositeScore ?? a.confidence);
      }
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'pmi') return (b.reasoning?.pmi ?? 0) - (a.reasoning?.pmi ?? 0);
      if (sortBy === 'renewalHazard') {
        return (b.reasoning?.renewalHazard ?? 0) - (a.reasoning?.renewalHazard ?? 0);
      }
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

  const toggleBallInSelection = (num: number) => {
    audioEngine.play('click');
    setCustomSelection((prev) => {
      if (prev.includes(num)) {
        return prev.filter((n) => n !== num);
      }
      if (prev.length >= 5) {
        showToast('Sélection limitée à 5 numéros. Retirez un numéro ou remplacez-le.', 'info');
        return prev;
      }
      return [...prev, num].sort((a, b) => a - b);
    });
  };

  const injectPatternIntoSelection = (pat: RecurringSequencePattern) => {
    audioEngine.play('click');
    const priorityBalls =
      pat.completionCandidates && pat.completionCandidates.length > 0
        ? pat.completionCandidates
        : pat.targetSequence && pat.targetSequence.length > 0
        ? pat.targetSequence
        : pat.sequence;

    setCustomSelection((prev) => {
      const merged = [...prev];
      for (const b of priorityBalls) {
        if (!merged.includes(b) && merged.length < 5) {
          merged.push(b);
        }
      }
      if (merged.length < 5) {
        for (const b of pat.sequence) {
          if (!merged.includes(b) && merged.length < 5) {
            merged.push(b);
          }
        }
      }
      return merged.sort((a, b) => a - b);
    });
    showToast(`Candidats du motif injectés dans la sélection tactique.`, 'success');
  };

  const handleSaveSelectionTicket = async () => {
    if (customSelection.length < 3) {
      showToast('Sélectionnez au moins 3 numéros pour enregistrer un ticket.', 'error');
      return;
    }
    setIsSavingTicket(true);
    try {
      audioEngine.play('click');
      const conf = analysis.recommendedSelection?.selectionConfidence;
      const confLabel = typeof conf === 'number' && Number.isFinite(conf) ? ` • C:${conf}%` : '';
      await saveTicket({
        numbers: customSelection,
        drawName,
        strategy: `Motifs Répétitifs (${cycleLength}T${confLabel})`,
      });
      showToast('Sélection Multi-Motifs enregistrée dans le Portefeuille.', 'success');
    } catch {
      showToast("Erreur lors de l'enregistrement du ticket.", 'error');
    } finally {
      setIsSavingTicket(false);
    }
  };

  const getPhaseBadge = (phase: CyclePhase) => {
    if (phase === 'EARLY') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          Phase Début
        </span>
      );
    }
    if (phase === 'MID') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Phase Milieu
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
        Phase Clôture
      </span>
    );
  };

  const getDriverBadge = (pat: RecurringSequencePattern) => {
    const driver = pat.reasoning?.dominantDriver;
    if (driver === 'PRECURSOR_PRIMED') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30">
          Précurseur Amorcé
        </span>
      );
    }
    if (driver === 'MARKOV_TRANSITION') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          Transition Markov
        </span>
      );
    }
    if (driver === 'PERIODIC_RESONANCE') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
          Résonance Cyclique
        </span>
      );
    }
    if (driver === 'PHASE_LOCK') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          Verrouillage Phase
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        Synergie PMI
      </span>
    );
  };

  const getRoleBadge = (role: PatternCandidateSelection['selectionRole']) => {
    if (role === 'PIVOT_CONVERGENT') {
      return (
        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          Pivot Convergent
        </span>
      );
    }
    if (role === 'COMPLETION_PRIMED') {
      return (
        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
          Complétion Amorcée
        </span>
      );
    }
    if (role === 'TRANSITION_CIBLE') {
      return (
        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          Cible Transition
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
        Résonance Périodique
      </span>
    );
  };

  const recSelection = analysis.recommendedSelection;
  const topCandidates = analysis.candidateRankings || [];

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
                Inférence Séquentielle • Inclusion-Exclusion Exacte & Apriori PMI
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Motifs Répétitifs <span className="text-indigo-400">& Sélection Multi-Cycles</span>
            </h1>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Détection sans biais sur les 90 numéros de <strong className="text-emerald-400">{drawName}</strong> par modèle nul exact d&apos;inclusion-exclusion, information mutuelle ponctuelle (PMI), mémoire exponentielle de Hawking et optimisation sous-modulaire de sélection.
            </p>
          </div>

          {/* Quick Metrics KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Cycles Analysés</span>
              <div className="text-lg font-black font-mono text-indigo-400">
                {analysis.totalCycles}{' '}
                <span className="text-[10px] text-slate-500 font-sans">({analysis.cycleLength}T)</span>
              </div>
            </div>

            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Motifs Amorcés</span>
              <div className="text-lg font-black font-mono text-amber-400 flex items-center gap-1.5">
                <Zap size={15} /> {analysis.activePrimedPatterns.length}
              </div>
            </div>

            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Résonances Dues</span>
              <div className="text-lg font-black font-mono text-fuchsia-400 flex items-center gap-1.5">
                <Clock size={15} /> {analysis.topPeriodicResonancePatterns?.length ?? 0}
              </div>
            </div>

            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Cycle en Cours</span>
              <div className="text-lg font-black font-mono text-cyan-400">
                {analysis.activeCycleDrawsCount}/{analysis.cycleLength}{' '}
                <span className="text-[10px] text-slate-500">tirages</span>
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
                placeholder="Ex: 7, 23, 64, 88..."
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
              <Filter size={13} className="text-indigo-400" /> Logique de Classement
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortCriteria)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-sans"
            >
              <option value="compositeScore">Score d&apos;Intelligence Composite (PMI + Phase + Récence)</option>
              <option value="confidence">Confiance Bayésienne Continue (%)</option>
              <option value="pmi">Synergie Intrinsèque PMI (bits)</option>
              <option value="renewalHazard">Tension Cyclique de Retour (%)</option>
              <option value="lift">Sur-Fréquence Lift (vs Modèle Nul Exact)</option>
              <option value="zScore">Preuve Statistique Z-Score</option>
              <option value="support">Support Historique (Cycles)</option>
              <option value="recency">Récence d&apos;Observation</option>
            </select>
          </div>
        </div>
      </div>

      {/* SYNTHÈSE DÉCISIONNELLE & SÉLECTION MULTI-MOTIFS */}
      {recSelection && recSelection.optimalFive.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-950/50 via-slate-900/95 to-emerald-950/40 border border-indigo-500/30 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <BrainCircuit size={18} />
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                  Moteur de Raisonnement & Couverture Sous-Modulaire
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {recSelection.currentPhaseLabel}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
                Sélection Optimale par Convergence de Motifs
              </h2>
              <p className="text-xs text-slate-400">
                Synthèse déterministe croisant les précurseurs amorcés, les chaînes de Markov inter-cycles, la tension de retour périodique et la cohésion PMI.
              </p>
            </div>

            {/* Selection Quality KPIs */}
            <div className="grid grid-cols-3 gap-2.5 shrink-0">
              <div className="bg-slate-950/80 px-3.5 py-2.5 rounded-2xl border border-slate-800 text-center">
                <span className="text-[9px] font-bold uppercase text-slate-400 block">Indice Convergence</span>
                <span className="text-base font-black font-mono text-emerald-400">
                  {recSelection.selectionConfidence}%
                </span>
              </div>
              <div className="bg-slate-950/80 px-3.5 py-2.5 rounded-2xl border border-slate-800 text-center">
                <span className="text-[9px] font-bold uppercase text-slate-400 block">Motifs Couverts</span>
                <span className="text-base font-black font-mono text-indigo-400">
                  {recSelection.coveredPatternsCount}
                </span>
              </div>
              <div className="bg-slate-950/80 px-3.5 py-2.5 rounded-2xl border border-slate-800 text-center">
                <span className="text-[9px] font-bold uppercase text-slate-400 block">Cohésion PMI</span>
                <span className="text-base font-black font-mono text-amber-400">
                  {recSelection.pairwiseSynergyScore}%
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Interactive Selection Tray & Rationale */}
            <div className="lg:col-span-5 bg-slate-950/70 border border-slate-800/90 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <Target size={15} className="text-emerald-400" />
                  Panier de Sélection Tactique ({customSelection.length}/5)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      audioEngine.play('click');
                      setCustomSelection(recSelection.optimalFive);
                    }}
                    title="Restaurer la synthèse optimale"
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                  >
                    <Sparkles size={11} /> Auto-5
                  </button>
                  <button
                    onClick={() => {
                      audioEngine.play('click');
                      setCustomSelection([]);
                    }}
                    title="Vider la sélection"
                    className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer transition"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              </div>

              {/* 5-Ball Slots */}
              <div className="flex items-center justify-between gap-2 py-2 px-3 bg-slate-900/90 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {customSelection.map((num) => (
                    <div
                      key={num}
                      onClick={() => toggleBallInSelection(num)}
                      title="Cliquer pour retirer de la sélection"
                      className="cursor-pointer transition-transform hover:scale-105"
                    >
                      <NumberBall number={num} size="md" selected glow />
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 5 - customSelection.length) }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="w-10 h-10 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center text-[10px] font-mono text-slate-600"
                    >
                      +
                    </div>
                  ))}
                </div>

                {/* Reserves */}
                {recSelection.reserveNumbers.length > 0 && (
                  <div className="pl-3 border-l border-slate-800 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold uppercase text-slate-400">Réserves</span>
                    <div className="flex gap-1.5">
                      {recSelection.reserveNumbers.map((rNum) => (
                        <button
                          key={rNum}
                          onClick={() => toggleBallInSelection(rNum)}
                          title="Ajouter la réserve à la sélection"
                          className="w-7 h-7 rounded-full bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-mono font-bold flex items-center justify-center cursor-pointer transition"
                        >
                          {rNum}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reasoning Steps */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block">
                  Justification Mathématique de la Sélection
                </span>
                {recSelection.selectionRationale.map((line, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-300 leading-relaxed">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={handleSaveSelectionTicket}
                  disabled={customSelection.length < 3 || isSavingTicket}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer transition"
                >
                  <BookmarkCheck size={15} />
                  Enregistrer Ticket
                </button>
                <button
                  onClick={() => handleCopyPattern(customSelection)}
                  disabled={customSelection.length === 0}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Copy size={14} />
                  Copier
                </button>
              </div>
            </div>

            {/* Right: Top Candidate Balls by Multi-Motif Convergence */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <Activity size={15} className="text-indigo-400" />
                  Classement des Numéros Candidats par Convergence Multi-Motifs
                </span>
                <span className="text-[10px] text-slate-400">
                  Cliquez sur un candidat pour l&apos;inclure/retirer du panier
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
                {topCandidates.slice(0, 8).map((cand, idx) => {
                  const isSelected = customSelection.includes(cand.number);
                  return (
                    <div
                      key={cand.number}
                      onClick={() => toggleBallInSelection(cand.number)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isSelected
                          ? 'bg-indigo-950/70 border-indigo-500/60 shadow-md shadow-indigo-500/10'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] font-mono font-black text-slate-500">
                            #{idx + 1}
                          </span>
                          <NumberBall number={cand.number} size="sm" selected={isSelected} />
                          <div>
                            {getRoleBadge(cand.selectionRole)}
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                              Score : <strong className="text-emerald-400">{cand.convergenceScore}%</strong> • Phase :{' '}
                              <strong className="text-cyan-400">{cand.phaseAffinityScore}%</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-300 leading-snug">
                        {cand.reasoningSummary}
                      </p>

                      {cand.supportingPatterns.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/70">
                          {cand.supportingPatterns.slice(0, 2).map((lbl, i) => (
                            <span
                              key={i}
                              className="text-[9px] font-mono bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 truncate max-w-full"
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

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
                  Des numéros précurseurs sont déjà sortis dans ce cycle ({analysis.activeCycleDrawsCount}/{analysis.cycleLength} tirages). Voici les complétions conditionnelles Bayésiennes les plus probables.
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
                onClick={() => injectPatternIntoSelection(pat)}
                title="Cliquer pour injecter ce motif dans la sélection"
                className="bg-slate-950/80 p-4 rounded-2xl border border-amber-500/20 hover:border-amber-400/50 space-y-3 cursor-pointer transition"
              >
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    Prob. Complétion : {pat.completionProbability}%
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    PMI:{' '}
                    <strong className="text-emerald-400">
                      {typeof pat.reasoning?.pmi === 'number' ? `+${pat.reasoning.pmi}b` : 'n/d'}
                    </strong>{' '}
                    • Lift: <strong className="text-emerald-400">{pat.lift}x</strong>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
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
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black font-mono bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                            >
                              {cand}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <PlusCircle size={15} className="text-amber-400 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs by Pattern Type */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto custom-scrollbar">
        {[
          {
            id: 'ALL',
            label: 'Tous les Motifs',
            count:
              analysis.topRecurringPairs.length +
              analysis.topRecurringTriplets.length +
              analysis.topCrossCycleTransitions.length,
          },
          { id: 'PRIMED', label: 'En Alerte (Amorcés)', count: analysis.activePrimedPatterns.length },
          {
            id: 'PERIODIC',
            label: 'Résonance Cyclique (Attendus)',
            count: analysis.topPeriodicResonancePatterns?.length || 0,
          },
          { id: 'PAIR', label: 'Paires Multi-Cycles', count: analysis.topRecurringPairs.length },
          { id: 'TRIPLET', label: 'Triplets Apriori (1-90)', count: analysis.topRecurringTriplets.length },
          {
            id: 'TRANSITION',
            label: 'Chaînes de Transition (A ➔ B)',
            count: analysis.topCrossCycleTransitions.length,
          },
          { id: 'PHASE', label: 'Motifs Phase-Spécifiques', count: analysis.topPhaseMotifs.length },
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
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-indigo-800 text-indigo-200' : 'bg-slate-800 text-slate-400'
                }`}
              >
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
              Essayez de modifier la résolution du cycle ou de retirer le filtre de recherche par numéro.
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-black font-mono uppercase tracking-wider text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                      {pat.type.replace('_', ' ')}
                    </span>
                    {getDriverBadge(pat)}
                    {pat.hasEmpiricalProof ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck size={11} /> Z = +{pat.zScore}
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

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        injectPatternIntoSelection(pat);
                      }}
                      title="Injecter les candidats dans le panier de sélection"
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <PlusCircle size={13} /> Sélectionner
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const fullSeq =
                          isTransition && pat.targetSequence
                            ? [...pat.sequence, ...pat.targetSequence]
                            : pat.sequence;
                        handleCopyPattern(fullSeq);
                      }}
                      title="Copier la séquence"
                      className="p-2 rounded-xl bg-slate-800/60 hover:bg-indigo-600 text-slate-400 hover:text-white transition-all cursor-pointer"
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                </div>

                {/* Quantitative Metrics Bar (5 Columns) */}
                <div className="grid grid-cols-5 gap-1.5 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/60 text-center font-mono">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Support</span>
                    <span className="text-xs font-bold text-slate-200">
                      {pat.cycleSupport}/{pat.totalCycles}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Synergie PMI</span>
                    <span className="text-xs font-black text-emerald-400">
                      {typeof pat.reasoning?.pmi === 'number'
                        ? `${pat.reasoning.pmi >= 0 ? '+' : ''}${pat.reasoning.pmi}b`
                        : 'n/d'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Score Comp.</span>
                    <span className="text-xs font-black text-indigo-400">
                      {pat.reasoning?.compositeScore ?? pat.confidence}%
                    </span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Tension Retour</span>
                    <span className="text-xs font-bold text-fuchsia-400">
                      {typeof pat.reasoning?.renewalHazard === 'number'
                        ? `${pat.reasoning.renewalHazard}%`
                        : 'n/d'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Période</span>
                    <span className="text-xs font-bold text-amber-400">~{pat.meanCycleInterval}c</span>
                  </div>
                </div>

                {/* Quantitative Reasoning Verdict */}
                {pat.reasoning?.verdict && (
                  <div className="text-[11px] text-slate-300 bg-slate-950/40 px-3 py-2 rounded-xl border border-slate-800/60 flex items-center justify-between gap-2">
                    <span className="truncate">{pat.reasoning.verdict}</span>
                    {pat.reasoning.sameDrawOccurrences > 0 && (
                      <span className="shrink-0 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        {pat.reasoning.sameDrawOccurrences}x simultané
                      </span>
                    )}
                  </div>
                )}

                {/* Occurrence Timeline Matrix */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Historique des Cycles ({pat.totalCycles} cycles)</span>
                    <span className="font-mono">Dernière vue : il y a {pat.lastSeenCycle} cycle(s)</span>
                  </div>
                  <div className="flex gap-1 h-2.5 w-full bg-slate-950 rounded-full p-0.5 overflow-hidden">
                    {Array.from({ length: Math.min(30, Math.max(1, pat.totalCycles)) }).map((_, idx) => {
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
                  Audit Forensique & Raisonnement Séquentiel
                </span>
                <h3 className="text-xl font-black text-white uppercase mt-1">
                  Séquence Multi-Cycles {selectedPattern.sequence.join(' - ')}
                  {selectedPattern.targetSequence ? ` ➔ ${selectedPattern.targetSequence.join(' - ')}` : ''}
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

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Répétitions Confirmées</span>
                <strong className="text-white text-sm">
                  {selectedPattern.cycleSupport} / {selectedPattern.totalCycles} cycles
                </strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Lift & Synergie PMI</span>
                <strong className="text-emerald-400 text-sm">
                  {selectedPattern.lift}x (
                  {typeof selectedPattern.reasoning?.pmi === 'number'
                    ? `${selectedPattern.reasoning.pmi} bits`
                    : 'n/d'}
                  )
                </strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Tension de Retour</span>
                <strong className="text-fuchsia-400 text-sm">
                  {typeof selectedPattern.reasoning?.renewalHazard === 'number'
                    ? `${selectedPattern.reasoning.renewalHazard}%`
                    : 'n/d'}{' '}
                  (~{selectedPattern.meanCycleInterval} cyc)
                </strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 col-span-2">
                <span className="text-slate-400 block text-[10px] uppercase">Distribution de Phase</span>
                <strong className="text-indigo-400 text-sm">
                  {selectedPattern.phaseDistribution.early}% Début • {selectedPattern.phaseDistribution.mid}% Milieu •{' '}
                  {selectedPattern.phaseDistribution.late}% Fin
                </strong>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Preuve Statistique Z</span>
                <strong className="text-amber-400 text-sm">Z = {selectedPattern.zScore}</strong>
              </div>
            </div>

            {/* Detailed Reasoning Factors */}
            {selectedPattern.reasoning?.factors && selectedPattern.reasoning.factors.length > 0 && (
              <div className="bg-slate-950/90 p-4 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                  Chaîne de Raisonnement Analytique
                </span>
                {selectedPattern.reasoning.factors.map((factor, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{factor}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  injectPatternIntoSelection(selectedPattern);
                  setSelectedPattern(null);
                }}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-emerald-600/20"
              >
                <PlusCircle size={15} /> Injecter dans la Sélection
              </button>
              <button
                onClick={() => {
                  handleCopyPattern(selectedPattern.sequence);
                  setSelectedPattern(null);
                }}
                className="py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Copy size={15} /> Copier
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
