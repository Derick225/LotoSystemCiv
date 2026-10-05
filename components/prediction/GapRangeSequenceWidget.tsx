import React, { useMemo, useState, useEffect } from 'react';
import {
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
  Sparkles,
  Grid,
  ChevronRight,
  Sliders,
  Compass,
  Award,
  BarChart2,
  Brain,
  Target,
  BookmarkCheck,
  RotateCcw,
  Plus,
  Check,
  Flame,
} from 'lucide-react';
import { useNexusStore } from '../../store/useNexusStore';
import {
  gapRangeSequenceService,
  GAP_RANGE_BINS,
  GapBinId,
  GapRangeSequenceReport,
  GapBallCandidate,
} from '../../services/prediction/gapRangeSequenceService';
import { saveTicket } from '../../services/userPreferencesService';
import { NumberBall } from '../NumberBall';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';

interface GapRangeSequenceWidgetProps {
  drawName: string;
}

const ROLE_STYLES: Record<
  GapBallCandidate['role'],
  { bg: string; text: string; border: string }
> = {
  'ANCRE DE TRANCHE': {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-500/30',
  },
  'RÉSONANCE HAZARD': {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  'ÉCHO SÉQUENTIEL': {
    bg: 'bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/30',
  },
  'RUPTURE DE SÉCHERESSE': {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
};

export const GapRangeSequenceWidget: React.FC<GapRangeSequenceWidgetProps> = ({
  drawName,
}) => {
  const globalHistory = useNexusStore((state) => state.history);
  const { showToast } = useToast();

  const [activeSubTab, setActiveSubTab] = useState<
    'forecast' | 'timeline' | 'matrix' | 'simulator'
  >('forecast');
  const [selectedBinId, setSelectedBinId] = useState<GapBinId | null>(null);
  const [selectedDrawIndex, setSelectedDrawIndex] = useState<number | null>(0);
  const [timelineLimit, setTimelineLimit] = useState<number>(15);

  // Interactive Tactical Selection State (initialized with Hamilton-Hare optimalFive)
  const [customSelection, setCustomSelection] = useState<number[]>([]);
  const [showReasoningDetails, setShowReasoningDetails] = useState<boolean>(true);
  const [candidateFilterBin, setCandidateFilterBin] = useState<GapBinId | 'ALL'>(
    'ALL'
  );

  // Interactive Simulator & Backtest States
  const [customMinGap, setCustomMinGap] = useState<number>(5);
  const [customMaxGap, setCustomMaxGap] = useState<number>(12);
  const [simPrevBin, setSimPrevBin] = useState<GapBinId>('G1_3');
  const [simCurrBin, setSimCurrBin] = useState<GapBinId>('G8_14');
  const [backtestWindow, setBacktestWindow] = useState<number>(30);
  const [compareDrawName, setCompareDrawName] = useState<string>('ALL');

  const availableDrawNames = useMemo(() => {
    const set = new Set<string>();
    for (const d of globalHistory) {
      const name = d.drawName || d.draw_name;
      if (name) set.add(name);
    }
    return Array.from(set).sort();
  }, [globalHistory]);

  const report: GapRangeSequenceReport | null = useMemo(() => {
    if (!globalHistory || globalHistory.length < 12) return null;
    return gapRangeSequenceService.analyzeGapRangeSequences(
      drawName,
      globalHistory
    );
  }, [drawName, globalHistory]);

  // Synchronize default tactical selection when report changes
  useEffect(() => {
    if (report?.selectionSynthesis?.optimalFive) {
      setCustomSelection(report.selectionSynthesis.optimalFive);
    }
  }, [report]);

  const compareReport: GapRangeSequenceReport | null = useMemo(() => {
    if (!globalHistory || globalHistory.length < 12 || !report) return null;
    const target =
      compareDrawName === drawName ? 'ALL' : compareDrawName;
    return gapRangeSequenceService.analyzeGapRangeSequences(
      target,
      globalHistory
    );
  }, [compareDrawName, drawName, globalHistory, report]);

  // Candidate lookup map for O(1) access
  const candidateMap = useMemo(() => {
    const map = new Map<number, GapBallCandidate>();
    if (!report) return map;
    for (const c of report.selectionSynthesis.allCandidates) {
      map.set(c.number, c);
    }
    return map;
  }, [report]);

  // Toggle a ball in the custom 5-number selection
  const toggleBallInSelection = (num: number) => {
    audioEngine.play('click');
    setCustomSelection((prev) => {
      if (prev.includes(num)) {
        return prev.filter((n) => n !== num);
      }
      if (prev.length >= 5) {
        // Replace the lowest-scoring ball currently in selection
        let worstNum = prev[0];
        let worstScore = Infinity;
        for (const existing of prev) {
          const s = candidateMap.get(existing)?.compositeScore ?? 0;
          if (s < worstScore) {
            worstScore = s;
            worstNum = existing;
          }
        }
        return [...prev.filter((n) => n !== worstNum), num].sort((a, b) => a - b);
      }
      return [...prev, num].sort((a, b) => a - b);
    });
  };

  const resetOptimalSelection = () => {
    if (!report) return;
    audioEngine.play('click');
    setCustomSelection(report.selectionSynthesis.optimalFive);
    showToast(
      'Sélection optimale Hamilton-Hare restaurée (5 boules)',
      'info'
    );
  };

  const handleSaveSelectionTicket = async () => {
    if (!report || customSelection.length !== 5) {
      showToast('Veuillez sélectionner exactement 5 numéros.', 'error');
      return;
    }
    try {
      audioEngine.play('success');
      await saveTicket({
        drawName,
        numbers: [...customSelection].sort((a, b) => a - b),
        strategy: `Quotas d'Écarts Markov-Wasserstein (${report.selectionSynthesis.selectionConfidence.toFixed(0)}%)`,
      });
      showToast(
        `Combinaison [${customSelection.join(', ')}] enregistrée dans le Portefeuille !`,
        'success'
      );
    } catch {
      showToast("Erreur lors de l'enregistrement du ticket.", 'error');
    }
  };

  // Live metrics for the active customSelection
  const activeSelectionMetrics = useMemo(() => {
    if (!report || customSelection.length === 0) {
      return {
        meanScore: 0,
        meanHazard: 0,
        uniqueBins: 0,
        uniqueDecades: 0,
      };
    }
    const cands = customSelection
      .map((n) => candidateMap.get(n))
      .filter((c): c is GapBallCandidate => Boolean(c));
    const meanScore =
      cands.reduce((a, c) => a + c.compositeScore, 0) /
      Math.max(1, cands.length);
    const meanHazard =
      (cands.reduce((a, c) => a + c.individualHazard, 0) /
        Math.max(1, cands.length)) *
      100;
    const uniqueBins = new Set(cands.map((c) => c.binId)).size;
    const uniqueDecades = new Set(
      customSelection.map((n) => Math.min(8, Math.floor((n - 1) / 10)))
    ).size;
    return {
      meanScore,
      meanHazard,
      uniqueBins,
      uniqueDecades,
    };
  }, [report, customSelection, candidateMap]);

  // 1. Custom Gap Range Inspector Calculations
  const customRangeAnalysis = useMemo(() => {
    if (!report) return null;
    const minG = Math.max(0, Math.min(customMinGap, customMaxGap));
    const maxG = Math.max(customMinGap, customMaxGap);

    const p = 5 / 90;
    const q = 1 - p;
    const theoreticalProb = Math.max(
      0.0001,
      Math.pow(q, minG) - Math.pow(q, maxG + 1)
    );

    let totalHits = 0;
    let totalBalls = 0;
    const hitsPerDraw: number[] = [];

    for (const fp of report.recentFootprints) {
      let drawHits = 0;
      for (const w of fp.winningNumbers) {
        totalBalls++;
        if (w.gapAtDraw >= minG && w.gapAtDraw <= maxG) {
          totalHits++;
          drawHits++;
        }
      }
      hitsPerDraw.push(drawHits);
    }

    const empiricalProb = totalBalls > 0 ? totalHits / totalBalls : 0;
    const lift = empiricalProb / theoreticalProb;

    const currentBalls: Array<{
      number: number;
      currentGap: number;
      microScore: number;
    }> = [];
    for (const bin of GAP_RANGE_BINS) {
      for (const item of report.currentNumbersByBin[bin.id] || []) {
        if (item.currentGap >= minG && item.currentGap <= maxG) {
          currentBalls.push({
            ...item,
            microScore: candidateMap.get(item.number)?.compositeScore ?? 50,
          });
        }
      }
    }
    currentBalls.sort(
      (a, b) => b.microScore - a.microScore || a.currentGap - b.currentGap
    );

    return {
      minG,
      maxG,
      theoreticalProb,
      empiricalProb,
      lift,
      expectedPerDraw: empiricalProb * 5,
      hitsPerDraw,
      currentBalls,
    };
  }, [report, customMinGap, customMaxGap, candidateMap]);

  // 2. Trajectory Simulator (Order-2 Bi-gram Explorer)
  const simulatedTrajectory = useMemo(() => {
    if (!report) return null;
    const chrono = [...report.recentFootprints].reverse();
    const nextCounts: Record<GapBinId, number> = {
      G0: 0,
      G1_3: 0,
      G4_7: 0,
      G8_14: 0,
      G15_24: 0,
      G25_39: 0,
      G40_PLUS: 0,
    };
    let matchOccurrences = 0;
    let totalNextBalls = 0;

    for (let i = 2; i < chrono.length; i++) {
      if (
        chrono[i - 2].dominantBin === simPrevBin &&
        chrono[i - 1].dominantBin === simCurrBin
      ) {
        matchOccurrences++;
        for (const bin of GAP_RANGE_BINS) {
          nextCounts[bin.id] += chrono[i].binCounts[bin.id];
          totalNextBalls += chrono[i].binCounts[bin.id];
        }
      }
    }

    const distribution = GAP_RANGE_BINS.map((bin) => {
      const m1Prob = report.transitionMatrixOrder1[simCurrBin]?.[bin.id] ?? 0;
      const m2Raw =
        totalNextBalls > 0 ? nextCounts[bin.id] / totalNextBalls : m1Prob;
      const blended =
        matchOccurrences > 0 ? 0.65 * m2Raw + 0.35 * m1Prob : m1Prob;
      return {
        bin,
        prob: blended,
        expectedBalls: blended * 5,
        lift: blended / Math.max(0.001, bin.theoreticalProb),
      };
    }).sort((a, b) => b.prob - a.prob);

    return {
      matchOccurrences,
      distribution,
      topBin: distribution[0],
    };
  }, [report, simPrevBin, simCurrBin]);

  // 3. Historical Backtest Precision Metrics
  const backtestMetrics = useMemo(() => {
    if (!report || report.recentFootprints.length < 6) return null;
    const footprints = [...report.recentFootprints].reverse();
    const evalCount = Math.min(backtestWindow, footprints.length - 2);
    if (evalCount <= 0) return null;

    let top1SuccessDraws = 0;
    let top3CoveredBalls = 0;
    let totalEvaluatedBalls = 0;
    const drawEvaluations: Array<{
      date: string;
      predictedTopBins: GapBinId[];
      actualCounts: Record<GapBinId, number>;
      coveredBalls: number;
      top1Hit: boolean;
    }> = [];

    for (
      let i = footprints.length - evalCount;
      i < footprints.length;
      i++
    ) {
      const prevDom = footprints[i - 1].dominantBin;
      const row = report.transitionMatrixOrder1[prevDom];
      const rankedBins = [...GAP_RANGE_BINS]
        .sort((a, b) => (row?.[b.id] ?? 0) - (row?.[a.id] ?? 0))
        .slice(0, 3)
        .map((b) => b.id);

      const targetFp = footprints[i];
      const top1Hit = targetFp.binCounts[rankedBins[0]] > 0;
      if (top1Hit) top1SuccessDraws++;

      const covered =
        targetFp.binCounts[rankedBins[0]] +
        targetFp.binCounts[rankedBins[1]] +
        targetFp.binCounts[rankedBins[2]];
      top3CoveredBalls += covered;
      totalEvaluatedBalls += 5;

      drawEvaluations.push({
        date: targetFp.date,
        predictedTopBins: rankedBins,
        actualCounts: targetFp.binCounts,
        coveredBalls: covered,
        top1Hit,
      });
    }

    return {
      evalCount,
      top1SuccessRate: (top1SuccessDraws / evalCount) * 100,
      top3BallCoverageRate:
        totalEvaluatedBalls > 0
          ? (top3CoveredBalls / totalEvaluatedBalls) * 100
          : 0,
      avgBallsCoveredPerDraw: top3CoveredBalls / evalCount,
      recentEvaluations: drawEvaluations.reverse().slice(0, 8),
    };
  }, [report, backtestWindow]);

  if (!report || report.totalAnalyzedDraws < 5) {
    return null;
  }

  const activeBinForecast =
    report.binForecasts.find((f) => f.bin.id === selectedBinId) ||
    report.binForecasts.find((f) => f.bin.id === report.topPredictedBins[0]) ||
    report.binForecasts[0];

  const inspectedFootprint =
    report.recentFootprints.find((fp) => fp.drawIndex === selectedDrawIndex) ||
    report.recentFootprints[0];

  const filteredCandidates = report.selectionSynthesis.allCandidates
    .filter((c) => candidateFilterBin === 'ALL' || c.binId === candidateFilterBin)
    .slice(0, 12);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Layers size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              Markov • 1-Wasserstein • Quotas Hamilton-Hare
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {report.totalAnalyzedDraws} tirages purifiés • {drawName}
            </span>
          </div>
          <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight">
            Séquences & Patterns des Écarts par Tranches
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
            Modélisation bayésienne par gain d’information (Divergence KL), distance topologique Earth-Mover (1-Wasserstein) et micro-résonance de hasard individuel (noyau de Silverman) pour projeter les quotas exacts de tranches et synthétiser la sélection optimale.
          </p>
        </div>

        {/* Sub-navigation */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1.5 rounded-2xl self-start lg:self-center flex-wrap">
          <button
            onClick={() => setActiveSubTab('forecast')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'forecast'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles size={14} />
            Projection & Réservoirs
          </button>
          <button
            onClick={() => setActiveSubTab('timeline')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'timeline'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History size={14} />
            Séquences Récentes
          </button>
          <button
            onClick={() => setActiveSubTab('matrix')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'matrix'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Grid size={14} />
            Transitions & Échos W1
          </button>
          <button
            onClick={() => setActiveSubTab('simulator')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'simulator'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders size={14} />
            Simulateur & Backtest
          </button>
        </div>
      </div>

      {/* Executive Summary & Regime KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        <div className="md:col-span-2 p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Synthèse Stratégique Markov-Wasserstein
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-500">
              Stabilité Régime : {(report.reasoning.regimeStabilityIndex * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
            {report.narrativeSummary}
          </p>
        </div>

        {/* Next Mean Gap Forecast */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Écart Moyen Projeté (T+1)
            </span>
            {report.predictedNextMeanGap.trend === 'COMPRESSION' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <TrendingDown size={11} /> Compression
              </span>
            )}
            {report.predictedNextMeanGap.trend === 'EXPANSION' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                <TrendingUp size={11} /> Expansion
              </span>
            )}
            {report.predictedNextMeanGap.trend === 'EQUILIBRIUM' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                <Minus size={11} /> Équilibre
              </span>
            )}
          </div>
          <div className="my-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {report.predictedNextMeanGap.expected}
            </span>
            <span className="text-xs text-slate-500">tirages d’écart</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            Intervalle : [{report.predictedNextMeanGap.lowerBound} –{' '}
            {report.predictedNextMeanGap.upperBound}]
          </div>
        </div>

        {/* Priority Gap Tranches */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Quotas Optimaux (Hamilton-Hare)
          </span>
          <div className="flex flex-wrap gap-1.5 my-2">
            {GAP_RANGE_BINS.filter(
              (b) => (report.selectionSynthesis.trancheQuotas[b.id] || 0) > 0
            ).map((bin) => {
              const q = report.selectionSynthesis.trancheQuotas[bin.id];
              return (
                <button
                  key={bin.id}
                  onClick={() => {
                    setSelectedBinId(bin.id);
                    setActiveSubTab('forecast');
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-black text-white shadow-xs transition-transform hover:scale-105 cursor-pointer flex items-center gap-1"
                  style={{ backgroundColor: bin.color }}
                >
                  <span>{q}×</span>
                  <span>{bin.shortLabel}</span>
                </button>
              );
            })}
          </div>
          <span className="text-[10px] text-slate-400">
            Fidélité distribution : {report.selectionSynthesis.quotaFidelity}%
          </span>
        </div>
      </div>

      {/* CELLULE DE RAISONNEMENT & SÉLECTION SYNTHÉTIQUE PAR QUOTAS DE TRANCHES */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950/90 to-slate-900 text-white p-5 md:p-6 border border-indigo-500/30 shadow-lg space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Brain size={12} /> Cellule de Raisonnement & Sélection Multi-Tranches
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                KL M1: {report.reasoning.klDivergenceMarkov1.toFixed(3)} nats • KL M2:{' '}
                {report.reasoning.klDivergenceMarkov2.toFixed(3)} nats
              </span>
            </div>
            <h4 className="text-base md:text-lg font-black tracking-tight text-white">
              Synthèse Sous-Modulaire & Micro-Scoring Intra-Tranche (Noyau de Silverman)
            </h4>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowReasoningDetails((v) => !v)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-white/10 hover:bg-white/15 text-slate-200 transition-colors cursor-pointer"
            >
              {showReasoningDetails ? 'Masquer Chaîne Logique' : 'Afficher Chaîne Logique'}
            </button>
            <button
              onClick={resetOptimalSelection}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={12} />
              Synthèse Optimale Auto
            </button>
            <button
              onClick={handleSaveSelectionTicket}
              disabled={customSelection.length !== 5}
              className="px-3.5 py-1.5 rounded-xl text-[11px] font-black bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <BookmarkCheck size={14} />
              Enregistrer dans le Portefeuille
            </button>
          </div>
        </div>

        {/* 4-Step Explainable Reasoning Chain + Adaptive Bayesian Weights */}
        {showReasoningDetails && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {report.reasoning.reasoningChain.map((item) => (
                <div
                  key={item.step}
                  className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between space-y-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-black text-indigo-400">
                        ÉTAPE {item.step}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200">
                        {item.metricValue}
                      </span>
                    </div>
                    <div className="text-xs font-black text-white">
                      {item.title}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 pt-1 border-t border-white/5">
                    {item.metricLabel}
                  </div>
                </div>
              ))}
            </div>

            {/* Dynamic Information-Gain Model Weights Bar */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Poids Bayésiens Adaptatifs (Gain d’Information KL) :
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                  M1 Markov-1:{' '}
                  {(report.reasoning.modelWeights.markov1Weight * 100).toFixed(1)}%
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                  M2 Markov-2:{' '}
                  {(report.reasoning.modelWeights.markov2Weight * 100).toFixed(1)}%
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  M3 Renouvellement:{' '}
                  {(report.reasoning.modelWeights.renewalWeight * 100).toFixed(1)}%
                </span>
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                  M4 Écho W1:{' '}
                  {(report.reasoning.modelWeights.seqEchoWeight * 100).toFixed(1)}%
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-500/20 text-slate-300">
                  M0 Empirique:{' '}
                  {(report.reasoning.modelWeights.empiricalWeight * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Active 5-Ball Selection Tray + 2 Tactical Reserves */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="lg:col-span-7 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                Vecteur 5 Numéros Sélectionnés ({customSelection.length}/5)
              </span>
              <div className="flex items-center gap-2.5 flex-wrap">
                {customSelection.map((num) => {
                  const cand = candidateMap.get(num);
                  return (
                    <div
                      key={num}
                      onClick={() => toggleBallInSelection(num)}
                      title="Cliquer pour retirer de la sélection"
                      className="group relative flex flex-col items-center p-2 rounded-2xl bg-slate-900/90 border border-white/15 hover:border-rose-400/60 transition-all cursor-pointer"
                    >
                      <NumberBall number={num} size="md" />
                      {cand && (
                        <>
                          <span
                            className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-black text-white"
                            style={{ backgroundColor: cand.binColor }}
                          >
                            {cand.binShortLabel} ({cand.currentGap}t)
                          </span>
                          <span className="text-[9px] font-mono text-emerald-300 mt-0.5">
                            {cand.compositeScore.toFixed(1)} pts
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2 Tactical Reserves */}
            <div className="sm:border-l sm:border-white/10 sm:pl-4 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
                Réserves Tactiques (+2)
              </span>
              <div className="flex items-center gap-2">
                {report.selectionSynthesis.reserveTwo.map((num) => {
                  const cand = candidateMap.get(num);
                  const isSelected = customSelection.includes(num);
                  return (
                    <div
                      key={num}
                      onClick={() => toggleBallInSelection(num)}
                      title="Cliquer pour permuter dans la sélection"
                      className={`flex flex-col items-center p-2 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-400/50'
                          : 'bg-slate-900/60 border-amber-400/30 hover:border-amber-400'
                      }`}
                    >
                      <NumberBall number={num} size="sm" />
                      {cand && (
                        <span className="mt-1 text-[9px] font-mono text-amber-200">
                          {cand.binShortLabel} ({cand.currentGap}t)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selection Quality KPIs */}
          <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-center">
              <span className="text-[9px] font-bold uppercase text-slate-400 block">
                Score Moyen
              </span>
              <span className="text-base font-black font-mono text-emerald-400">
                {activeSelectionMetrics.meanScore.toFixed(1)}
              </span>
              <span className="text-[9px] text-slate-400 block">/ 100</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-center">
              <span className="text-[9px] font-bold uppercase text-slate-400 block">
                Résonance Hazard
              </span>
              <span className="text-base font-black font-mono text-indigo-300">
                {activeSelectionMetrics.meanHazard.toFixed(0)}%
              </span>
              <span className="text-[9px] text-slate-400 block">Silverman</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-center">
              <span className="text-[9px] font-bold uppercase text-slate-400 block">
                Tranches Couvertes
              </span>
              <span className="text-base font-black font-mono text-amber-300">
                {activeSelectionMetrics.uniqueBins}
              </span>
              <span className="text-[9px] text-slate-400 block">sur 7</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-center">
              <span className="text-[9px] font-bold uppercase text-slate-400 block">
                Dizaines Distinctes
              </span>
              <span className="text-base font-black font-mono text-cyan-300">
                {activeSelectionMetrics.uniqueDecades}/5
              </span>
              <span className="text-[9px] text-slate-400 block">Anti-Colinéaire</span>
            </div>
          </div>
        </div>

        {/* Top Micro-Scored Candidates Explorer across Tranches */}
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Target size={13} className="text-indigo-400" />
              Classement Micro-Scoring Intra-Tranche (Cliquer pour injecter dans les 5)
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setCandidateFilterBin('ALL')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                  candidateFilterBin === 'ALL'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                Toutes Tranches
              </button>
              {GAP_RANGE_BINS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setCandidateFilterBin(b.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    candidateFilterBin === b.id
                      ? 'text-white shadow-xs'
                      : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                  style={
                    candidateFilterBin === b.id
                      ? { backgroundColor: b.color }
                      : undefined
                  }
                >
                  {b.shortLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {filteredCandidates.map((cand) => {
              const isSelected = customSelection.includes(cand.number);
              const roleStyle = ROLE_STYLES[cand.role];
              return (
                <div
                  key={cand.number}
                  onClick={() => toggleBallInSelection(cand.number)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-indigo-500/20 border-emerald-400/70 shadow-sm'
                      : 'bg-white/5 border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <NumberBall number={cand.number} size="sm" />
                      <div>
                        <div className="flex items-center gap-1">
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-black text-white"
                            style={{ backgroundColor: cand.binColor }}
                          >
                            {cand.binShortLabel}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-300">
                            Écart {cand.currentGap}t
                          </span>
                        </div>
                        <span
                          className={`inline-block mt-1 px-1.5 py-0.2 rounded text-[8px] font-black uppercase border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}
                        >
                          {cand.role}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black font-mono text-white block">
                        {cand.compositeScore.toFixed(1)}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-300">
                        {isSelected ? (
                          <>
                            <Check size={10} /> Actif
                          </>
                        ) : (
                          <>
                            <Plus size={10} /> Choisir
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-white/10 text-[9px] font-mono text-slate-300">
                    <div>
                      <span className="text-slate-400 block">Hazard</span>
                      <span className="font-bold text-emerald-300">
                        {(cand.individualHazard * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Affinité</span>
                      <span className="font-bold text-indigo-300">
                        {(cand.trancheAffinity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Cycle μ</span>
                      <span className="font-bold text-amber-300">
                        {cand.meanHistoricalGap.toFixed(1)}t
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TAB 1: FORECAST & RESERVOIRS */}
      {activeSubTab === 'forecast' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 columns: Probability & Lift Bars per Gap Range */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Distribution de Probabilité Conditionnelle & Sécheresse par Tranche
              </h4>
              <span className="text-[10px] font-mono text-slate-400">
                Cliquez sur une tranche pour inspecter son réservoir
              </span>
            </div>

            <div className="space-y-2.5">
              {report.binForecasts.map((f) => {
                const isSelected = activeBinForecast?.bin.id === f.bin.id;
                const pct = Math.round(f.blendedProb * 1000) / 10;
                const basePct = Math.round(f.poolOccupancyProb * 1000) / 10;
                const isOver = f.liftOverTheoretical >= 1.08;
                const isDroughtAlert = f.droughtPressureIndex >= 0.65;

                return (
                  <div
                    key={f.bin.id}
                    onClick={() => setSelectedBinId(f.bin.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-500/50 shadow-xs'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: f.bin.color }}
                        />
                        <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                          {f.bin.label}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300 font-bold">
                          {f.currentPoolCount} boules dispo
                        </span>
                        {f.optimalQuotaBalls > 0 && (
                          <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                            Quota: {f.optimalQuotaBalls} boule
                            {f.optimalQuotaBalls > 1 ? 's' : ''}
                          </span>
                        )}
                        {isDroughtAlert && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <Flame size={10} /> Tension Retour (
                            {f.currentDroughtDraws}t)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            isOver
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-200/60 dark:bg-slate-700/60 text-slate-500'
                          }`}
                        >
                          Lift {f.liftOverTheoretical.toFixed(2)}×
                        </span>
                        <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Progress bar with baseline marker */}
                    <div className="relative h-2.5 w-full bg-slate-200 dark:bg-slate-700/70 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, pct * 2.2)}%`,
                          backgroundColor: f.bin.color,
                        }}
                      />
                      {/* Baseline H0 occupancy marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-white opacity-70"
                        style={{ left: `${Math.min(98, basePct * 2.2)}%` }}
                        title={`Occupation réelle H0 : ${basePct}%`}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono flex-wrap gap-1">
                      <span>
                        Espérance :{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {f.expectedBallsInNextDraw.toFixed(2)}
                        </strong>{' '}
                        / 5 • H0 : {basePct.toFixed(1)}%
                      </span>
                      <span>
                        M1: {(f.markovOrder1Prob * 100).toFixed(0)}% • M2:{' '}
                        {(f.markovOrder2Prob * 100).toFixed(0)}% • Renouv:{' '}
                        {(f.renewalHazardProb * 100).toFixed(0)}% • Sécheresse:{' '}
                        {f.currentDroughtDraws}t (μ={f.meanInterActivationInterval.toFixed(1)}t)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right 5 columns: Active Bin Reservoir Inspector with Micro-Scored Candidates */}
          <div className="lg:col-span-5">
            {activeBinForecast && (
              <div className="h-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white"
                      style={{ backgroundColor: activeBinForecast.bin.color }}
                    >
                      Réservoir Actuel • {activeBinForecast.bin.shortLabel}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      Quota optimal : {activeBinForecast.optimalQuotaBalls} boule(s)
                    </span>
                  </div>

                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    {activeBinForecast.bin.label}
                  </h4>

                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Cette tranche contient actuellement{' '}
                    <strong>{activeBinForecast.currentPoolCount} numéros</strong>{' '}
                    (occupation historique H0 :{' '}
                    {(activeBinForecast.poolOccupancyProb * 100).toFixed(1)}%). La
                    fusion bayésienne projette{' '}
                    <strong>
                      {activeBinForecast.expectedBallsInNextDraw.toFixed(2)} boule(s)
                    </strong>{' '}
                    au prochain tirage (Lift{' '}
                    <strong>
                      {activeBinForecast.liftOverTheoretical.toFixed(2)}×
                    </strong>
                    , sécheresse actuelle :{' '}
                    <strong>{activeBinForecast.currentDroughtDraws} tirages</strong>).
                  </p>

                  {/* Top Micro-Scored Candidates inside this Tranche */}
                  {activeBinForecast.topPoolCandidates.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                        Top Candidats Micro-Scorés de la Tranche (Cliquer pour choisir) :
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {activeBinForecast.topPoolCandidates
                          .slice(0, 4)
                          .map((c) => {
                            const isSelected = customSelection.includes(c.number);
                            return (
                              <div
                                key={c.number}
                                onClick={() => toggleBallInSelection(c.number)}
                                className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col items-center ${
                                  isSelected
                                    ? 'bg-indigo-500/15 border-indigo-500 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                                }`}
                              >
                                <NumberBall number={c.number} size="sm" />
                                <span className="mt-1 text-[10px] font-mono font-black text-slate-800 dark:text-slate-100">
                                  {c.microScore.toFixed(1)} pts
                                </span>
                                <span className="text-[9px] font-mono text-slate-400">
                                  Écart {c.currentGap}t • H:{' '}
                                  {(c.individualHazard * 100).toFixed(0)}%
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                      Tous les Numéros du Réservoir (Triés par Écart décroissant) :
                    </span>
                    {activeBinForecast.currentPoolCount === 0 ? (
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-400 text-center">
                        Aucun numéro ne se situe dans cette tranche d’écart actuellement.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                        {(
                          report.currentNumbersByBin[activeBinForecast.bin.id] || []
                        ).map((item) => {
                          const isSelected = customSelection.includes(
                            item.number
                          );
                          const micro =
                            candidateMap.get(item.number)?.compositeScore ?? 0;
                          return (
                            <div
                              key={item.number}
                              onClick={() => toggleBallInSelection(item.number)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-500/15 border-indigo-500 ring-1 ring-indigo-500/40'
                                  : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                              }`}
                            >
                              <NumberBall number={item.number} size="sm" />
                              <div className="flex flex-col">
                                <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200">
                                  {item.currentGap}t
                                </span>
                                <span className="text-[9px] font-mono text-indigo-500">
                                  {micro.toFixed(0)}p
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Historical Sequence Echo Summary */}
                {report.historicalMatches.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        Meilleur Écho Topologique 1-Wasserstein
                      </span>
                      <span className="text-[10px] font-mono font-bold text-indigo-500">
                        Sim. W1+ADN :{' '}
                        {Math.round(report.historicalMatches[0].similarity * 100)}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Lors du tirage analogue du{' '}
                      <strong>{report.historicalMatches[0].date}</strong>, le
                      tirage suivant (
                      <strong>{report.historicalMatches[0].nextDrawDate}</strong>) a
                      produit un écart moyen de{' '}
                      <strong>
                        {report.historicalMatches[0].nextDrawFootprint.meanGap.toFixed(
                          1
                        )}
                      </strong>{' '}
                      avec dominante{' '}
                      <strong>
                        {
                          GAP_RANGE_BINS.find(
                            (b) =>
                              b.id ===
                              report.historicalMatches[0].nextDrawFootprint
                                .dominantBin
                          )?.shortLabel
                        }
                      </strong>
                      .
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TIMELINE OF RECENT GAP SEQUENCES */}
      {activeSubTab === 'timeline' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Chronologie Interactive des Séquences d’Écarts
              </h4>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {[10, 15, 25].map((n) => (
                  <button
                    key={n}
                    onClick={() => setTimelineLimit(n)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                      timelineLimit === n
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    {n} tirages
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {GAP_RANGE_BINS.map((b) => (
                <span
                  key={b.id}
                  onClick={() => {
                    setSelectedBinId(b.id);
                    setActiveSubTab('forecast');
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer hover:opacity-80"
                  title="Cliquer pour filtrer ce réservoir"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: b.color }}
                  />
                  {b.shortLabel}
                </span>
              ))}
            </div>
          </div>

          {/* Inspected Draw Detail Banner */}
          {inspectedFootprint && (
            <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    Inspection Tirage #{inspectedFootprint.drawIndex} •{' '}
                    {inspectedFootprint.date}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                    μ : {inspectedFootprint.meanGap.toFixed(1)}t • Médiane :{' '}
                    {inspectedFootprint.medianGap.toFixed(1)}t • σ :{' '}
                    {inspectedFootprint.stdGap.toFixed(1)} • Entropie H :{' '}
                    {(inspectedFootprint.trancheEntropy * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Cliquez sur n’importe quelle boule ci-dessous pour l’ajouter au panier de sélection ou inspecter sa tranche.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {inspectedFootprint.winningNumbers.map((w) => {
                  const bin = GAP_RANGE_BINS.find((b) => b.id === w.binId);
                  return (
                    <button
                      key={w.number}
                      onClick={() => toggleBallInSelection(w.number)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:scale-105 transition-transform cursor-pointer shadow-2xs"
                    >
                      <NumberBall number={w.number} size="sm" />
                      <div className="text-left">
                        <span
                          className="block text-[10px] font-black"
                          style={{ color: bin?.color }}
                        >
                          Écart {w.gapAtDraw}t
                        </span>
                        <span className="block text-[9px] text-slate-400">
                          {bin?.shortLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {report.recentFootprints.slice(0, timelineLimit).map((fp) => {
              const isInspected =
                inspectedFootprint?.drawIndex === fp.drawIndex;
              return (
                <div
                  key={`${fp.drawIndex}-${fp.date}`}
                  onClick={() => setSelectedDrawIndex(fp.drawIndex)}
                  className={`p-3 rounded-2xl border grid grid-cols-1 md:grid-cols-12 items-center gap-3 cursor-pointer transition-all ${
                    isInspected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500/50 shadow-xs'
                      : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="md:col-span-2 flex items-center justify-between md:block">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                      {fp.date}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      T-{fp.drawIndex} • μ={fp.meanGap.toFixed(1)} • H=
                      {(fp.trancheEntropy * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* 5 Stacked Proportional Blocks */}
                  <div className="md:col-span-4 flex h-5 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700">
                    {GAP_RANGE_BINS.map((bin) => {
                      const count = fp.binCounts[bin.id];
                      if (count === 0) return null;
                      return (
                        <div
                          key={bin.id}
                          style={{
                            width: `${(count / 5) * 100}%`,
                            backgroundColor: bin.color,
                          }}
                          className="h-full flex items-center justify-center text-[10px] font-black text-white"
                          title={`${bin.label}: ${count} boule(s)`}
                        >
                          {count}
                        </div>
                      );
                    })}
                  </div>

                  {/* Winning Numbers with Individual Exact Gap Badge */}
                  <div className="md:col-span-6 flex flex-wrap items-center gap-1.5 justify-end">
                    {fp.winningNumbers.map((w) => {
                      const bin = GAP_RANGE_BINS.find((b) => b.id === w.binId);
                      return (
                        <span
                          key={w.number}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono font-bold text-white shadow-2xs"
                          style={{ backgroundColor: bin?.color || '#6366f1' }}
                        >
                          <span>
                            {w.number < 10 ? `0${w.number}` : w.number}
                          </span>
                          <span className="opacity-80 text-[9px] bg-black/20 px-1 rounded">
                            {w.gapAtDraw}t
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: TRANSITION MATRIX & WASSERSTEIN ECHOES */}
      {activeSubTab === 'matrix' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Transition Matrix Order 1 */}
          <div className="lg:col-span-7 space-y-3 overflow-x-auto">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Matrice de Transition Markovienne (Dominante T → Répartition T+1)
            </h4>
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="p-2 text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                    De \ Vers
                  </th>
                  {GAP_RANGE_BINS.map((b) => (
                    <th
                      key={b.id}
                      className="p-2 text-center font-black border-b border-slate-200 dark:border-slate-800"
                      style={{ color: b.color }}
                    >
                      {b.id.replace('G', '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GAP_RANGE_BINS.map((rowBin) => (
                  <tr
                    key={rowBin.id}
                    className="border-b border-slate-100 dark:border-slate-800/60"
                  >
                    <td className="p-2 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: rowBin.color }}
                      />
                      {rowBin.shortLabel}
                    </td>
                    {GAP_RANGE_BINS.map((colBin) => {
                      const prob =
                        report.transitionMatrixOrder1[rowBin.id][colBin.id];
                      const pct = Math.round(prob * 100);
                      const intensity = Math.min(1, prob / 0.35);
                      return (
                        <td
                          key={colBin.id}
                          onClick={() => {
                            setSimCurrBin(rowBin.id);
                            setSelectedBinId(colBin.id);
                          }}
                          className="p-2 text-center font-mono font-bold rounded transition-transform hover:scale-105 cursor-pointer"
                          style={{
                            backgroundColor: `rgba(99, 102, 241, ${
                              intensity * 0.38
                            })`,
                          }}
                          title={`De ${rowBin.shortLabel} vers ${colBin.shortLabel}: ${(
                            prob * 100
                          ).toFixed(1)}%`}
                        >
                          {pct}%
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Historical Sequence Analog Matches (1-Wasserstein + 4D DNA) */}
          <div className="lg:col-span-5 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Échos Topologiques 1-Wasserstein & ADN 4D
            </h4>
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {report.historicalMatches.map((m, idx) => (
                <div
                  key={`${m.matchIndex}-${idx}`}
                  onClick={() => {
                    const domId = m.nextDrawFootprint.dominantBin;
                    setSelectedBinId(domId);
                    setActiveSubTab('forecast');
                  }}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-2 hover:border-indigo-500/40 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      Analogue #{idx + 1} • {m.date}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        W1: {Math.round(m.wassersteinSimilarity * 100)}%
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Global: {Math.round(m.similarity * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Tirage suivant ({m.nextDrawDate}) :</span>
                    <ChevronRight size={12} />
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      μ = {m.nextDrawFootprint.meanGap.toFixed(1)}t (H=
                      {(m.nextDrawFootprint.trancheEntropy * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {GAP_RANGE_BINS.filter(
                      (b) => m.nextDrawFootprint.binCounts[b.id] > 0
                    ).map((b) => (
                      <span
                        key={b.id}
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: b.color }}
                      >
                        {b.shortLabel}: {m.nextDrawFootprint.binCounts[b.id]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: INTERACTIVE SIMULATOR, CUSTOM RANGE INSPECTOR & BACKTEST */}
      {activeSubTab === 'simulator' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 1. Custom Gap Interval Inspector */}
            <div className="lg:col-span-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass size={16} className="text-indigo-500" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Explorateur de Plage d’Écarts sur Mesure
                  </h4>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  Écart [{customRangeAnalysis?.minG} – {customRangeAnalysis?.maxG}]
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Écart Minimum : {customMinGap}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={customMinGap}
                    onChange={(e) => setCustomMinGap(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Écart Maximum : {customMaxGap}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={customMaxGap}
                    onChange={(e) => setCustomMaxGap(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>

              {customRangeAnalysis && (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block">
                        Fréquence Observée
                      </span>
                      <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                        {(customRangeAnalysis.empiricalProb * 100).toFixed(1)}%
                      </span>
                      <span className="text-[9px] text-slate-400 block">
                        Théorique :{' '}
                        {(customRangeAnalysis.theoreticalProb * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block">
                        Lift Empirique
                      </span>
                      <span
                        className={`text-base font-black font-mono ${
                          customRangeAnalysis.lift >= 1.05
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {customRangeAnalysis.lift.toFixed(2)}×
                      </span>
                      <span className="text-[9px] text-slate-400 block">
                        Espérance :{' '}
                        {customRangeAnalysis.expectedPerDraw.toFixed(2)} / tirage
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block">
                        Réservoir Actuel
                      </span>
                      <span className="text-base font-black font-mono text-indigo-600 dark:text-indigo-400">
                        {customRangeAnalysis.currentBalls.length} boules
                      </span>
                      <span className="text-[9px] text-slate-400 block">
                        Dans [{customRangeAnalysis.minG}–{customRangeAnalysis.maxG}]
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                      Numéros dans la Plage [{customRangeAnalysis.minG} –{' '}
                      {customRangeAnalysis.maxG}] (Triés par Micro-Score, cliquer pour choisir) :
                    </span>
                    {customRangeAnalysis.currentBalls.length === 0 ? (
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-400 text-center">
                        Aucune boule dans cet intervalle actuellement.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                        {customRangeAnalysis.currentBalls.map((item) => {
                          const isSelected = customSelection.includes(
                            item.number
                          );
                          return (
                            <div
                              key={item.number}
                              onClick={() => toggleBallInSelection(item.number)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg border cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-indigo-500/15 border-indigo-500'
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <NumberBall number={item.number} size="sm" />
                              <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                                {item.currentGap}t • {item.microScore.toFixed(0)}p
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 2. Trajectory Simulator (What-If Markov Order-2 Explorer) */}
            <div className="lg:col-span-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders size={16} className="text-purple-500" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Simulateur de Trajectoire Markov (Ordre 2)
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {simulatedTrajectory?.matchOccurrences || 0} occurrences
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Dominante T-1
                  </label>
                  <select
                    value={simPrevBin}
                    onChange={(e) => setSimPrevBin(e.target.value as GapBinId)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  >
                    {GAP_RANGE_BINS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Dominante T (Actuel)
                  </label>
                  <select
                    value={simCurrBin}
                    onChange={(e) => setSimCurrBin(e.target.value as GapBinId)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  >
                    {GAP_RANGE_BINS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {simulatedTrajectory && (
                <div className="space-y-2">
                  {simulatedTrajectory.distribution.slice(0, 5).map((d) => (
                    <div
                      key={d.bin.id}
                      onClick={() => {
                        setSelectedBinId(d.bin.id);
                        setActiveSubTab('forecast');
                      }}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between cursor-pointer hover:border-indigo-500/40"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: d.bin.color }}
                        />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {d.bin.shortLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-xs">
                        <span className="text-[10px] text-slate-400">
                          Esp. {d.expectedBalls.toFixed(2)} b.
                        </span>
                        <span className="font-black text-indigo-600 dark:text-indigo-400">
                          {(d.prob * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. Backtest Accuracy & Multi-Draw Regime Comparator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {backtestMetrics && (
              <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Award size={16} className="text-emerald-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Validation Backtest des Prédictions de Tranches
                    </h4>
                  </div>
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    {[10, 20, 30].map((w) => (
                      <button
                        key={w}
                        onClick={() => setBacktestWindow(w)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          backtestWindow === w
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-500'
                        }`}
                      >
                        {w} tirages
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">
                      Précision Tranche #1
                    </span>
                    <span className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
                      {backtestMetrics.top1SuccessRate.toFixed(0)}%
                    </span>
                    <span className="text-[9px] text-slate-400 block">
                      Au moins 1 boule dans Top 1
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">
                      Couverture Top 3 Tranches
                    </span>
                    <span className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
                      {backtestMetrics.top3BallCoverageRate.toFixed(1)}%
                    </span>
                    <span className="text-[9px] text-slate-400 block">
                      Des boules gagnantes capturées
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">
                      Moyenne Capturée / Tirage
                    </span>
                    <span className="text-lg font-black font-mono text-slate-900 dark:text-white">
                      {backtestMetrics.avgBallsCoveredPerDraw.toFixed(2)} / 5
                    </span>
                    <span className="text-[9px] text-slate-400 block">
                      Sur {backtestMetrics.evalCount} tirages testés
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {backtestMetrics.recentEvaluations.map((ev, i) => (
                    <div
                      key={`${ev.date}-${i}`}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {ev.date}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400">
                          Top 3 prévus :
                        </span>
                        {ev.predictedTopBins.map((bid) => {
                          const b = GAP_RANGE_BINS.find((x) => x.id === bid);
                          const hitCount = ev.actualCounts[bid];
                          return (
                            <span
                              key={bid}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                              style={{
                                backgroundColor: b?.color,
                                opacity: hitCount > 0 ? 1 : 0.35,
                              }}
                            >
                              {b?.id.replace('G', '')}: {hitCount}
                            </span>
                          );
                        })}
                      </div>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          ev.coveredBalls >= 3
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {ev.coveredBalls}/5 capturées
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Multi-Draw Regime Comparator */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 size={16} className="text-amber-500" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Comparateur de Régime
                  </h4>
                </div>
                <select
                  value={compareDrawName}
                  onChange={(e) => setCompareDrawName(e.target.value)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  <option value="ALL">Référence Globale (Tous)</option>
                  {availableDrawNames
                    .filter((n) => n !== drawName)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>

              {compareReport && (
                <div className="space-y-2.5">
                  {report.binForecasts.map((f, idx) => {
                    const compF = compareReport.binForecasts[idx];
                    const diffPct =
                      (f.blendedProb - (compF?.blendedProb ?? 0)) * 100;
                    return (
                      <div
                        key={f.bin.id}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: f.bin.color }}
                          />
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {f.bin.shortLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-slate-800 dark:text-slate-200 font-bold">
                            {(f.blendedProb * 100).toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-slate-400">
                            vs {(compF.blendedProb * 100).toFixed(1)}%
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              diffPct > 0.5
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : diffPct < -0.5
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}
                          >
                            {diffPct >= 0 ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
