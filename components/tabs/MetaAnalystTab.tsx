import React, { useState, useEffect, useMemo } from "react";
import {
  generatePlatinumPrediction,
  savePlatinumHistory,
  getPlatinumHistory,
} from "../../services/metaAnalystService";
import { savePredictionToHistory } from "../../services/predictionHistoryService";
import { HYPERGEOMETRIC_5_90 } from "../../services/backtestingFramework";
import { binomialUpperTail, benjaminiHochberg } from "../../utils/mathUtils";
import { saveTicket } from "../../services/userPreferencesService";
import { useNexusStore } from "../../store/useNexusStore";
import type { PlatinumResult, PlatinumScenario, Prediction } from "../../types";
import { AlgoKey, ScoreBreakdown } from "../../shared/prediction.types";
import { NumberBall } from "../NumberBall";
import { useToast } from "../ui/Toast";
import { TicketXRay } from "../TicketXRay";
import { PredictionComputationOverlay } from "../prediction/PredictionComputationOverlay";
import { UnifiedDnaSieveRadar } from "../genomic/UnifiedDnaSieveRadar";
import {
  Activity,
  Layers,
  Zap,
  BarChart3,
  RefreshCw,
  Radio,
  Fingerprint,
  MousePointer2,
  AlertCircle,
  Save,
  Share2,
  Sliders,
  Settings,
  Play,
  CheckCircle2,
  History,
  Cpu,
  Dna,
  ShieldCheck,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { audioEngine } from "../../utils/audioEngine";

interface MetaAnalystTabProps {
  drawName: string;
}

// Encodage visuel continu d'une métrique 0-100 : teinte ambre (45°) → émeraude (160°).
// Interpolation purement graphique, aucun seuil de décision.
const metricHue = (value: number): string =>
  `hsl(${45 + Math.max(0, Math.min(100, value)) * 1.15} 85% 55%)`;

// Teinte barycentrique du régime : mélange RGB pondéré par les probabilités mesurées
// (émeraude = stable, ambre = transition, rose = chaotique). La couleur affichée est donc
// toujours cohérente avec la barre de répartition, sans bifurcation binaire.
const regimeTint = (
  p?: { stable: number; transition: number; chaotic: number },
): string => {
  if (!p) return "#94a3b8";
  const total = p.stable + p.transition + p.chaotic || 1;
  const mix = (a: number, b: number, c: number) =>
    Math.round((p.stable * a + p.transition * b + p.chaotic * c) / total);
  return `rgb(${mix(16, 245, 244)}, ${mix(185, 158, 63)}, ${mix(129, 11, 94)})`;
};

// Référence exacte d'un tirage équitable 5/90, dérivée de la loi hypergéométrique :
// espérance du nombre de bons numéros et probabilité d'obtenir au moins 2 bons numéros.
const NULL_EXPECTED_HITS = Object.entries(HYPERGEOMETRIC_5_90).reduce(
  (acc, [k, p]) => acc + Number(k) * p,
  0,
);
const NULL_PROB_AT_LEAST_2 = 1 - HYPERGEOMETRIC_5_90[0] - HYPERGEOMETRIC_5_90[1];

// Tolérance FDR dérivée de la structure du jeu (aucun seuil arbitraire type 0.05) : la proportion
// neutre de numéros gagnants (5/90) sert d'échelle de risque intrinsèque, même convention que
// `services/prediction/weightsManager.ts`.
const NEUTRAL_FDR_TOLERANCE = 5 / 90;

const ScenarioCard = React.memo<{
  scenario: PlatinumScenario;
  isSelected: boolean;
  onClick: () => void;
  onSave: () => void;
}>(({ scenario, isSelected, onClick, onSave }) => {
  return (
    <motion.div
      layout
      onClick={() => {
        onClick();
      }}
      whileHover={{ y: -4 }}
      className={`
                relative p-5 rounded-2xl border cursor-pointer overflow-hidden flex flex-col justify-between h-full transition-all duration-300
                ${
                  isSelected
                    ? "bg-slate-800 border-white/20 shadow-2xl ring-1 ring-white/10"
                    : "bg-slate-900/50 border-white/5 hover:bg-slate-800/50 hover:border-white/10"
                }
            `}
    >
      {isSelected && (
        <div
          className="absolute top-0 left-0 w-full h-1"
          style={{ backgroundColor: scenario.color }}
        />
      )}

      <div>
        <div className="flex justify-between items-start mb-3">
          <span
            className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md"
            style={{
              color: scenario.color,
              backgroundColor: `${scenario.color}15`,
            }}
          >
            Rang {scenario.risk}
          </span>
          <span className="text-xs font-bold text-white flex items-baseline gap-1">
            {scenario.relativeIndex.toFixed(0)}
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
              densité
            </span>
          </span>
        </div>

        <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">
          {scenario.name}
        </h3>
        <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-3">
          {scenario.description}
        </p>

        {scenario.genomicProfile && (
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[9px] space-y-1">
            <div className="font-bold text-slate-300 flex items-center gap-1.5">
              <Dna size={12} className="text-indigo-400 shrink-0" />
              <span className="truncate">{scenario.genomicProfile.focus}</span>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {scenario.genomicProfile.mrrBoost && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-bold">
                  MRR +{(scenario.genomicProfile.mrrBoost * 100 - 100).toFixed(0)}%
                </span>
              )}
              {scenario.genomicProfile.sieveAccelerationDelta && (
                <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono font-bold">
                  ΔM_n &gt; 0 (+{scenario.genomicProfile.sieveAccelerationDelta})
                </span>
              )}
              {scenario.genomicProfile.entropyRegimeAdaptive && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono font-bold">
                  Haute Entropie
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex justify-between gap-1">
          {scenario.numbers.map((n) => (
            <NumberBall key={n} number={n} size="sm" />
          ))}
        </div>

        {isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ backgroundColor: scenario.color }}
          >
            <Save size={12} /> Sauvegarder
          </button>
        )}
      </div>
    </motion.div>
  );
});

export const MetaAnalystTab: React.FC<MetaAnalystTabProps> = ({ drawName }) => {
  const { showToast } = useToast();

  // Optimisation des sélecteurs pour éviter les re-renders inutiles
  const rawHistory = useNexusStore((state) => state.history);
  const history = React.useDeferredValue(rawHistory);
  const nexusLoading = useNexusStore((state) => state.loading);
  const spectral = useNexusStore((state) => state.spectral);
  const fractal = useNexusStore((state) => state.fractal);
  const volatility = useNexusStore((state) => state.volatility);
  const regularity = useNexusStore((state) => state.regularity);
  const symbioticContext = useNexusStore((state) => state.symbioticContext);

  const [result, setResult] = useState<PlatinumResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Advanced Operational Calibration Parameters
  const [regimePivot, setRegimePivot] = useState<number>(0.8);
  const [forensicGain, setForensicGain] = useState<number>(1.0);
  const [phaseFrequency, setPhaseFrequency] = useState<number>(1.0);
  const [shannonEntropyFilter, setShannonEntropyFilter] =
    useState<boolean>(false);
  const [showCalibration, setShowCalibration] = useState<boolean>(false);

  // Backtesting Simulator state
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [backtestResults, setBacktestResults] = useState<{
    trials: number;
    scenariosStats: Record<
      string,
      {
        name: string;
        meanHits: number;
        expectedHits: number;
        ge2Count: number;
        ge2Rate: number;
        nullGe2Rate: number;
        totalHits: number;
        // p-value unilatérale EXACTE (queue supérieure binomiale) du nombre de tirages à ≥2 bons
        // numéros observés, sous H0 « tirage équitable ». null si la fenêtre ne permet aucun test.
        pValue: number | null;
        // p-value ajustée Benjamini-Hochberg (FDR) sur la famille des scénarios testés ensemble.
        qValue: number | null;
      }
    >;
    details: {
      drawDate: string;
      actualWinners: number[];
      scenarioHits: Record<string, number>;
    }[];
    bestScenario: string;
  } | null>(null);

  // Mémoisation des handlers
  const handleScenarioClick = React.useCallback((id: string) => {
    audioEngine.play("click");
    setSelectedScenarioId(id);
  }, []);

  // PERSISTENCE EFFECT: Load last result on mount or when drawName changes
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      const hist = await getPlatinumHistory(drawName);
      if (isMounted) {
        if (hist.length > 0) {
          setResult(hist[0]);
          setSelectedScenarioId("alpha");
        } else {
          setResult(null);
          setSelectedScenarioId(null);
        }
      }
    };
    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [drawName]);

  const runAnalysis = async () => {
    audioEngine.play("click");
    if (history.length < 15) {
      audioEngine.play("error");
      showToast("Dataset insuffisant pour la convergence.", "error");
      return;
    }
    setLoadingProgress(0);
    setLoadingStep("Calibrage du réseau de neurones artificiels...");
    setLoading(true);
    audioEngine.play("loading");

    try {
      const data = await generatePlatinumPrediction(
        drawName,
        history,
        { spectral, fractal, volatility: volatility ?? undefined }, // Inject pre-computed metrics
        { regimePivot, forensicGain, phaseFrequency, shannonEntropyFilter }, // Custom calibrated options!
        symbioticContext,
        undefined,
        (progress, message) => {
          setLoadingProgress(progress);
          setLoadingStep(message);
        },
      );

      setResult(data);
      setSelectedScenarioId("alpha"); // Select Conservative by default
      savePlatinumHistory(data);
      audioEngine.play("success");
      showToast("Convergence Tensorielle atteinte.", "success");
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast(
        "Erreur Hyper-Convergence : " +
          (e instanceof Error ? e.message : String(e)),
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    audioEngine.play("click");
    if (history.length < 18) {
      showToast(
        "Dataset insuffisant pour un backtest rétroactif (min. 18 tirages requis).",
        "error",
      );
      return;
    }
    setIsBacktesting(true);
    setLoadingProgress(0);
    setLoadingStep("Initialisation du rétro-audit temporel...");
    audioEngine.play("loading");

    try {
      // Backtest sur les 8 derniers tirages disponibles
      const trialsCount = Math.min(8, history.length - 10);
      const detailsList: any[] = [];
      const scenarioAccumulator: Record<
        string,
        { name: string; totalHits: number; ge2: number }
      > = {
        alpha: { name: "Alpha Core", totalHits: 0, ge2: 0 },
        beta: { name: "Beta Flow", totalHits: 0, ge2: 0 },
        gamma: { name: "Gamma Burst", totalHits: 0, ge2: 0 },
        delta: { name: "Delta Convergence", totalHits: 0, ge2: 0 },
        epsilon: { name: "Epsilon Forensic", totalHits: 0, ge2: 0 },
        zeta: { name: "Zeta Adversarial", totalHits: 0, ge2: 0 },
      };

      for (let j = trialsCount; j >= 1; j--) {
        const targetDraw = history[j - 1]; // Le tirage réel ciblé
        const historicalWindow = history.slice(j); // L'historique coupé avant ce tirage réel

        // Calculer la prédiction à cet instant rétroactif
        const pred = await generatePlatinumPrediction(
          drawName,
          historicalWindow,
          { spectral, fractal, volatility: volatility ?? undefined },
          { regimePivot, forensicGain, phaseFrequency, shannonEntropyFilter },
          symbioticContext,
          undefined,
          (progress, message) => {
            const trialIndex = trialsCount - j; // 0 to trialsCount - 1
            const totalProgress = Math.round(
              ((trialIndex + progress / 100) / trialsCount) * 100,
            );
            setLoadingProgress(totalProgress);
            setLoadingStep(
              `Backtest rétroactif ${trialIndex + 1}/${trialsCount} : ${message}`,
            );
          },
        );

        const winners = new Set(Array.isArray(targetDraw?.gagnants) ? targetDraw.gagnants : []);
        const stepHits: Record<string, number> = {};

        (pred?.scenarios || []).forEach((s) => {
          if (!s) return;
          const sNums = Array.isArray(s.numbers) ? s.numbers : [];
          const hits = sNums.filter((num) => winners.has(num)).length;
          stepHits[s.id] = hits;

          if (scenarioAccumulator[s.id]) {
            scenarioAccumulator[s.id].name = s.name;
            scenarioAccumulator[s.id].totalHits += hits;
            // Comptage du taux observé de tirages à ≥ 2 bons numéros, dont la valeur
            // attendue sous tirage équitable est NULL_PROB_AT_LEAST_2 (loi hypergéométrique).
            if (hits >= 2) {
              scenarioAccumulator[s.id].ge2 += 1;
            }
          }
        });

        detailsList.push({
          drawDate: targetDraw.date || `Tirage rétroactif -${j}`,
          actualWinners: targetDraw.gagnants,
          scenarioHits: stepHits,
        });
      }

      const stats: Record<string, any> = {};
      let maxTotalHits = -1;
      let bestScen = "Alpha Core";

      // p-values exactes par scénario : X ~ B(trialsCount, NULL_PROB_AT_LEAST_2) sous tirage
      // équitable. Calculées AVANT la correction FDR, qui exige la famille complète.
      const rawPValues: Record<string, number> = {};

      Object.keys(scenarioAccumulator).forEach((id) => {
        const item = scenarioAccumulator[id];
        const meanHits = item.totalHits / trialsCount;
        rawPValues[id] = binomialUpperTail(item.ge2, trialsCount, NULL_PROB_AT_LEAST_2);

        if (item.totalHits > maxTotalHits) {
          maxTotalHits = item.totalHits;
          bestScen = item.name;
        }
      });

      const qValues = benjaminiHochberg(rawPValues);

      Object.keys(scenarioAccumulator).forEach((id) => {
        const item = scenarioAccumulator[id];
        const meanHits = item.totalHits / trialsCount;
        const p = rawPValues[id];
        const q = qValues[id];

        stats[id] = {
          name: item.name,
          meanHits: Number(meanHits.toFixed(2)),
          expectedHits: Number(NULL_EXPECTED_HITS.toFixed(2)),
          ge2Count: item.ge2,
          ge2Rate: Number(((item.ge2 / trialsCount) * 100).toFixed(1)),
          nullGe2Rate: Number((NULL_PROB_AT_LEAST_2 * 100).toFixed(2)),
          totalHits: item.totalHits,
          pValue: Number.isFinite(p) ? Number(p.toFixed(4)) : null,
          qValue: Number.isFinite(q) ? Number(q.toFixed(4)) : null,
        };
      });

      setBacktestResults({
        trials: trialsCount,
        scenariosStats: stats,
        details: detailsList,
        bestScenario: bestScen,
      });

      showToast(
        `Rétro-audit complété sur ${trialsCount} cycles de test stochastique.`,
        "success",
      );
      audioEngine.play("success");
    } catch (err: any) {
      showToast("L'audit rétroactif a échoué : " + err.message, "error");
      audioEngine.play("error");
    } finally {
      setIsBacktesting(false);
    }
  };

  const handleSave = async (scenario: PlatinumScenario) => {
    audioEngine.play("click");
    await saveTicket({
      numbers: scenario.numbers,
      drawName,
      strategy: `Platinum ${scenario.name}`,
    });

    if (result) {
      // Breakdown construit exclusivement à partir des scores de canal réellement mesurés
      // par le moteur Platinum (aucun canal à zéro inventé, aucune clé hors AlgoKey).
      const breakdown: Record<number, ScoreBreakdown> = {};
      const safeScenarioNums = Array.isArray(scenario?.numbers) ? scenario.numbers : [];
      const channels = Object.entries(result.channelScores ?? {}) as [
        AlgoKey,
        number[],
      ][];
      if (channels.length > 0) {
        safeScenarioNums.forEach((num) => {
          const entry: ScoreBreakdown = {};
          channels.forEach(([key, values]) => {
            const v = values?.[num];
            if (typeof v === "number") entry[key] = Number(v.toFixed(2));
          });
          breakdown[num] = entry;
        });
      }

      const predictionObj: Prediction = {
        suggestedNumbers: scenario.numbers,
        candidates: scenario.numbers,
        confidence: result.confidence,
        analysis: scenario.description,
        breakdown: breakdown,
        scenarioName: `Platinum ${scenario.name}`,
        timestamp: Date.now(),
      };
      await savePredictionToHistory(drawName, predictionObj, undefined, {
        spectral,
        fractal,
        volatility: volatility ?? undefined,
        regularity,
      });
    }

    audioEngine.play("success");
    showToast("Vecteur sécurisé et autopsié.", "success");
  };

  const handleExportScenario = async (scenario: PlatinumScenario) => {
    audioEngine.play("click");
    const ticketElement = document.getElementById(
      `scenario-xray-${scenario.id}`,
    );
    if (!ticketElement) return;

    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(ticketElement, {
        backgroundColor: "#0f172a", // slate-900
        scale: 2,
        logging: false,
      });

      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `NexusPro_Platinum_${scenario.name}_${drawName}_${new Date().toISOString().split("T")[0]}.png`;
      link.click();

      showToast("Analyse exportée avec succès !", "success");
      audioEngine.play("success");
    } catch (e) {
      console.error("Export error:", e);
      showToast("Erreur lors de l'export.", "error");
      audioEngine.play("error");
    }
  };

  // Data for the Spectrum Chart
  const spectrumData = useMemo(() => {
    if (!result) return [];
    // Convert [0, ..., val, ...] to [{n: 1, v: val}, ...] skipping index 0
    return Array.from({ length: 90 }, (_, i) => ({
      n: i + 1,
      v: Math.round(result.consensusVector[i + 1]),
    }));
  }, [result]);

  // Échelle et moyenne mesurées sur place (le vecteur de consensus est normalisé par son max).
  const spectrumMax = useMemo(
    () => Math.max(1, ...spectrumData.map((e) => e.v)),
    [spectrumData],
  );
  const spectrumMean = useMemo(
    () =>
      spectrumData.length > 0
        ? spectrumData.reduce((acc, e) => acc + e.v, 0) / spectrumData.length
        : 0,
    [spectrumData],
  );

  // Verdict du rétro-audit DÉRIVÉ des p-values ajustées (FDR) réellement calculées : aucune
  // conclusion de significativité n'est affirmée sans le test correspondant.
  const backtestVerdict = useMemo(() => {
    if (!backtestResults) return null;
    const entries = Object.values(backtestResults.scenariosStats) as {
      name: string;
      qValue: number | null;
      ge2Count?: number;
      pValue: number | null;
    }[];
    const tested = entries.filter(
      (s) => typeof s.qValue === "number" && typeof s.pValue === "number",
    );
    if (tested.length === 0) {
      return { testedCount: 0, rejected: [] as string[], minQ: null as number | null };
    }
    const rejected = tested
      .filter((s) => (s.qValue as number) <= NEUTRAL_FDR_TOLERANCE)
      .map((s) => s.name);
    const minQ = Math.min(...tested.map((s) => s.qValue as number));
    return { testedCount: tested.length, rejected, minQ };
  }, [backtestResults]);

  const selectedScenario = result?.scenarios.find(
    (s) => s.id === selectedScenarioId,
  );

  // `nexusLoading` est un chargement de DONNÉES, pas une inférence : une revalidation en
  // arrière-plan ne doit ni se présenter comme une inférence en cours ni masquer un résultat
  // déjà calculé. Seul le tout premier chargement (aucun historique) justifie l'overlay.
  const initialDataLoad = nexusLoading && history.length === 0;
  const isInferring = loading || isBacktesting || initialDataLoad;

  return (
    <div className="space-y-6 animate-fade-in pb-20 w-full overflow-hidden">
      <PredictionComputationOverlay
        isComputing={isInferring}
        computingStep={
          loadingStep ||
          (isBacktesting
            ? "Rétro-audit temporel..."
            : initialDataLoad
              ? "Chargement de l'historique du tirage..."
              : "Fusion des tenseurs probabilistes...")
        }
        historyLength={history.length}
        progress={loadingProgress}
      />

      {!result && !isInferring && (
        <div className="flex flex-col items-center justify-center min-h-[500px] p-8 text-center bg-slate-900/50 rounded-3xl border border-white/5">
          <div className="p-6 bg-slate-900 rounded-full shadow-2xl mb-8 border border-white/5">
            <Layers size={64} className="text-slate-500" />
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter mb-4">
            Nexus <span className="text-indigo-500">Platinum</span>
          </h2>
          <p className="text-slate-400 max-w-md text-sm font-medium leading-relaxed mb-10">
            Activez le moteur de fusion tensorielle pour générer un spectre de
            probabilité unifié à partir de tous les modèles disponibles.
          </p>
          <button
            onClick={runAnalysis}
            className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center gap-3 group"
          >
            <Zap
              size={18}
              className="group-hover:text-yellow-300 transition-colors"
            />{" "}
            Initialiser le Système
          </button>
        </div>
      )}

      {result && (
        <>
      {/* 1. MISSION CONTROL HEADER */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
            <span>Cohérence</span>
            <ShieldCheck size={14} className="text-emerald-400" />
          </span>
          <div className="mt-2 text-2xl font-black text-white flex items-center gap-2">
            {result.coherence}
            <Activity size={16} style={{ color: metricHue(result.coherence) }} />
          </div>
          <span className="text-[9px] font-mono text-slate-500 mt-1">
            {typeof result.entropy === "number"
              ? `H = ${result.entropy.toFixed(3)} bit/sym`
              : "H = n/d"}
          </span>
        </div>

        <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
            <span>Tamis ADN Actif</span>
            <Dna size={14} className="text-violet-400" />
          </span>
          <div className="mt-2 text-2xl font-black text-violet-400 flex items-baseline gap-1">
            {typeof result.dnaSieveInfo?.dnaConcordanceMean === "number"
              ? result.dnaSieveInfo.dnaConcordanceMean
              : "n/d"}
            {typeof result.dnaSieveInfo?.dnaConcordanceMean === "number" && (
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                indice
              </span>
            )}
          </div>
          <span className="text-[9px] font-mono text-slate-400 mt-1 truncate">
            Intensité :{" "}
            {typeof result.dnaSieveInfo?.sieveIntensityPercent === "number"
              ? `${result.dnaSieveInfo.sieveIntensityPercent}%`
              : "n/d"}
          </span>
        </div>

        <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
            <span>Régime</span>
            <span className="text-[9px] font-mono text-slate-400">
              {typeof result.regimeProbabilities?.stable === "number"
                ? `${result.regimeProbabilities.stable}% S`
                : "n/d"}
            </span>
          </span>
          <div
            className="mt-2 text-xl font-black uppercase"
            style={{ color: regimeTint(result.regimeProbabilities) }}
          >
            {result.regime}
          </div>
          {result.regimeProbabilities && (
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex mt-2">
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${result.regimeProbabilities.stable}%` }}
                title={`Stable: ${result.regimeProbabilities.stable}%`}
              />
              <div
                className="bg-amber-500 h-full"
                style={{ width: `${result.regimeProbabilities.transition}%` }}
                title={`Transition: ${result.regimeProbabilities.transition}%`}
              />
              <div
                className="bg-rose-500 h-full"
                style={{ width: `${result.regimeProbabilities.chaotic}%` }}
                title={`Chaotique: ${result.regimeProbabilities.chaotic}%`}
              />
            </div>
          )}
        </div>

        <button
          onClick={runAnalysis}
          className="bg-indigo-600 hover:bg-indigo-500 rounded-3xl p-4 flex flex-col items-center justify-center text-white transition-colors group shadow-lg shadow-indigo-600/20 active:scale-95"
        >
          <RefreshCw
            size={20}
            className="mb-1 group-hover:rotate-180 transition-transform duration-300"
          />
          <span className="text-xs font-black uppercase tracking-widest">
            Re-Scan Déterministe
          </span>
        </button>
      </div>

      {/* 2. HYPER-SPECTRUM CHART (The main visual) */}
      <div className="bg-slate-900/40 backdrop-blur-xl p-8 md:p-10 rounded-[2rem] border border-slate-850 shadow-2xl relative overflow-hidden group">
        <div className="flex justify-between items-center mb-8 px-2">
          <div>
            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
              <BarChart3 className="text-indigo-400" size={12} /> Densité
              Relative (100 = numéro le mieux classé)
            </h3>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tighter">
              Hyper-Spectre Harmonique
            </span>
          </div>
          {hoveredIndex !== null && (
            <div className="flex items-center gap-2.5 bg-indigo-500/10 px-4 py-1.5 rounded-full border border-indigo-500/20 shadow-inner animate-fade-in">
              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                Numéro {hoveredIndex}
              </span>
              <span
                className="text-sm font-black"
                style={{ color: metricHue(spectrumData[hoveredIndex - 1]?.v ?? 0) }}
              >
                {spectrumData[hoveredIndex - 1]?.v ?? "n/d"}
              </span>
            </div>
          )}
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={spectrumData}
              onMouseMove={(e) => {
                if (e.activeTooltipIndex !== undefined)
                  setHoveredIndex(e.activeTooltipIndex + 1);
              }}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                <linearGradient id="spectrumBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <Tooltip />
              <Bar dataKey="v" radius={[2, 2, 0, 0]} animationDuration={1500}>
                {spectrumData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      selectedScenario?.numbers.includes(entry.n)
                        ? selectedScenario.color
                        : "#818cf8"
                    }
                    fillOpacity={
                      0.25 + 0.75 * (entry.v / spectrumMax)
                    }
                    className="transition-all duration-300"
                  />
                ))}
              </Bar>
              <ReferenceLine
                y={spectrumMean}
                stroke="#475569"
                strokeDasharray="3 3"
                label={{
                  value: `moyenne ${spectrumMean.toFixed(1)}`,
                  position: "insideTopRight",
                  fill: "#64748b",
                  fontSize: 10,
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* X-Axis Labels (Simplified) */}
        <div className="flex justify-between text-xs font-mono text-slate-600 px-1 mt-2">
          <span>1</span>
          <span>10</span>
          <span>20</span>
          <span>30</span>
          <span>40</span>
          <span>50</span>
          <span>60</span>
          <span>70</span>
          <span>80</span>
          <span>90</span>
        </div>
      </div>

      {/* 3. ADVANCED OPERATIONS & CALIBRATION */}
      <div
        id="platinum-calibration-panel"
        className="bg-slate-900/60 backdrop-blur-md rounded-3xl p-6 border border-white/5 space-y-6"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Sliders size={16} className="text-amber-500" />
              Tableau de Calibration de Précision
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">
              Ajustez l'algorithme hyper-convergé et lancez un rétro-audit
              temporel pour calibrer vos tickets.
            </p>
          </div>
          <button
            onClick={() => {
              audioEngine.play("click");
              setShowCalibration(!showCalibration);
            }}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 bg-slate-850 hover:bg-slate-750 text-slate-300"
          >
            <Settings
              size={12}
              className={
                showCalibration
                  ? "rotate-90 transition-transform"
                  : "transition-transform"
              }
            />
            {showCalibration ? "Masquer Réglages" : "Configurer Moteur"}
          </button>
        </div>

        <AnimatePresence>
          {showCalibration && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden pt-4 border-t border-white/5 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Sliders */}
                <div className="space-y-4">
                  {/* Regime Pivot Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Cpu size={12} className="text-indigo-400" /> Seuil
                        Pivot de Régime
                      </span>
                      <span className="text-indigo-400 font-mono">
                        {regimePivot.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.60"
                      max="0.95"
                      step="0.01"
                      value={regimePivot}
                      onChange={(e) => setRegimePivot(Number(e.target.value))}
                      className="w-full accent-indigo-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-500 leading-normal">
                      Seuil d'inflexion stochastique. Détermine la limite de
                      sensibilité entre les régimes ordonnés et chaotiques.
                    </p>
                  </div>

                  {/* Forensic Gain Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <History size={12} className="text-violet-400" /> Gain
                        Rétroactif Forensic
                      </span>
                      <span className="text-violet-400 font-mono">
                        {forensicGain.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={forensicGain}
                      onChange={(e) => setForensicGain(Number(e.target.value))}
                      className="w-full accent-violet-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-500 leading-normal">
                      Intensité de correction d'erreurs. Multiplie la
                      rétroaction des dérives et manques historiques.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Phase Frequency Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Activity size={12} className="text-rose-400" /> Phase
                        Trigonométrique
                      </span>
                      <span className="text-rose-400 font-mono">
                        {phaseFrequency.toFixed(1)} rad
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="2.0"
                      step="0.1"
                      value={phaseFrequency}
                      onChange={(e) =>
                        setPhaseFrequency(Number(e.target.value))
                      }
                      className="w-full accent-rose-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-500 leading-normal">
                      Dispersion orbitale des scénarios. Modifie le décalage
                      fréquentiel angulaire pour éviter les chevauchements.
                    </p>
                  </div>

                  {/* Shannon Entropy Filter Toggle */}
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-white/5">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 block">
                        Filtre de Shannon (Réduction de Bruit)
                      </span>
                      <span className="text-[9px] text-slate-500 mt-0.5 block leading-normal max-w-xs">
                        Élimine de façon différentielle les bruits blancs sous
                        le spectre d'énergie moyenne.
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        audioEngine.play("click");
                        setShannonEntropyFilter(!shannonEntropyFilter);
                      }}
                      className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-300 relative ${shannonEntropyFilter ? "bg-indigo-600" : "bg-slate-700"}`}
                    >
                      <motion.div
                        layout
                        className="w-5 h-5 rounded-full bg-white shadow-md"
                        animate={{ x: shannonEntropyFilter ? 24 : 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                        }}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions bar inside configurations */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/5 justify-end">
                <button
                  onClick={runBacktest}
                  disabled={isBacktesting}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isBacktesting ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" /> Audit
                      rétrograde...
                    </>
                  ) : (
                    <>
                      <History size={12} className="text-violet-400" />{" "}
                      Rétro-Audit Temporel
                    </>
                  )}
                </button>
                <button
                  onClick={runAnalysis}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center gap-2"
                >
                  <Zap size={12} /> Appliquer & Synchroniser
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Backtesting Results Dashboard */}
        <AnimatePresence>
          {backtestResults && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-slate-950/80 rounded-2xl p-5 border border-violet-500/10 space-y-5 pt-4"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-[10px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Diagnostic de l'Audit Temporel
                    (Time Machine)
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Rapport d'autopsie stochastique simulé sur les{" "}
                    <strong>{backtestResults.trials}</strong> derniers tirages
                    réels.
                  </p>
                </div>
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setBacktestResults(null);
                  }}
                  className="text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wider font-mono p-1"
                >
                  Effacer
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(backtestResults.scenariosStats).map(
                  ([id, stats]: any) => (
                    <div
                      key={id}
                      className="p-4 bg-slate-900 rounded-xl border border-white/5 space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[11px] font-black text-white uppercase truncate max-w-[130px]">
                          {stats.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          ≥2 bons :{" "}
                          <strong className="text-emerald-400">
                            {stats.ge2Rate}%
                          </strong>
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono text-slate-400">
                          <span>Hits moyens</span>
                          <span className="text-slate-300">
                            {stats.meanHits} / 5{" "}
                            <span className="text-slate-500">
                              (aléatoire {stats.expectedHits})
                            </span>
                          </span>
                        </div>
                        {/* Progress Hits Bar + repère du hasard pur */}
                        <div className="relative w-full bg-slate-850 h-1 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                            style={{ width: `${(stats.meanHits / 5) * 100}%` }}
                          />
                          <div
                            className="absolute top-0 h-full w-px bg-slate-400/70"
                            style={{
                              left: `${(stats.expectedHits / 5) * 100}%`,
                            }}
                            title={`Espérance sous tirage équitable : ${stats.expectedHits}`}
                          />
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 block">
                        Nombre total de hits :{" "}
                        <strong className="text-indigo-400">
                          {stats.totalHits}
                        </strong>
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 block">
                        Test équité (≥2 bons) :{" "}
                        {stats.pValue === null || stats.qValue === null ? (
                          <span className="text-slate-400">
                            n/d — échantillon insuffisant
                          </span>
                        ) : (
                          <>
                            p ={" "}
                            <strong className="text-slate-300">
                              {stats.pValue.toFixed(3)}
                            </strong>
                            {" · "}q (FDR) ={" "}
                            <strong
                              className={
                                stats.qValue <= NEUTRAL_FDR_TOLERANCE
                                  ? "text-emerald-400"
                                  : "text-slate-300"
                              }
                            >
                              {stats.qValue.toFixed(3)}
                            </strong>
                          </>
                        )}
                      </span>
                    </div>
                  ),
                )}
              </div>

              <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/15 space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    Plus grand nombre de hits observés sur la fenêtre :
                  </span>
                  <span className="font-black text-emerald-400 uppercase tracking-wider">
                    {backtestResults.bestScenario}
                  </span>
                </div>
                <p className="text-[9px] font-mono text-slate-500 leading-relaxed">
                  Référence tirage équitable (loi hypergéométrique exacte 5/90) :{" "}
                  {NULL_EXPECTED_HITS.toFixed(2)} hit(s) attendu(s) par tirage et{" "}
                  {(NULL_PROB_AT_LEAST_2 * 100).toFixed(2)}% de tirages à ≥2 bons
                  numéros.{" "}
                  {backtestVerdict === null || backtestVerdict.testedCount === 0 ? (
                    <>
                      Aucun test de significativité n'a pu être calculé sur cette
                      fenêtre : la conclusion reste indéterminée.
                    </>
                  ) : backtestVerdict.rejected.length === 0 ? (
                    <>
                      Test binomial exact unilatéral (n = {backtestResults.trials}) sur{" "}
                      {backtestVerdict.testedCount} scénario(s) puis correction FDR : la
                      plus petite q-value observée est {backtestVerdict.minQ?.toFixed(3)},
                      au-dessus de la tolérance dérivée du jeu (
                      {(NEUTRAL_FDR_TOLERANCE * 100).toFixed(2)}% = proportion neutre
                      5/90). Aucun scénario ne se distingue significativement du hasard
                      sur cette fenêtre.
                    </>
                  ) : (
                    <>
                      Test binomial exact unilatéral (n = {backtestResults.trials}) puis
                      correction FDR : {backtestVerdict.rejected.join(", ")} passe(nt)
                      sous la tolérance dérivée du jeu (
                      {(NEUTRAL_FDR_TOLERANCE * 100).toFixed(2)}% = 5/90). À confirmer sur
                      une fenêtre plus longue avant toute conclusion opérationnelle.
                    </>
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 4. RADAR GÉNOMIQUE & SCÉNARIOS STRATÉGIQUES PLATINUM */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="text-indigo-400" size={22} />
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                6 Scénarios Stratégiques Platinum &amp; Empreinte Spectrale
              </h3>
              <p className="text-xs text-slate-400">
                Superposition déterministe de l'ADN réel du tirage ({drawName}) et du profil spectrale de chaque scénario.
              </p>
            </div>
          </div>
        </div>

        <UnifiedDnaSieveRadar
          drawName={drawName}
          initialViewMode="RADAR"
          scenarios={result.scenarios}
          selectedScenarioId={selectedScenarioId}
          onSelectScenarioId={handleScenarioClick}
        />

        {/* SCENARIO SELECTOR */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {result.scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              isSelected={selectedScenarioId === scenario.id}
              onClick={() => handleScenarioClick(scenario.id)}
              onSave={() => handleSave(scenario)}
            />
          ))}
        </div>
      </div>

      {/* 4. DEEP INSPECTION (Conditional) */}
      <AnimatePresence>
        {selectedScenario && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              id={`scenario-xray-${selectedScenario.id}`}
              className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 md:p-10 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none relative"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Fingerprint className="text-slate-400" size={20} />
                  <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">
                    Rayon-X : {selectedScenario.name}
                  </h4>
                </div>
                <button
                  onClick={() => handleExportScenario(selectedScenario)}
                  data-html2canvas-ignore
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors"
                >
                  <Share2 size={14} /> Exporter
                </button>
              </div>

              <TicketXRay
                numbers={selectedScenario.numbers}
                score={selectedScenario.relativeIndex}
                showTitle={false}
              />

              <div className="mt-6 flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                <AlertCircle
                  size={16}
                  className="text-indigo-500 shrink-0 mt-0.5"
                />
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Ce scénario est optimisé pour un régime{" "}
                  <strong>{result.regime}</strong>. Indice de cohérence globale :{" "}
                  <strong>{result.coherence}</strong> / 100 (entropie inverse du
                  vecteur de consensus). Un tirage équitable reste équiprobable
                  quel que soit le scénario.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>)}
    </div>
  );
};
