import React, { useState, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { ForensicReport } from "../../types";
import {
  calculateStochasticEntropyForensics,
  StochasticEntropySummary,
  UnpredictabilityRegime,
} from "../../services/forensic/stochasticEntropyService";
import { audioEngine } from "../../utils/audioEngine";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Flame,
  ShieldCheck,
  Compass,
  AlertTriangle,
  Zap,
  TrendingUp,
  Sliders,
  Info,
  Sparkles,
  Download,
  Clock,
  Layers,
} from "lucide-react";
import { formatDateSafely } from "../../utils/dateUtils";

interface StochasticEntropyPanelProps {
  drawName: string;
  reports?: ForensicReport[];
}

export const StochasticEntropyPanel: React.FC<StochasticEntropyPanelProps> = ({
  drawName,
  reports = [],
}) => {
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);

  const [windowSize, setWindowSize] = useState<number>(15);
  const [selectedMetric, setSelectedMetric] = useState<"ALL" | "ENTROPY" | "KL_DIVERGENCE" | "UNPREDICTABILITY">("ALL");

  // Calcul médico-légal de l'entropie stochastique
  const entropyData: StochasticEntropySummary = useMemo(() => {
    return calculateStochasticEntropyForensics(
      drawName,
      history,
      reports,
      globalWeights,
      windowSize
    );
  }, [drawName, history, reports, globalWeights, windowSize]);

  // Données formatées pour le graphique Recharts
  const chartData = useMemo(() => {
    return [...entropyData.timeline].reverse().map((point) => ({
      date: formatDateSafely(point.drawDate) || `T-${point.drawIndex}`,
      drawEntropy: parseFloat((point.drawEntropy * 100).toFixed(1)),
      predEntropy: parseFloat((point.predictionEntropy * 100).toFixed(1)),
      klDivergence: parseFloat(point.klDivergence.toFixed(3)),
      unpredictability: point.unpredictabilityScore,
      hits: point.exactHits,
      regime: point.regime,
      regimeLabel: point.regimeLabel,
    }));
  }, [entropyData.timeline]);

  const handleExportJSON = () => {
    try {
      audioEngine.play("click");
      const blob = new Blob([JSON.stringify(entropyData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stochastic_entropy_${drawName.toLowerCase().replace(/\s+/g, "_")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const getRegimeBadge = (regime: UnpredictabilityRegime) => {
    switch (regime) {
      case "LOW_ENTROPY_ATTRACTOR":
        return {
          bg: "bg-emerald-950/80 text-emerald-300 border-emerald-500/40",
          icon: ShieldCheck,
          text: "Basse Imprévisibilité (Attracteur)",
        };
      case "HIGH_ENTROPY_DIFFUSION":
        return {
          bg: "bg-rose-950/80 text-rose-300 border-rose-500/40",
          icon: AlertTriangle,
          text: "Haute Imprévisibilité (Dispersion)",
        };
      default:
        return {
          bg: "bg-indigo-950/80 text-indigo-300 border-indigo-500/40",
          icon: Compass,
          text: "Régime Transitionnel",
        };
    }
  };

  const currentBadge = getRegimeBadge(entropyData.currentRegime);
  const CurrentIcon = currentBadge.icon;

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* BANNER & KPI SUMMARY */}
      <div className="bg-slate-900/80 p-5 md:p-7 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-950/80 border border-purple-500/30 rounded-2xl text-purple-400">
                <Activity size={22} />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                  Audit d'Entropie Stochastique & Prévisibilité
                  <span className={`px-3 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1.5 ${currentBadge.bg}`}>
                    <CurrentIcon size={12} />
                    {currentBadge.text}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Analyse de la divergence d'information de Shannon et Kullback-Leibler entre les tirages passés et les inférences du moteur sur {drawName}.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-export-entropy-json"
              onClick={handleExportJSON}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Exporter les métriques d'entropie au format JSON"
            >
              <Download size={13} />
              <span>Exporter JSON</span>
            </button>
          </div>
        </div>

        {/* STATS RAPIDES KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Entropie Shannon Tirage H(P)</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black font-mono text-purple-400">
                {(entropyData.meanDrawEntropy * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] font-mono text-slate-400">norm</span>
            </div>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Entropie Inférence H(Q)</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black font-mono text-indigo-400">
                {(entropyData.meanPredictionEntropy * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] font-mono text-slate-400">dispersion</span>
            </div>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Divergence Kullback-Leibler</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black font-mono text-emerald-400">
                {entropyData.meanKLDivergence.toFixed(3)}
              </span>
              <span className="text-[10px] font-mono text-slate-400">bits</span>
            </div>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Indice d'Imprévisibilité</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span
                className={`text-2xl font-black font-mono ${
                  entropyData.currentUnpredictabilityScore > 60
                    ? "text-rose-400"
                    : entropyData.currentUnpredictabilityScore < 40
                      ? "text-emerald-400"
                      : "text-amber-400"
                }`}
              >
                {entropyData.currentUnpredictabilityScore.toFixed(1)}/100
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* STRIP CHRONOLOGIQUE DES PÉRIODES HAUTE VS BASSE IMPRÉVISIBILITÉ */}
      <div className="bg-slate-900/60 p-4 md:p-5 rounded-2xl border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-purple-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              Frise Temporelle des Régimes de Prévisibilité
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Basse Imprévisibilité ({entropyData.lowUnpredictabilityPeriodsCount})
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Haute Imprévisibilité ({entropyData.highUnpredictabilityPeriodsCount})
            </span>
          </div>
        </div>

        {/* Heat Strip visuel */}
        <div className="flex h-7 rounded-xl overflow-hidden border border-white/10 p-0.5 bg-slate-950 gap-0.5">
          {entropyData.timeline.map((pt, idx) => {
            const isHigh = pt.regime === "HIGH_ENTROPY_DIFFUSION";
            const isLow = pt.regime === "LOW_ENTROPY_ATTRACTOR";
            return (
              <div
                key={pt.drawId || idx}
                className={`flex-1 h-full rounded transition-all hover:scale-105 cursor-pointer relative group ${
                  isHigh
                    ? "bg-rose-500/80 hover:bg-rose-400"
                    : isLow
                      ? "bg-emerald-500/80 hover:bg-emerald-400"
                      : "bg-indigo-500/40 hover:bg-indigo-400"
                }`}
                title={`Tirage: ${pt.drawDate} | Score Imprévisibilité: ${pt.unpredictabilityScore}/100 | Hits: ${pt.exactHits}/5`}
              ></div>
            );
          })}
        </div>
      </div>

      {/* GRAPHIQUE INTERACTIF RECHARTS */}
      <div className="bg-slate-900/60 p-5 md:p-6 rounded-3xl border border-white/10 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              Évolution Entropique & Divergence KL
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10 text-[10px] font-bold">
              {(["ALL", "ENTROPY", "KL_DIVERGENCE", "UNPREDICTABILITY"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    audioEngine.play("click");
                    setSelectedMetric(mode);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    selectedMetric === mode
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {mode === "ALL" && "Vue Globale"}
                  {mode === "ENTROPY" && "Entropies H(P)/H(Q)"}
                  {mode === "KL_DIVERGENCE" && "Divergence D_KL"}
                  {mode === "UNPREDICTABILITY" && "Indice Imprévisibilité"}
                </button>
              ))}
            </div>

            <select
              value={windowSize}
              onChange={(e) => setWindowSize(Number(e.target.value))}
              className="bg-slate-950 text-slate-300 border border-white/10 rounded-xl px-2.5 py-1 text-xs font-mono font-bold focus:outline-none"
            >
              <option value={10}>Fenêtre 10</option>
              <option value={15}>Fenêtre 15</option>
              <option value={25}>Fenêtre 25</option>
              <option value={40}>Fenêtre 40</option>
            </select>
          </div>
        </div>

        {/* Zone graphique */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="entropyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="unpredGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "rgba(255,255,255,0.1)",
                  borderRadius: "1rem",
                  fontSize: "11px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />

              {(selectedMetric === "ALL" || selectedMetric === "ENTROPY") && (
                <>
                  <Area
                    type="monotone"
                    dataKey="drawEntropy"
                    name="Entropie Tirage H(P) %"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#entropyGradient)"
                  />
                  <Line
                    type="monotone"
                    dataKey="predEntropy"
                    name="Entropie Prédiction H(Q) %"
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </>
              )}

              {(selectedMetric === "ALL" || selectedMetric === "UNPREDICTABILITY") && (
                <Area
                  type="monotone"
                  dataKey="unpredictability"
                  name="Indice Imprévisibilité"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#unpredGradient)"
                />
              )}

              {(selectedMetric === "ALL" || selectedMetric === "KL_DIVERGENCE") && (
                <Line
                  type="monotone"
                  dataKey="klDivergence"
                  name="Divergence KL (bits)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              )}

              <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SYNTHÈSE MÉDICO-LÉGALE ET CONSEILS DE CALIBRATION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 bg-slate-900/60 rounded-3xl border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles size={16} />
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Diagnostic de Résonance du Prochain Tirage
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-2.5 leading-relaxed font-medium">
              {entropyData.predictabilityResonanceWindow.recommendedStrategy}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Indice de Cohérence</span>
            <span className="text-xs font-mono font-bold text-indigo-400">
              {entropyData.predictabilityResonanceWindow.confidence}%
            </span>
          </div>
        </div>

        <div className="p-5 bg-slate-900/60 rounded-3xl border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-teal-400">
              <ShieldCheck size={16} />
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Règle de Garantie Déterministe
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-2.5 leading-relaxed font-medium">
              Les calculs d'entropie exploitent la base 2 logarithmique sur l'espace complet des 90 numéros. Zéro approximation aléatoire : la divergence est isolée strictement à l'historique propre du tirage {drawName}.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Exposant Lyapunov Global</span>
            <span className="text-xs font-mono font-bold text-teal-300">
              λ = {entropyData.meanLyapunovExponent.toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
