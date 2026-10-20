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
} from "lucide-react";
import type { ForensicReport, AlgoKey } from "../types";
import { RETIRED_ALGO_WEIGHT_KEYS } from "../shared/prediction.types";
import { ALGO_DISPLAY_NAMES } from "../services/prediction/weightsManager";
import { audioEngine } from "../utils/audioEngine";
import { logger } from "../utils/logger";

interface MacroAxis {
  subject: string;
  /** Score mesuré (0-100), null lorsque la métrique est absente du rapport forensique. */
  value: number | null;
  /** Référence théorique dérivable de la métrique, null lorsqu'il n'en existe pas. */
  reference: number | null;
  referenceLabel: string | null;
  /** Valeur brute réellement mesurée, affichée sous le score. */
  sample: string;
}

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

  // Vue Macro : chaque axe n'affiche que ce que le rapport forensique contient réellement.
  // Aucune valeur de repli n'est inventée : une métrique absente reste « n/d », et la
  // référence (quand elle existe) est dérivée théoriquement, jamais choisie arbitrairement.
  const macroRadarData = useMemo<MacroAxis[]>(() => {
    if (!report) return [];

    // 1. Précision — proportion observée de numéros exacts parmi les numéros réellement prédits.
    //    Référence : espérance d'un tirage équitable 5/90 = 5/90 des numéros prédits.
    const predictedCount = Array.isArray(report.matches) ? report.matches.length : 0;
    const hitsCount =
      predictedCount > 0
        ? report.matches.filter((m) => m.errorType === "Hit").length
        : 0;
    const precisionAxis: MacroAxis =
      predictedCount > 0
        ? {
            subject: "Précision",
            value: (hitsCount / predictedCount) * 100,
            reference: (5 / 90) * 100,
            referenceLabel: `hasard ${((5 / 90) * 100).toFixed(1)}%`,
            sample: `${hitsCount}/${predictedCount} numéros exacts`,
          }
        : {
            subject: "Précision",
            value: null,
            reference: null,
            referenceLabel: null,
            sample: "aucun match enregistré",
          };

    // 2. Dérive spectrale — exp(-D_KL) convertit la divergence de Kullback-Leibler (en nats) en
    //    facteur de vraisemblance : 100% ⇔ modèle parfaitement calibré, sans échelle arbitraire.
    const klDiv = report.kl_divergence;
    const spectralAxis: MacroAxis =
      typeof klDiv === "number" && Number.isFinite(klDiv)
        ? {
            subject: "Dérive spectrale",
            value: 100 * Math.exp(-Math.max(0, klDiv)),
            reference: 100,
            referenceLabel: "calage parfait",
            sample: `D_KL = ${klDiv.toFixed(4)} nat`,
          }
        : {
            subject: "Dérive spectrale",
            value: null,
            reference: null,
            referenceLabel: null,
            sample: "D_KL non mesurée",
          };

    // 3. Entropie — normalisée par l'entropie maximale de la grille, log2(90) bits.
    //    Référence : entropie maximale d'une combinaison de 5 numéros équiprobables (log2 5).
    const maxEntropyBits = Math.log2(90);
    const entropyRaw = report.shannon_entropy;
    const entropyAxis: MacroAxis =
      typeof entropyRaw === "number" && Number.isFinite(entropyRaw)
        ? {
            subject: "Entropie",
            value: 100 * Math.min(1, Math.max(0, entropyRaw / maxEntropyBits)),
            reference: 100 * (Math.log2(5) / maxEntropyBits),
            referenceLabel: "combinaison 5/90 uniforme",
            sample: `${entropyRaw.toFixed(3)} / ${maxEntropyBits.toFixed(3)} bits`,
          }
        : {
            subject: "Entropie",
            value: null,
            reference: null,
            referenceLabel: null,
            sample: "entropie non mesurée",
          };

    // 4. Intégrité unifiée (UFI) — indice interne du moteur (0 corrompu → 100 parfaitement
    //    aléatoire). Aucune référence théorique n'est dérivable : pas de cible affichée.
    const ufi = report.unifiedIntegrityIndex;
    const integrityAxis: MacroAxis =
      typeof ufi === "number" && Number.isFinite(ufi)
        ? {
            subject: "Intégrité (UFI)",
            value: ufi,
            reference: null,
            referenceLabel: null,
            sample: "indice d'intégrité du moteur forensique",
          }
        : {
            subject: "Intégrité (UFI)",
            value: null,
            reference: null,
            referenceLabel: null,
            sample: "UFI non calculé",
          };

    // 5. Stabilité de Lyapunov — exp(-λ) est le facteur de contraction naturel associé à un taux
    //    de divergence λ ; λ = 0 (aucune divergence) constitue la référence à 100%.
    const lyapExp = report.lyapunovChaosExponent;
    const lyapunovAxis: MacroAxis =
      typeof lyapExp === "number" && Number.isFinite(lyapExp)
        ? {
            subject: "Stabilité Lyapunov",
            value: 100 * Math.exp(-Math.max(0, lyapExp)),
            reference: 100,
            referenceLabel: "λ = 0",
            sample: `λ = ${lyapExp.toFixed(4)}`,
          }
        : {
            subject: "Stabilité Lyapunov",
            value: null,
            reference: null,
            referenceLabel: null,
            sample: "exposant non calculé",
          };

    // 6. Entropie topologique — grandeur normalisée centrée sur 0.5 ; l'écart au centre est
    //    converti continûment par exp(-|h − 0.5| / 0.5), 0.5 étant la demi-amplitude du domaine.
    const topoEnt = report.topologicalEntropy;
    const topoAxis: MacroAxis =
      typeof topoEnt === "number" && Number.isFinite(topoEnt)
        ? {
            subject: "Entropie Topo",
            value: 100 * Math.exp(-Math.abs(topoEnt - 0.5) / 0.5),
            reference: 100,
            referenceLabel: "h = 0.5 (neutre)",
            sample: `h_top = ${topoEnt.toFixed(4)}`,
          }
        : {
            subject: "Entropie Topo",
            value: null,
            reference: null,
            referenceLabel: null,
            sample: "entropie topologique non calculée",
          };

    return [
      precisionAxis,
      spectralAxis,
      entropyAxis,
      integrityAxis,
      lyapunovAxis,
      topoAxis,
    ];
  }, [report]);

  // Le radar ne trace que les axes réellement mesurés : un axe absent ne doit pas être
  // dessiné à zéro, ce qui laisserait croire à une mesure nulle.
  const radarAxes = useMemo(
    () =>
      macroRadarData
        .filter((axis): axis is MacroAxis & { value: number } => axis.value !== null)
        .map((axis) => ({ subject: axis.subject, value: Math.round(axis.value) })),
    [macroRadarData],
  );
  const hasRadar = radarAxes.length >= 3;

  // Numbers available for Micro Attribution Inspection
  const inspectableNumbers = useMemo(() => {
    const nums: number[] = [];
    if (!report) return [];

    if (Array.isArray(report.combo)) {
      report.combo.forEach((n) => {
        if (n && !nums.includes(n)) nums.push(n);
      });
    }
    if (Array.isArray(report.matches)) {
      report.matches.forEach((m) => {
        if (m.predicted && !nums.includes(m.predicted)) nums.push(m.predicted);
      });
    }
    if (Array.isArray(report.winningXAP)) {
      report.winningXAP.forEach((x) => {
        if (x.number && !nums.includes(x.number)) nums.push(x.number);
      });
    }

    return nums.sort((a, b) => a - b).slice(0, 12);
  }, [report]);

  // Default selected number
  const activeNumber = selectedNumber ?? inspectableNumbers[0] ?? null;

  // Vue Micro : attribution calculée à partir de la décomposition ADN réellement enregistrée
  // pour le numéro inspecté (winningXAP). Aucun score ni poids synthétique n'est fabriqué ici.
  const microAttributionData = useMemo(() => {
    if (!report || activeNumber === null || !Array.isArray(report.winningXAP)) {
      return null;
    }
    const xap = report.winningXAP.find((x) => x.number === activeNumber);
    if (!xap) return null;

    const contributions = xap.shapleyValues ?? xap.dnaVector;
    const sourceLabel = xap.shapleyValues
      ? "Valeurs de Shapley exactes"
      : "Vecteur ADN de la décomposition";

    const entries = (Object.entries(contributions) as [AlgoKey, number][])
      .filter(
        ([key, val]) =>
          typeof val === "number" &&
          Number.isFinite(val) &&
          val > 0 &&
          !RETIRED_ALGO_WEIGHT_KEYS.has(key),
      );

    const total = entries.reduce((acc, [, val]) => acc + val, 0);
    if (!(total > 0)) return null;

    const barData = entries
      .map(([key, val]) => ({
        algoKey: key,
        name: ALGO_DISPLAY_NAMES[key] ?? key,
        attributionPercent: (val / total) * 100,
      }))
      .sort((a, b) => b.attributionPercent - a.attributionPercent);

    return {
      barData,
      sourceLabel,
      topDriverName:
        ALGO_DISPLAY_NAMES[xap.dominantAlgo] ?? String(xap.dominantAlgo),
      dominantShare: xap.contributionPercentage,
      compositionEntropy: xap.compositionEntropy,
      compositionGini: xap.compositionGini,
      synergyAlgos: (xap.synergyAlgos ?? []).map(
        (key) => ALGO_DISPLAY_NAMES[key] ?? String(key),
      ),
    };
  }, [report, activeNumber]);

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
              Radar d'alignement macro & attribution micro par la décomposition
              ADN réellement enregistrée
            </p>
          </div>
        </div>

        {/* Level Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => {
              try {
                audioEngine.play("click");
              } catch (err) {
                logger.debug({ err }, "Audio playback non-bloquant");
              }
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
              } catch (err) {
                logger.debug({ err }, "Audio playback non-bloquant");
              }
              setLevel("micro");
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              level === "micro"
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm font-black"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <BarChart2 size={14} />
            <span>Vue Micro (Attribution)</span>
          </button>
        </div>
      </div>

      {/* LEVEL 1: VUE MACRO (RADAR D'ALIGNEMENT GLOBAL) */}
      {level === "macro" && (
        <div className="animate-fade-in grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Radar Chart — tracé uniquement sur les axes réellement mesurés */}
          <div className="md:col-span-7 h-[320px] relative flex items-center justify-center">
            {hasRadar ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="75%"
                  data={radarAxes}
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
                    name="Mesure du rapport"
                    dataKey="value"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#macroRadarGrad)"
                    fillOpacity={1}
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
                    formatter={(val: any) => [`${val}%`, "Score mesuré"]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center space-y-2 px-6">
                <Activity size={28} className="text-slate-400 mx-auto" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Radar indisponible
                </p>
                <p className="text-[11px] text-slate-400 font-medium">
                  Moins de trois axes sont mesurés dans ce rapport. Le radar n'affiche
                  que des métriques réellement calculées : aucune valeur de remplissage
                  n'est dessinée.
                </p>
              </div>
            )}
          </div>

          {/* Macro Axis Metric Cards — une carte par axe, « n/d » si la métrique est absente */}
          <div className="md:col-span-5 grid grid-cols-2 gap-3">
            {macroRadarData.length === 0 && (
              <div className="col-span-2 p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                <p className="text-[11px] font-bold text-slate-500">
                  Aucun rapport forensique sélectionné.
                </p>
              </div>
            )}
            {macroRadarData.map((axis) => (
              <div
                key={axis.subject}
                className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div className="flex justify-between items-center mb-1 gap-2">
                  <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
                    {axis.subject}
                  </span>
                  {axis.reference !== null && axis.referenceLabel && (
                    <span
                      className="text-[9px] font-mono text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded whitespace-nowrap"
                      title={`Référence théorique : ${axis.referenceLabel} (${axis.reference.toFixed(1)}%)`}
                    >
                      Réf. {axis.referenceLabel}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                    {axis.value === null ? "n/d" : `${Math.round(axis.value)}%`}
                  </span>
                </div>
                <div className="relative w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${axis.value ?? 0}%` }}
                  />
                </div>
                <span
                  className="text-[9px] font-mono text-slate-400 mt-1.5 truncate"
                  title={axis.sample}
                >
                  {axis.sample}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LEVEL 2: VUE MICRO (ATTRIBUTION PAR DÉCOMPOSITION ADN RÉELLE) */}
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
                      } catch (err) {
                        logger.debug({ err }, "Audio playback non-bloquant");
                      }
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
              {inspectableNumbers.length === 0 && (
                <span className="text-[11px] font-bold text-slate-400">
                  Aucun numéro attribué dans ce rapport
                </span>
              )}
            </div>
          </div>

          {/* Top Driver Badge */}
          {microAttributionData && (
            <>
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles size={16} className="text-indigo-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Driver Principal d'Attribution pour le #{activeNumber} :
                  </span>
                  <span className="text-xs font-black text-indigo-500 font-mono uppercase bg-indigo-500/20 px-2 py-0.5 rounded">
                    {microAttributionData.topDriverName}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {microAttributionData.dominantShare.toFixed(1)}% du score du
                    numéro
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  Source : {microAttributionData.sourceLabel}
                </span>
              </div>

              {/* Mesures de composition réellement calculées */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {microAttributionData.compositionEntropy !== undefined && (
                  <span>
                    Entropie de composition :{" "}
                    <span className="font-mono text-indigo-500 font-black">
                      {(microAttributionData.compositionEntropy * 100).toFixed(1)}%
                    </span>
                  </span>
                )}
                {microAttributionData.compositionGini !== undefined && (
                  <span>
                    Gini de composition :{" "}
                    <span className="font-mono text-indigo-500 font-black">
                      {microAttributionData.compositionGini.toFixed(4)}
                    </span>
                  </span>
                )}
                {microAttributionData.synergyAlgos.length > 0 && (
                  <span className="normal-case tracking-normal">
                    Co-contributeurs :{" "}
                    <span className="font-mono text-indigo-500 font-black">
                      {microAttributionData.synergyAlgos.join(", ")}
                    </span>
                  </span>
                )}
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
                      formatter={(val: any) => [
                        `${Number(val).toFixed(1)}%`,
                        "Part du score",
                      ]}
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
            </>
          )}

          {!microAttributionData && (
            <div className="py-10 text-center space-y-2">
              <Target size={26} className="text-slate-400 mx-auto" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                Attribution indisponible
              </p>
              <p className="text-[11px] text-slate-400 font-medium max-w-sm mx-auto">
                Ce rapport ne contient aucune décomposition ADN (winningXAP)
                pour ce numéro. L'attribution par algorithme n'est calculée
                qu'à partir des contributions réellement enregistrées lors de
                la prédiction.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
