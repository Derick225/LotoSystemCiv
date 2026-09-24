import React, { useState, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { Prediction } from "../../types";
import { NumberBall } from "../NumberBall";
import {
  BrainCircuit,
  Sparkles,
  Network,
  Atom,
  ShieldAlert,
  Cpu,
  Activity,
  Zap,
  Layers,
  GitMerge,
  TrendingUp,
  BarChart3,
  Flame,
  Info,
  CheckCircle2,
  Maximize2,
  Copy,
  ChevronRight,
  Radar,
  FileText,
  Sliders,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
} from "recharts";
import { useToast } from "../ui/Toast";
import { NeuralWeightsAuditDashboard } from "./NeuralWeightsAuditDashboard";
import { exportService } from "../../services/exportService";
import { evaluateAlgoEmpiricalProof } from "../../services/prediction/weightsManager";
import { audioEngine } from "../../utils/audioEngine";
import { ACTIVE_ALGO_COUNT } from "../../shared/prediction.types";


interface XAPTransparencyPanelProps {
  prediction: Prediction;
  drawName: string;
  gameRegimeInfo?: any;
  resolvedNoiseLevel?: number;
  resolvedLearningRate?: number;
}

type XAPTab = "number_breakdown" | "neural_weights" | "stochastic_factors" | "synergy_matrix";

const LABELS_FRIENDLY: Record<string, string> = {
  frequency: "Fréquence Classique",
  gaps: "Théorie des Écarts",
  markov: "Chaînes de Markov",
  spectral: "Analyse Spectrale FFT",
  quantum: "Interférence Quantique",
  hawkes: "Auto-Excitation Hawkes",
  spatial: "Topologie Spatiale",
  harmonic: "Résonance Harmonique",
  bayes: "Inférence Bayésienne",
  fractal: "Dimensions Fractales",
  entropy: "Entropie de Shannon",
  machine: "Transfert Machine",
  machineTransfer: "Transfert Machine",
  decisionTree: "Forêt de Décision",
  deepKernel: "Noyau RKHS Hilbert",
  darwinism: "Darwinisme Neural",
  neuralDarwinism: "Darwinisme Neural",
  temporal: "Mémoire Temporelle",
  stochastic: "Stochastique de Poisson",
};

export const XAPTransparencyPanel: React.FC<XAPTransparencyPanelProps> = ({
  prediction,
  drawName,
  gameRegimeInfo,
  resolvedNoiseLevel,
  resolvedLearningRate,
}) => {
  const { showToast } = useToast();
  const inspectingNumber = useNexusStore((state) => state.inspectingNumber);
  const setInspectingNumber = useNexusStore((state) => state.setInspectingNumber);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const history = useNexusStore((state) => state.history);

  const [activeTab, setActiveTab] = useState<XAPTab>("number_breakdown");
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isExportingForensicPDF, setIsExportingForensicPDF] = useState(false);

  // Le moteur forensic affiche « n/d » pour toute grandeur non mesurée : on ne lui transmet
  // donc que les valeurs réellement calculées en amont, jamais de constante de remplissage.
  const measuredEntropy = useMemo(() => {
    const fromContext = prediction.regimeContext?.entropy;
    if (typeof fromContext === "number") return fromContext;
    return typeof gameRegimeInfo?.entropy === "number" ? gameRegimeInfo.entropy : undefined;
  }, [prediction.regimeContext, gameRegimeInfo]);

  const measuredRegime = useMemo(() => {
    if (!gameRegimeInfo) return undefined;
    const info: {
      regime?: string;
      hurst?: number;
      chaosDimension?: number;
      weylDiscrepancy?: number;
      entropy?: number;
      volatility?: number;
    } = {};
    if (typeof gameRegimeInfo.regime === "string" && gameRegimeInfo.regime.length > 0) {
      info.regime = gameRegimeInfo.regime;
    }
    if (typeof gameRegimeInfo.hurst === "number") info.hurst = gameRegimeInfo.hurst;
    if (typeof gameRegimeInfo.chaosDimension === "number") info.chaosDimension = gameRegimeInfo.chaosDimension;
    if (typeof gameRegimeInfo.weylDiscrepancy === "number") info.weylDiscrepancy = gameRegimeInfo.weylDiscrepancy;
    if (typeof gameRegimeInfo.entropy === "number") info.entropy = gameRegimeInfo.entropy;
    if (typeof gameRegimeInfo.volatility === "number") info.volatility = gameRegimeInfo.volatility;
    return Object.keys(info).length > 0 ? info : undefined;
  }, [gameRegimeInfo]);

  const handleExportForensicReport = async () => {
    audioEngine.play("click");
    setIsExportingForensicPDF(true);
    try {
      const isolatedHistory = history.filter(
        (d) => !d.drawName || d.drawName.trim().toLowerCase() === drawName.trim().toLowerCase()
      );
      const sample = isolatedHistory.length > 0 ? isolatedHistory : history;
      const hasMachineData = sample.some((d) => Array.isArray(d.machine) && d.machine.length > 0);

      const proofs = evaluateAlgoEmpiricalProof(drawName, history);

      await exportService.generateForensicStochasticReportPDF({
        drawName,
        suggestedNumbers: prediction.suggestedNumbers,
        candidates: prediction.candidates,
        confidence: prediction.confidence,
        stabilityScore: prediction.stabilityScore,
        realityAlignment: prediction.realityAlignment,
        currentEntropy: measuredEntropy,
        gameRegimeInfo: measuredRegime,
        resolvedNoiseLevel,
        resolvedLearningRate,
        appliedWeights: ((prediction as any).aiWeights || (prediction as any).weights || globalWeights) as Record<string, number>,
        empiricalProofs: proofs as any,

        breakdown: prediction.breakdown as any,
        analysis: prediction.analysis,
        hasMachineData,
      });

      showToast("Rapport Forensic exporté avec succès (PDF).", "success");
    } catch (error) {
      console.error("Forensic PDF export error:", error);
      showToast("Erreur lors de la génération du rapport forensic.", "error");
    } finally {
      setIsExportingForensicPDF(false);
    }
  };


  // Selected number for detailed inspection (default to first suggested number)
  const [selectedNum, setSelectedNum] = useState<number>(
    prediction.suggestedNumbers[0] || 1
  );

  // Sync with inspectingNumber from global store if present in candidates/suggested
  React.useEffect(() => {
    if (inspectingNumber) {
      setSelectedNum(inspectingNumber);
    }
  }, [inspectingNumber]);

  const allRelevantNumbers = useMemo(() => {
    const main = prediction.suggestedNumbers || [];
    const candidates = (prediction.candidates || []).slice(0, 5);
    const combined = Array.from(new Set([...main, ...candidates]));
    return combined;
  }, [prediction.suggestedNumbers, prediction.candidates]);

  // XAP d'un numéro : donnée réelle si le moteur en a produit une, sinon synthèse déterministe
  // construite à partir du breakdown / des valeurs de Shapley du même tirage (aucune constante inventée).
  const buildXAPFor = useCallback((num: number) => {
    const xapList = prediction.xapExp || [];
    const found = xapList.find((x) => x.number === num);
    if (found) return found;

    const breakdown = prediction.breakdown?.[num] || {};
    const explainExtra = prediction.explainabilityData?.[num] || {};
    const shapValues = explainExtra.shapValues || breakdown;

    const entries = Object.entries(shapValues);
    let maxVal = -Infinity;
    let dominantKey = "spectral";
    let total = 0;
    entries.forEach(([k, v]) => {
      const numVal = Math.max(0, Number(v) || 0);
      total += numVal;
      if (numVal > maxVal) {
        maxVal = numVal;
        dominantKey = k;
      }
    });

    const shapleyPct: Record<string, number> = {};
    entries.forEach(([k, v]) => {
      const numVal = Math.max(0, Number(v) || 0);
      shapleyPct[k] = total > 0 ? (numVal / total) * 100 : 0;
    });

    // Entropie et Gini de composition : mesurés sur la distribution de Shapley réellement
    // calculée ci-dessus (mêmes formules que DNAOptimizer), jamais des constantes de repli.
    let compositionEntropy = 0;
    let compositionGini = 0;
    const uniformShare = entries.length > 0 ? 1.0 / entries.length : 0;
    if (total > 0) {
      let entropySum = 0;
      let diffSum = 0;
      entries.forEach(([, vi]) => {
        const valI = Math.max(0, Number(vi) || 0);
        const p = valI / total;
        if (p > Number.EPSILON) entropySum -= p * Math.log2(p);
        entries.forEach(([, vj]) => {
          diffSum += Math.abs(valI - Math.max(0, Number(vj) || 0));
        });
      });
      const maxEnt = Math.log2(entries.length || 1) || 1.0;
      compositionEntropy = entropySum / maxEnt;
      compositionGini = diffSum / (2.0 * entries.length * total);
    }

    return {
      number: num,
      // Aucun canal mesuré : on n'attribue pas de dominant par défaut.
      dominantAlgo: entries.length > 0 ? (dominantKey as any) : null,
      contributionPercentage: total > 0 ? (maxVal / total) * 100 : 0,
      dnaVector: shapValues as any,
      compositionEntropy,
      compositionGini,
      // Contributeurs en synergie : contribution strictement supérieure à la part uniforme 1/n
      synergyAlgos: entries
        .filter(([, v]) => Math.max(0, Number(v) || 0) / Math.max(Number.EPSILON, total) > uniformShare)
        .map(([k]) => k as any),
      shapleyValues: shapleyPct as any,
    };
  }, [prediction]);

  // Current Number XAP Data
  const currentNumberXAP = useMemo(() => buildXAPFor(selectedNum), [buildXAPFor, selectedNum]);

  // Extra explainability metadata
  const currentExplainData = useMemo(() => {
    return prediction.explainabilityData?.[selectedNum] || null;
  }, [prediction.explainabilityData, selectedNum]);

  // Shapley Bar Chart Data for selected number
  const shapleyChartData = useMemo(() => {
    const rawShapley = currentNumberXAP?.shapleyValues;
    const shapleyValues: Record<string, number> =
      rawShapley && Object.keys(rawShapley).length > 0
        ? rawShapley
        : (() => {
            const breakdown = prediction.breakdown?.[selectedNum] || {};
            const total = Object.values(breakdown).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
            return Object.fromEntries(
              Object.entries(breakdown).map(([algo, val]) => [
                algo,
                Math.max(0, ((Number(val) || 0) / total) * 100),
              ]),
            );
          })();

    return Object.entries(shapleyValues)
      .map(([algo, val]) => ({
        algo: LABELS_FRIENDLY[algo] || algo,
        key: algo,
        val: Math.max(0, Number(val) || 0),
      }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 7);
  }, [currentNumberXAP, prediction.breakdown, selectedNum]);

  // Neural Weights Ranking & Distribution
  const neuralWeightsData = useMemo(() => {
    const sourceWeights = prediction.aiWeights || globalWeights || {};
    // Masse totale réelle : la part affichée est weight / Σweight, exacte quelle que soit l'échelle
    // des poids reçus (L1 normalisée ou non), sans supposer une somme unitaire.
    const totalMass =
      Object.values(sourceWeights).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0) || 1.0;

    const entries = Object.entries(sourceWeights).map(([k, v]) => {
      const w = Math.max(0, Number(v) || 0);
      return {
        key: k,
        label: LABELS_FRIENDLY[k] || k,
        weight: w,
        percentage: (w / totalMass) * 100,
      };
    });

    entries.sort((a, b) => b.weight - a.weight);

    // Calculate weight entropy
    let entropySum = 0;
    entries.forEach((e) => {
      const p = e.weight / totalMass;
      if (p > Number.EPSILON) {
        entropySum -= p * Math.log2(p);
      }
    });
    const maxEnt = Math.log2(entries.length || 1) || 1.0;
    const normalizedEntropy = maxEnt > 0 ? entropySum / maxEnt : 1.0;

    return {
      entries,
      normalizedEntropy,
      // Canal réellement alimenté : masse de poids strictement positive après normalisation L1
      // (les canaux retirés sont forcés à 0 par normalizeWeights, aucun seuil arbitraire n'est requis).
      activeModelsCount: entries.filter((e) => e.weight > 0).length,
    };
  }, [prediction.aiWeights, globalWeights]);

  // Stochastic Factors Decomposition
  // Aucune constante de remplissage : une grandeur non mesurée est exposée à null et rendue « n/d ».
  const stochasticFactors = useMemo(() => {
    const H = typeof gameRegimeInfo?.hurst === "number" ? gameRegimeInfo.hurst : null;
    const weylDiscrepancy =
      typeof gameRegimeInfo?.weylDiscrepancy === "number" ? gameRegimeInfo.weylDiscrepancy : null;
    const histEntropy = typeof gameRegimeInfo?.entropy === "number" ? gameRegimeInfo.entropy : null;
    const sigma = typeof resolvedNoiseLevel === "number" ? resolvedNoiseLevel : null;

    // Marge d'échantillonnage de la marche aléatoire : 1/sqrt(N), convention identique à detectGameRegime.
    const sampleN = Math.max(1, Math.min(history.length, 200));
    const uncertaintyMargin = 1.0 / Math.sqrt(sampleN);

    // Plafond de recuit σ_max = 3.0, imposé par le clamps de usePredictionGenerator.
    const SIGMA_MAX = 3.0;

    const gWeights = (globalWeights || {}) as Record<string, number>;
    const totalWeightsSum = Object.values(gWeights).reduce((a, b) => a + b, 0);

    const shareOfMass = (raw: number) =>
      totalWeightsSum > 0 ? (raw / totalWeightsSum) * 100 : null;
    const rawHawkes = gWeights["hawkes"] ?? gWeights["temporal"] ?? 0;
    const rawMachine = gWeights["machine_transfer"] ?? gWeights["machineTransfer"] ?? gWeights["machine"] ?? 0;
    const hawkesShare = shareOfMass(rawHawkes);
    const machineShare = shareOfMass(rawMachine);

    const hurstDeviation = H === null ? null : Math.abs(H - 0.5);

    return [
      {
        id: "hurst",
        name: "Mémoire Temporelle de Hurst (H)",
        value: H === null ? null : H.toFixed(4),
        forcePct: hurstDeviation === null ? null : Math.min(100, Math.round(hurstDeviation * 200)),
        status:
          hurstDeviation === null
            ? "Exposant de Hurst non mesuré sur cet historique"
            : hurstDeviation <= uncertaintyMargin
              ? `Compatible avec la marche aléatoire : |H − 0.5| = ${hurstDeviation.toFixed(4)} ≤ marge 1/√N = ${uncertaintyMargin.toFixed(4)}`
              : H !== null && H > 0.5
                ? `Persistance longue mémoire : |H − 0.5| = ${hurstDeviation.toFixed(4)} > marge 1/√N = ${uncertaintyMargin.toFixed(4)}`
                : `Réversion à la moyenne : |H − 0.5| = ${hurstDeviation.toFixed(4)} > marge 1/√N = ${uncertaintyMargin.toFixed(4)}`,
        description: "Quantifie l'autocorrélation asymptotique des séries d'écarts temporels.",
        color: "text-indigo-400",
        barColor: "bg-indigo-500",
      },
      {
        id: "thermal",
        name: "Bruit Thermique de Recuit (σ)",
        value: sigma === null ? null : `${sigma.toFixed(3)} V`,
        forcePct: sigma === null ? null : Math.min(100, Math.round((sigma / SIGMA_MAX) * 100)),
        status:
          sigma === null
            ? "Niveau de bruit non résolu par le générateur"
            : `Température de recuit : ${((sigma / SIGMA_MAX) * 100).toFixed(1)}% du plafond σ_max = ${SIGMA_MAX.toFixed(1)}`,
        description: "Contrôle la relaxation d'entropie pour éviter les minima locaux dans l'espace des solutions.",
        color: "text-amber-400",
        barColor: "bg-amber-500",
      },
      {
        id: "hawkes",
        name: "Intensité Auto-Excitatrice (Hawkes)",
        value: hawkesShare === null ? null : `${hawkesShare.toFixed(1)}%`,
        forcePct: hawkesShare === null ? null : Math.min(100, Math.round(hawkesShare)),
        status:
          hawkesShare === null
            ? "Masse de poids totale nulle : part indéterminée"
            : rawHawkes <= 0
              ? "Canal Hawkes non alimenté (masse de poids nulle)"
              : `Masse de poids auto-excitatrice : ${hawkesShare.toFixed(1)}% du total normalisé des ${ACTIVE_ALGO_COUNT} algorithmes actifs`,
        description: "Modélise les grappes (clusters) d'apparition via un noyau de Poisson à mémoire exponentielle.",
        color: "text-rose-400",
        barColor: "bg-rose-500",
      },
      {
        id: "machine",
        name: "Transfert Machine ➔ Gagnants",
        value: machineShare === null ? null : `${machineShare.toFixed(1)}%`,
        forcePct: machineShare === null ? null : Math.min(100, Math.round(machineShare)),
        status:
          machineShare === null
            ? "Masse de poids totale nulle : part indéterminée"
            : rawMachine <= 0
              ? "Canal machine non alimenté sur ce tirage"
              : `Flux cinématique actif : ${machineShare.toFixed(1)}% du total normalisé des poids`,
        description: "Amplification cinématique continue par transformation tanh du vecteur machine.",
        color: "text-emerald-400",
        barColor: "bg-emerald-500",
      },
      {
        id: "weyl",
        name: "Régularité de Weyl (Uniformité)",
        value: weylDiscrepancy === null ? null : `D = ${weylDiscrepancy.toFixed(4)}`,
        forcePct: weylDiscrepancy === null ? null : Math.min(100, Math.round(Math.max(0, 1 - weylDiscrepancy) * 100)),
        status:
          weylDiscrepancy === null
            ? "Discrépance non mesurée sur cet historique"
            : `Équirépartition ${(Math.max(0, 1 - weylDiscrepancy) * 100).toFixed(1)}% (discrépance D = ${weylDiscrepancy.toFixed(4)})`,
        description: "Mesure la discrépance géométrique pour assurer la complétude spatiale de la sélection.",
        color: "text-cyan-400",
        barColor: "bg-cyan-500",
      },
      {
        id: "entropy",
        name: "Dispersion Entropique (Shannon)",
        value: histEntropy === null ? null : `H = ${histEntropy.toFixed(4)}`,
        forcePct: histEntropy === null ? null : Math.min(100, Math.round(histEntropy * 100)),
        status:
          histEntropy === null
            ? "Entropie normalisée non mesurée sur cet historique"
            : `Dispersion informationnelle : ${(histEntropy * 100).toFixed(1)}% de l'entropie normalisée maximale`,
        description: "Mesure continue du désordre probabiliste et de l'étalement du paysage d'inférence.",
        color: "text-purple-400",
        barColor: "bg-purple-500",
      },
    ];
  }, [gameRegimeInfo, resolvedNoiseLevel, globalWeights, history]);

  // Physics Archetype Tag Details
  const archetypeInfo = useMemo(() => {
    const arch = currentExplainData?.physicsArchetype as string | undefined;
    if (!arch) {
      return {
        title: "Archétype Non Classé",
        badge: "Aucun archétype émis par le moteur",
        color: "bg-slate-500/10 text-slate-400 border-slate-500/30",
        icon: <Atom size={14} className="text-slate-400" />,
        desc: "Le moteur n'a attribué aucun archétype physique à ce numéro pour ce tirage ; aucune catégorie n'est inventée ici.",
      };
    }
    switch (arch) {
      case "Cycle Harmonique":
        return {
          title: "Cycle Harmonique",
          badge: "Ondes Stationnaires & FFT",
          color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
          icon: <Activity size={14} className="text-cyan-400" />,
          desc: "Alimenté par des périodicités fréquentielles strictes et une cohérence spectrale de Fourier.",
        };
      case "Persistance Fractale":
        return {
          title: "Persistance Fractale",
          badge: "Auto-Similarité & Hurst",
          color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
          icon: <Layers size={14} className="text-purple-400" />,
          desc: "Caractérisé par un exposant de Hurst supérieur à la référence de marche aléatoire (H = 0.50), signant une mémoire longue des écarts.",
        };
      case "Transfert Machine":
        return {
          title: "Transfert Machine",
          badge: "Couplage Cinématique",
          color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
          icon: <Zap size={14} className="text-emerald-400" />,
          desc: "Propulsé par la cinématique de transition stochastique entre les boules machines et le tirage gagnant.",
        };
      case "Attracteur Chaotique":
        return {
          title: "Attracteur Chaotique",
          badge: "Bifurcation Non-Linéaire",
          color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
          icon: <Flame size={14} className="text-amber-400" />,
          desc: "Positionné sur un attracteur étrange dans l'espace des phases à dynamique non-linéaire.",
        };
      default:
        return {
          title: arch,
          badge: "Archétype Enregistré",
          color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
          icon: <Atom size={14} className="text-indigo-400" />,
          desc: "Archétype physique renvoyé tel quel par le moteur d'inférence pour ce numéro.",
        };
    }
  }, [currentExplainData]);

  // Copy XAP summary to clipboard
  const handleCopyXAP = () => {
    const summary = `--- RAPPORT TRANSPARENCE XAP (${drawName}) ---
Numéro Analysé: ${selectedNum}
Archétype Physique: ${archetypeInfo.title} (${archetypeInfo.badge})
Top Drivers (Valeurs Shapley):
${shapleyChartData.map((d) => `  • ${d.algo}: ${d.val.toFixed(1)}%`).join("\n")}
Tension Topologique: ${typeof currentExplainData?.topologicalTension === "number" ? currentExplainData.topologicalTension.toFixed(2) : "n/d"}
Indice d'Orbitale ADN: ${typeof currentExplainData?.dnaOrbitingIndex === "number" ? currentExplainData.dnaOrbitingIndex.toFixed(4) : "n/d"}
Explication Narrative: ${currentExplainData?.narrativeInterpretation || "n/d"}
---------------------------------------------`;

    navigator.clipboard.writeText(summary);
    showToast("Rapport XAP copié dans le presse-papier.", "success");
  };

  return (
    <div className="bg-slate-900/95 rounded-3xl p-5 sm:p-8 border border-indigo-500/20 shadow-2xl backdrop-blur-xl text-white relative overflow-hidden">
      {/* Glow background accent */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-800 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <BrainCircuit size={18} />
            </div>
            <h3 className="text-sm sm:text-base font-black tracking-wide uppercase text-white flex items-center gap-2">
              Panneau XAP Transparency
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
              eXplainable Attribution Prediction
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Décomposition analytique continue des poids neuronaux, valeurs de Shapley et dynamiques stochastiques.
          </p>
        </div>

        {/* Global Controls & Metrics */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono">
            <span className="text-slate-500">Robustesse:</span>
            <span className="text-emerald-400 font-bold">
              {typeof prediction.stabilityScore === "number" ? `${prediction.stabilityScore}%` : "n/d"}
            </span>
          </div>

          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700"
            title="Inspecter et modifier manuellement les poids de chaque couche neuronale"
          >
            <Sliders size={13} className="text-indigo-400" />
            <span>Audit Poids</span>
          </button>

          <button
            onClick={handleExportForensicReport}
            disabled={isExportingForensicPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-300 text-xs font-semibold transition-colors border border-indigo-700/60 disabled:opacity-50"
            title="Exporter en PDF le rapport forensic stochastique complet"
          >
            <FileText size={13} className="text-indigo-400" />
            <span>{isExportingForensicPDF ? "Export..." : "Rapport Forensic"}</span>
          </button>

          <button
            onClick={handleCopyXAP}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors border border-slate-700"
            title="Copier le rapport d'explicabilité XAP"
          >
            <Copy size={12} />
            <span className="hidden sm:inline">Copier XAP</span>
          </button>
        </div>
      </div>


      {/* Interactive Tabs */}
      <div className="flex flex-wrap gap-2 pt-5 pb-6 border-b border-slate-800/80 relative z-10">
        <button
          onClick={() => setActiveTab("number_breakdown")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "number_breakdown"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Sparkles size={14} />
          <span>Attribution par Numéro (SHAP)</span>
        </button>

        <button
          onClick={() => setActiveTab("neural_weights")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "neural_weights"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Network size={14} />
          <span>Poids Neuronaux & Modèles ({neuralWeightsData.activeModelsCount})</span>
        </button>

        <button
          onClick={() => setActiveTab("stochastic_factors")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "stochastic_factors"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Flame size={14} />
          <span>Facteurs Stochastiques & Régime</span>
        </button>

        <button
          onClick={() => setActiveTab("synergy_matrix")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "synergy_matrix"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <GitMerge size={14} />
          <span>Matrice de Synergie</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="pt-6 relative z-10">
        {/* TAB 1: ATTRIBUTION PAR NUMÉRO */}
        {activeTab === "number_breakdown" && (
          <div className="space-y-6 animate-fade-in">
            {/* Number Selector Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="uppercase tracking-wider font-bold text-slate-400">
                  Sélectionner un numéro à inspecter :
                </span>
                <span className="text-indigo-400 font-bold">
                  Numéro Actif: {selectedNum}
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5 items-center bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-500 px-1">
                  Vecteur:
                </span>
                {prediction.suggestedNumbers.map((num) => {
                  const isSelected = num === selectedNum;
                  return (
                    <button
                      key={num}
                      onClick={() => {
                        setSelectedNum(num);
                        setInspectingNumber(num);
                      }}
                      className={`relative transition-all transform ${
                        isSelected
                          ? "scale-110 ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900 rounded-full"
                          : "opacity-80 hover:opacity-100 hover:scale-105"
                      }`}
                    >
                      <NumberBall number={num} size="md" />
                    </button>
                  );
                })}

                {prediction.candidates?.length > 0 && (
                  <>
                    <div className="w-px h-6 bg-slate-800 mx-1" />
                    <span className="text-[10px] uppercase font-bold text-slate-500 px-1">
                      Orbitales:
                    </span>
                    {prediction.candidates.slice(0, 5).map((num) => {
                      const isSelected = num === selectedNum;
                      return (
                        <button
                          key={num}
                          onClick={() => {
                            setSelectedNum(num);
                            setInspectingNumber(num);
                          }}
                          className={`relative transition-all transform ${
                            isSelected
                              ? "scale-110 ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-900 rounded-full"
                              : "opacity-60 hover:opacity-100 hover:scale-105"
                          }`}
                        >
                          <NumberBall number={num} size="sm" />
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            {/* Selected Number Deep Dive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Waterfall Shapley Bar Chart */}
              <div className="lg:col-span-7 bg-slate-950/80 rounded-2xl p-5 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <BarChart3 size={14} className="text-indigo-400" />
                    Valeurs de Shapley (Attribution Marginale Exacte)
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400">
                    Théorie des Jeux non-linéaire
                  </span>
                </div>

                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={shapleyChartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                    >
                      <XAxis
                        type="number"
                        domain={[0, "dataMax + 5"]}
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        unit="%"
                      />
                      <YAxis
                        dataKey="algo"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        width={130}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                                <div className="font-bold text-indigo-300">
                                  {data.algo}
                                </div>
                                <div className="text-slate-300 font-mono">
                                  Contribution: {data.val.toFixed(2)}%
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="val" radius={[0, 6, 6, 0]}>
                        {shapleyChartData.map((_entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              index === 0
                                ? "#6366f1"
                                : index === 1
                                ? "#818cf8"
                                : index === 2
                                ? "#a5b4fc"
                                : "#475569"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-[10px] text-slate-400 italic">
                  * La valeur de Shapley mesure le gain marginal d'information apporté par chaque algorithme lors de la sélection du numéro {selectedNum}.
                </p>
              </div>

              {/* Right Column: Physical Archetype & Metrics Cards */}
              <div className="lg:col-span-5 space-y-4">
                {/* Physical Archetype Banner */}
                <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Archétype Physique
                    </span>
                    <span
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${archetypeInfo.color}`}
                    >
                      {archetypeInfo.icon}
                      {archetypeInfo.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {archetypeInfo.desc}
                  </p>
                </div>

                {/* Micro-Metrics (Tension Topologique & Entropie) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      <ShieldAlert size={12} className="text-indigo-400" />
                      Tension Topologique
                    </div>
                    <div className="text-2xl font-black font-mono text-indigo-400">
                      {typeof currentExplainData?.topologicalTension === "number"
                        ? currentExplainData.topologicalTension.toFixed(2)
                        : "n/d"}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      Résistance aux micro-perturbations
                    </div>
                  </div>

                  <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      <Atom size={12} className="text-emerald-400" />
                      Résonance ADN
                    </div>
                    <div className="text-2xl font-black font-mono text-emerald-400">
                      {typeof currentExplainData?.dnaOrbitingIndex === "number"
                        ? currentExplainData.dnaOrbitingIndex.toFixed(4)
                        : "n/d"}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      Alignement spectral continu
                    </div>
                  </div>
                </div>

                {/* Deterministic Narrative Context */}
                <div className="bg-indigo-950/30 rounded-2xl p-4 border border-indigo-500/20 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Sparkles size={12} />
                    Synthèse Analytique Déterministe
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {currentExplainData?.narrativeInterpretation ||
                      `Aucune interprétation narrative émise par le moteur pour le numéro ${selectedNum}. Canal dominant mesuré sur ce tirage : ${
                        shapleyChartData[0]?.algo || "aucun"
                      }${shapleyChartData[0] ? ` (${shapleyChartData[0].val.toFixed(1)}% des valeurs de Shapley)` : ""}.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: POIDS NEURONAUX & MODÈLES */}
        {activeTab === "neural_weights" && (
          <div className="space-y-6 animate-fade-in">
            {/* Top Stat Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Modèles Actifs / {ACTIVE_ALGO_COUNT}
                </span>
                <div className="text-2xl font-black font-mono text-indigo-400">
                  {neuralWeightsData.activeModelsCount} / {ACTIVE_ALGO_COUNT}
                </div>
                <p className="text-[10px] text-slate-400">
                  Sous-systèmes participant activement
                </p>
              </div>

              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Entropie des Poids H(W)
                </span>
                <div className="text-2xl font-black font-mono text-emerald-400">
                  {neuralWeightsData.normalizedEntropy.toFixed(4)}
                </div>
                <p className="text-[10px] text-slate-400">
                  Dispersion {((neuralWeightsData.normalizedEntropy) * 100).toFixed(1)}% ·
                  concentration {((1 - neuralWeightsData.normalizedEntropy) * 100).toFixed(1)}%
                  (0% = masse concentrée sur un seul canal)
                </p>
              </div>

              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Taux d'Apprentissage (η)
                </span>
                <div className="text-2xl font-black font-mono text-amber-400">
                  {typeof resolvedLearningRate === "number" ? resolvedLearningRate.toFixed(4) : "n/d"}
                </div>
                <p className="text-[10px] text-slate-400">
                  Gradient Micro-SGD régularisé
                </p>
              </div>
            </div>

            {/* Weights Bars Grid */}
            <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800/80 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Network size={14} className="text-indigo-400" />
                Distribution Complète des {neuralWeightsData.entries.length} Poids Algorithmiques
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 pt-2">
                {neuralWeightsData.entries.map((item, idx) => {
                  const isTop3 = idx < 3;
                  return (
                    <div key={item.key} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className={`font-semibold flex items-center gap-1.5 ${isTop3 ? "text-indigo-300 font-bold" : "text-slate-400"}`}>
                          <span className="font-mono text-[10px] text-slate-500">
                            #{idx + 1}
                          </span>
                          {item.label}
                        </span>
                        <span className="font-mono font-bold text-slate-200">
                          {item.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-850 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isTop3
                              ? "bg-gradient-to-r from-indigo-500 to-purple-500"
                              : "bg-slate-600"
                          }`}
                          style={{ width: `${Math.max(2, item.percentage)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Auditer et recalibrer :</span> Modifiez manuellement les poids de chaque couche, inspectez les écarts types et validez la performance empirique.
                </div>
                <button
                  onClick={() => setIsAuditModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-md shadow-indigo-600/20 shrink-0 w-full sm:w-auto justify-center"
                >
                  <Sliders size={14} />
                  <span>Auditer les Poids Neuronaux</span>
                </button>
              </div>
            </div>
          </div>
        )}


        {/* TAB 3: FACTEURS STOCHASTIQUES & PHYSIQUES */}
        {activeTab === "stochastic_factors" && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stochasticFactors.map((factor) => (
                <div
                  key={factor.id}
                  className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800/80 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-300">
                        {factor.name}
                      </span>
                      <span
                        className={`text-xs font-black font-mono ${
                          factor.value === null ? "text-slate-500" : factor.color
                        }`}
                      >
                        {factor.value ?? "n/d"}
                      </span>
                    </div>
                    <div className="inline-block px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                      {factor.status}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {factor.description}
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-900">
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Force d'Impact:</span>
                      <span className="text-slate-300 font-bold">
                        {factor.forcePct === null ? "n/d" : `${factor.forcePct}%`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-850 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          factor.forcePct === null ? "bg-slate-700" : factor.barColor
                        }`}
                        style={{ width: `${factor.forcePct ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 flex items-start gap-3 text-xs text-slate-400">
              <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-200">Gouvernance Stochastique Déterministe (AGENTS.md) :</strong>{" "}
                Toutes les dynamiques stochastiques ci-dessus sont simulées à travers des processus markoviens et des LCGs seedés déterministes. Aucun nombre aléatoire non reproductible n'est injecté dans l'Oracle.
              </span>
            </div>
          </div>
        )}

        {/* TAB 4: MATRICE DE SYNERGIE */}
        {activeTab === "synergy_matrix" && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <GitMerge size={14} className="text-indigo-400" />
                  Synergie Multi-Algorithmique du Vecteur
                </h4>
                <span className="text-[10px] font-mono text-slate-400">
                  Co-occurrences des Signaux
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                {prediction.suggestedNumbers.map((num) => {
                  const xap = buildXAPFor(num);
                  const synAlgos = xap?.synergyAlgos ?? [];

                  return (
                    <div
                      key={num}
                      className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <NumberBall number={num} size="sm" />
                        <div>
                          <div className="text-xs font-black text-white">
                            Numéro {num}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Dominant:{" "}
                            <span className="text-indigo-400 font-bold capitalize">
                              {xap?.dominantAlgo
                                ? LABELS_FRIENDLY[xap.dominantAlgo] || xap.dominantAlgo
                                : "n/d"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1 pt-1 border-t border-slate-800/80">
                        <span className="text-[9px] uppercase font-bold text-slate-500 block">
                          Modèles en Co-Synergie :
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {synAlgos.length === 0 ? (
                            <span className="text-[9px] font-mono text-slate-500 italic">
                              Aucun canal au-dessus de la part uniforme 1/n
                            </span>
                          ) : (
                            synAlgos.map((algo) => (
                              <span
                                key={algo}
                                className="px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-500/20 text-[9px] font-mono text-indigo-300"
                              >
                                {LABELS_FRIENDLY[algo] || algo}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Dashboard d'Audit des Poids Neuronaux */}
      <AnimatePresence>
        {isAuditModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-5xl my-auto"
            >
              <NeuralWeightsAuditDashboard
                isModal={true}
                onClose={() => setIsAuditModalOpen(false)}
                onApplySuccess={() => {
                  setIsAuditModalOpen(false);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


export default XAPTransparencyPanel;
