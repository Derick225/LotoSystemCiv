import React, { useState, useMemo } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  Target,
  Activity,
  Layers,
  Sparkles,
  BarChart2,
  Cpu,
  ChevronRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { ForensicReport, AlgoKey } from "../types";
import { computeIntegratedGradients } from "../services/training/multiHeadNeuralCore";
import { audioEngine } from "../utils/audioEngine";
import { useNexusStore } from "../store/useNexusStore";

const ALGO_NAMES: Record<string, string> = {
  frequency: "Fréquence d'apparition",
  gap: "Efficacité des Écarts (Gap)",
  spectral: "Analyse Spectrale",
  markov: "Chaînes de Markov (Ordre 2)",
  bayes: "Calibration Bayésienne",
  momentum: "Force d'inertie (Momentum)",
  affinity: "Matrice d'Affinité",
  spatial: "Coordonnées Spatiales",
  temporal: "Spatio-temporel Hawkes",
  fractal: "Fractale Hurst",
  shadow: "Probabilité d'Ombre (Shadow)",
  network: "Corrélation Réseau",
  echo_state: "Réseau Echo State (ESN)",
  gap_sequence: "Séquence d'Écarts",
  derived_neighbor: "Voisin Dérivé",
  gap_pattern: "Motif d'Écart",
  sequence_pattern: "Séquence Motif",
  gap_cadence: "Cadence d'Écarts",
  gap_trend: "Tendance d'Écarts",
  inter_monthly_resonance: "Résonance Inter-Mensuelle",
  isolation_anomaly: "Anomalie d'Isolation",
  gap_band_sequence: "Séquence de Bande d'Écarts",
};

interface UnifiedForensicRadarPanelProps {
  report: ForensicReport | null;
  drawName: string;
  className?: string;
}

export const UnifiedForensicRadarPanel: React.FC<
  UnifiedForensicRadarPanelProps
> = ({ report, drawName, className = "" }) => {
  const [level, setLevel] = useState<"macro" | "micro">("macro");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

  const globalWeights = useNexusStore((state) => state.globalWeights);
  const lastPrediction = useNexusStore((state) => state.lastPrediction);

  // Vue Macro Metrics (4 Axes: Précision, Dérive spectrale, Entropie, Synergie)
  const macroRadarData = useMemo(() => {
    if (!report) {
      return [
        { subject: "Précision", value: 65, target: 80 },
        { subject: "Dérive spectrale", value: 72, target: 85 },
        { subject: "Entropie", value: 80, target: 90 },
        { subject: "Synergie", value: 78, target: 88 },
      ];
    }

    // 1. Précision
    const hitsCount = Array.isArray(report.matches)
      ? report.matches.filter((m) => m.errorType === "Hit").length
      : 0;
    const precisionScore = Math.min(100, Math.max(10, (hitsCount / 5) * 100));

    // 2. Dérive spectrale (100 - KL divergence % or topological loss)
    const klDiv = report.kl_divergence ?? 0.05;
    const spectralScore = Math.min(100, Math.max(10, 100 - klDiv * 400));

    // 3. Entropie (Shannon Entropy relative to max ~4.49)
    const entropyRaw = report.shannon_entropy ?? 4.25;
    const entropyScore = Math.min(
      100,
      Math.max(10, (entropyRaw / 4.492) * 100),
    );

    // 4. Synergie (Unified Integrity Index or Co-occurrence synergy)
    const synergyScore = Math.min(
      100,
      Math.max(10, report.unifiedIntegrityIndex ?? 75),
    );

    return [
      { subject: "Précision", value: Math.round(precisionScore), target: 85 },
      {
        subject: "Dérive spectrale",
        value: Math.round(spectralScore),
        target: 80,
      },
      { subject: "Entropie", value: Math.round(entropyScore), target: 90 },
      { subject: "Synergie", value: Math.round(synergyScore), target: 85 },
    ];
  }, [report]);

  // Numbers available for Micro Attribution Inspection
  const inspectableNumbers = useMemo(() => {
    const nums: number[] = [];
    if (!report) return [5, 12, 23, 45, 89];

    if (Array.isArray(report.matches)) {
      report.matches.forEach((m) => {
        if (m.predicted && !nums.includes(m.predicted)) nums.push(m.predicted);
      });
    }
    if (Array.isArray(report.combo)) {
      report.combo.forEach((n) => {
        if (n && !nums.includes(n)) nums.push(n);
      });
    }

    return nums.sort((a, b) => a - b).slice(0, 10);
  }, [report]);

  // Default selected number
  const activeNumber = selectedNumber ?? inspectableNumbers[0] ?? 1;

  // Vue Micro Attribution via Integrated Gradients
  const microAttributionData = useMemo(() => {
    // 1. Try post-mortem real winning XAP from report
    const matchingXAP = report?.winningXAP?.find((x) => x.number === activeNumber);
    if (matchingXAP && matchingXAP.dnaVector) {
      const barData = Object.entries(matchingXAP.dnaVector).map(([k, attr]) => {
        const name = ALGO_NAMES[k] || k;
        return {
          algoKey: k,
          name,
          attributionPercent: Math.round(attr * 100),
        };
      });
      barData.sort((a, b) => b.attributionPercent - a.attributionPercent);
      const topDriver = barData[0]?.algoKey || "frequency";
      const topDriverName = ALGO_NAMES[topDriver] || topDriver;
      return {
        barData,
        topDriver,
        topDriverName,
        isReal: true,
        isPredictionBased: false,
      };
    }

    // 2. Try real prediction breakdown for activeNumber
    if (lastPrediction?.breakdown?.[activeNumber]) {
      const bdown = lastPrediction.breakdown[activeNumber] || {};
      const weights = globalWeights || {};
      const algoScores: Record<string, number> = {};
      const algoWeights: Record<string, number> = {};

      Object.keys(ALGO_NAMES).forEach((k) => {
        algoScores[k] = (bdown as any)[k] ?? 0;
        algoWeights[k] = (weights as any)[k] ?? 1.0;
      });

      const igResult = computeIntegratedGradients(
        algoScores as any,
        algoWeights as any
      );

      const barData = Object.entries(igResult.featureAttributions).map(([k, attr]) => {
        const name = ALGO_NAMES[k] || k;
        return {
          algoKey: k,
          name,
          attributionPercent: Math.round(attr * 100),
        };
      });
      barData.sort((a, b) => b.attributionPercent - a.attributionPercent);

      return {
        barData,
        topDriver: igResult.topDriver,
        topDriverName: ALGO_NAMES[igResult.topDriver] || igResult.topDriver,
        isReal: true,
        isPredictionBased: true,
      };
    }

    // 3. Fallback to a cleanly tagged simulated presentation
    const algoList = [
      { key: "markov", score: 0.82 },
      { key: "fractal", score: 0.76 },
      { key: "spectral", score: 0.88 },
      { key: "bayes", score: 0.79 },
      { key: "frequency", score: 0.69 },
      { key: "gap", score: 0.65 },
      { key: "affinity", score: 0.74 },
      { key: "momentum", score: 0.85 },
    ];

    let seed = activeNumber * 17;
    for (let i = 0; i < drawName.length; i++) {
      seed = (seed << 5) - seed + drawName.charCodeAt(i);
    }

    const algoScores: Record<string, number> = {};
    const mockWeights: Record<string, number> = {};
    const weights = globalWeights || {};

    algoList.forEach((a, idx) => {
      const varFactor = 0.7 + 0.5 * Math.abs(Math.sin(seed + idx * 2.3));
      algoScores[a.key] = Math.min(0.99, a.score * varFactor);
      
      // Use real weight if defined, otherwise fall back to proportional distribution
      const realWeight = weights[a.key as keyof typeof weights] !== undefined 
        ? Number(weights[a.key as keyof typeof weights]) 
        : 1 / algoList.length;
      mockWeights[a.key] = realWeight;
    });

    const igResult = computeIntegratedGradients(
      algoScores as Record<AlgoKey, number>,
      mockWeights as any
    );

    const barData = Object.entries(igResult.featureAttributions).map(([k, attr]) => {
      const name = ALGO_NAMES[k] || k;
      return {
        algoKey: k,
        name,
        attributionPercent: Math.round(attr * 100),
      };
    });

    barData.sort((a, b) => b.attributionPercent - a.attributionPercent);

    return {
      barData,
      topDriver: igResult.topDriver,
      topDriverName: ALGO_NAMES[igResult.topDriver] || igResult.topDriver,
      isReal: false,
      isPredictionBased: false,
    };
  }, [activeNumber, drawName, report, lastPrediction, globalWeights]);

  const COLORS = [
    "#6366f1",
    "#10b981",
    "#ec4899",
    "#8b5cf6",
    "#3b82f6",
    "#f59e0b",
    "#14b8a6",
    "#06b6d4",
  ];

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5 ${className}`}
    >
      {/* Header with 2-Level Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
            <Layers size={20} />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              Panneau Forensique Unifié
              <span className="text-[10px] font-mono font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                2 Niveaux
              </span>
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              Radar d'alignement macro & attribution micro par Integrated
              Gradients
            </p>
          </div>
        </div>

        {/* Level Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => {
              try {
                audioEngine.play("click");
              } catch (e) {}
              setLevel("macro");
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              level === "macro"
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm font-black"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Activity size={14} />
            <span>Vue Macro (Radar)</span>
          </button>

          <button
            onClick={() => {
              try {
                audioEngine.play("click");
              } catch (e) {}
              setLevel("micro");
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              level === "micro"
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm font-black"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <BarChart2 size={14} />
            <span>Vue Micro (Gradients)</span>
          </button>
        </div>
      </div>

      {/* LEVEL 1: VUE MACRO (RADAR D'ALIGNEMENT GLOBAL) */}
      {level === "macro" && (
        <div className="animate-fade-in grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Radar Chart */}
          <div className="md:col-span-7 h-[280px] relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                cx="50%"
                cy="50%"
                outerRadius="75%"
                data={macroRadarData}
              >
                <defs>
                  <radialGradient id="macroRadarGrad" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                    <stop
                      offset="100%"
                      stopColor="#6366f1"
                      stopOpacity={0.15}
                    />
                  </radialGradient>
                </defs>
                <PolarGrid stroke="#334155" strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 800 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  name="Alignement RéeI"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#macroRadarGrad)"
                  fillOpacity={1}
                />
                <Radar
                  name="Cible Optimale"
                  dataKey="target"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="none"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#1e293b",
                    borderRadius: "12px",
                    color: "#f8fafc",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                  formatter={(val: any) => [`${val}%`, "Score"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* 4 Macro Axis Metric Cards */}
          <div className="md:col-span-5 grid grid-cols-2 gap-3">
            {macroRadarData.map((axis, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
                    {axis.subject}
                  </span>
                  <span className="text-[9px] font-mono text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    Cible {axis.target}%
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                    {axis.value}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${axis.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LEVEL 2: VUE MICRO (ATTRIBUTION PAR GRADIENTS INTÉGRÉS) */}
      {level === "micro" && (
        <div className="animate-fade-in space-y-4">
          {/* Number Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Target size={14} className="text-emerald-500" /> Numéro Inspecté
              :
            </span>

            <div className="flex items-center gap-1.5 flex-wrap">
              {inspectableNumbers.map((num) => {
                const isSelected = num === activeNumber;
                return (
                  <button
                    key={num}
                    onClick={() => {
                      try {
                        audioEngine.play("click");
                      } catch (e) {}
                      setSelectedNumber(num);
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isSelected
                        ? "bg-emerald-500 text-white shadow-md scale-110 font-black"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-500"
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Driver Badge */}
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles size={16} className="text-indigo-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Driver Principal pour le #{activeNumber} :
              </span>
              <span className="text-xs font-black text-indigo-500 font-mono uppercase bg-indigo-500/20 px-2 py-0.5 rounded">
                {microAttributionData.topDriverName}
              </span>

              {/* Attribution Source Badge */}
              {microAttributionData.isReal ? (
                microAttributionData.isPredictionBased ? (
                  <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    ✓ Attribution Réelle du Modèle
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    ✓ Calibration Réelle Post-Tirage
                  </span>
                )
              ) : (
                <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  ⚠️ Données de Simulation
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Formule : Integrated Gradients dy_i / dx_j
            </span>
          </div>

          {/* Attribution Chart */}
          <div className="h-[220px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={microAttributionData.barData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  stroke="#64748b"
                  fontSize={10}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={10}
                  fontWeight={700}
                  width={110}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#1e293b",
                    borderRadius: "12px",
                    color: "#f8fafc",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                  formatter={(val: any) => [`${val}%`, "Contribution Gradient"]}
                />
                <Bar dataKey="attributionPercent" radius={[0, 6, 6, 0]}>
                  {microAttributionData.barData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
