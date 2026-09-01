import React, { useState, useEffect, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { AlgoKey } from "../../shared/prediction.types";
import { LABELS_MAP, ALGO_CATEGORIES } from "../../hooks/useAlgorithmSync";
import {
  ExpertBiasConfig,
  AlgoUnderperformanceMetric,
  loadExpertBiases,
  saveExpertBiases,
  applyExpertBiasesToWeights,
  analyzeUnderperformingSubAlgos,
  calculateExpertBiasDecay,
} from "../../services/prediction/expertBiasService";
import { audioEngine } from "../../utils/audioEngine";
import { logger } from "../../utils/logger";
import { useToast } from "../ui/Toast";
import {
  Sliders,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Clock,
  Zap,
  Layers,
  Search,
  Filter,
  Info,
  TrendingUp,
  TrendingDown,
  Lock,
} from "lucide-react";

interface ExpertBiasAdjusterProps {
  drawName: string;
  onBiasesApplied?: () => void;
}

export const ExpertBiasAdjuster: React.FC<ExpertBiasAdjusterProps> = ({
  drawName,
  onBiasesApplied,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
  const addAgentLog = useNexusStore((state) => state.addAgentLog);

  // Biais locaux éditables
  const [biases, setBiases] = useState<Record<AlgoKey, ExpertBiasConfig>>(() =>
    loadExpertBiases(drawName)
  );

  // Recherche & Catégorie
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [showUnderperformingOnly, setShowUnderperformingOnly] = useState(false);
  const [globalHorizon, setGlobalHorizon] = useState<number>(5);

  // Analyse sous-jacente des sous-algos
  const underperformanceMetrics = useMemo(() => {
    return analyzeUnderperformingSubAlgos(drawName, history, globalWeights);
  }, [drawName, history, globalWeights]);

  // Synchronisation au changement de tirage
  useEffect(() => {
    setBiases(loadExpertBiases(drawName));
  }, [drawName]);

  // Calcul en direct des poids modulés simulés
  const simulatedWeights = useMemo(() => {
    return applyExpertBiasesToWeights(globalWeights, biases, history.length);
  }, [globalWeights, biases, history.length]);

  // Nombre de biais actifs
  const activeBiasesCount = useMemo(() => {
    return Object.values(biases).filter((b) => b && b.isActive && (b.biasMultiplier !== 1.0 || b.biasDelta !== 0)).length;
  }, [biases]);

  // Handler de modification du multiplicateur
  const handleMultiplierChange = (algoKey: AlgoKey, multiplier: number) => {
    setBiases((prev) => {
      const current = prev[algoKey] || {
        algoKey,
        biasDelta: 0,
        biasMultiplier: 1.0,
        decayHorizon: globalHorizon,
        appliedAtDrawIndex: history.length,
        appliedAtTimestamp: Date.now(),
        isActive: true,
      };

      const updated = {
        ...current,
        biasMultiplier: multiplier,
        isActive: multiplier !== 1.0 || current.biasDelta !== 0,
        decayHorizon: current.decayHorizon || globalHorizon,
        appliedAtDrawIndex: history.length,
        appliedAtTimestamp: Date.now(),
      };

      return { ...prev, [algoKey]: updated };
    });
  };

  // Handler de modification du Delta
  const handleDeltaChange = (algoKey: AlgoKey, delta: number) => {
    setBiases((prev) => {
      const current = prev[algoKey] || {
        algoKey,
        biasDelta: 0,
        biasMultiplier: 1.0,
        decayHorizon: globalHorizon,
        appliedAtDrawIndex: history.length,
        appliedAtTimestamp: Date.now(),
        isActive: true,
      };

      const updated = {
        ...current,
        biasDelta: delta,
        isActive: delta !== 0 || current.biasMultiplier !== 1.0,
        decayHorizon: current.decayHorizon || globalHorizon,
        appliedAtDrawIndex: history.length,
        appliedAtTimestamp: Date.now(),
      };

      return { ...prev, [algoKey]: updated };
    });
  };

  // Modification individuelle de l'horizon de décroissance
  const handleHorizonChange = (algoKey: AlgoKey, horizon: number) => {
    setBiases((prev) => {
      const current = prev[algoKey];
      if (!current) return prev;
      return {
        ...prev,
        [algoKey]: { ...current, decayHorizon: Math.max(1, horizon) },
      };
    });
  };

  // Nudge rapide (Preset : Boost Sous-Performants Ciblés)
  const handleBoostUnderperformers = () => {
    try {
      audioEngine.play("click");
    } catch (err) {
      logger.debug({ err }, "Audio error non-bloquant");
    }

    const newBiases: Record<AlgoKey, ExpertBiasConfig> = { ...biases };
    let boostedCount = 0;

    underperformanceMetrics.forEach((metric) => {
      if (metric.isUnderperforming || metric.proofScore < 0) {
        newBiases[metric.algoKey] = {
          algoKey: metric.algoKey,
          biasDelta: 0.05,
          biasMultiplier: 1.35,
          decayHorizon: globalHorizon,
          appliedAtDrawIndex: history.length,
          appliedAtTimestamp: Date.now(),
          isActive: true,
          expertRationale: "Nudge expert : relance temporaire de sous-algorithme en creux statistique",
        };
        boostedCount++;
      }
    });

    setBiases(newBiases);
    showToast(`${boostedCount} sous-algorithmes sous-performants ciblés avec succès.`, "info");
  };

  // Réinitialisation complète des biais experts
  const handleResetAll = () => {
    try {
      audioEngine.play("click");
    } catch (err) {
      logger.debug({ err }, "Audio error non-bloquant");
    }

    const emptyBiases = {} as Record<AlgoKey, ExpertBiasConfig>;
    setBiases(emptyBiases);
    saveExpertBiases(drawName, emptyBiases);
    
    // Rétablissement des poids de base non biaisés
    setGlobalWeights(globalWeights);

    showToast("Tous les biais experts ont été réinitialisés au profil canonique.", "info");
  };

  // Application définitive au store et persistance
  const handleApplyBiases = () => {
    try {
      audioEngine.play("success");
    } catch (err) {
      logger.debug({ err }, "Audio error non-bloquant");
    }

    saveExpertBiases(drawName, biases);
    setGlobalWeights(simulatedWeights);

    addAgentLog({
      id: `expert_bias_apply_${Date.now()}`,
      timestamp: new Date(),
      action: `Application de ${activeBiasesCount} biais d'experts manuels sur ${drawName} (Horizon: ${globalHorizon} tirages).`,
      type: "AUTOTUNE",
      impact: `Poids opérationnels reconfigurés avec décroissance temporelle contrôlée.`,
    });

    showToast(`Biais d'experts appliqués avec succès (${activeBiasesCount} modificateurs actifs).`, "success");
    if (onBiasesApplied) onBiasesApplied();
  };

  // Filtrage des sous-algorithmes à afficher
  const filteredMetrics = useMemo(() => {
    return underperformanceMetrics.filter((m) => {
      if (showUnderperformingOnly && !m.isUnderperforming) return false;
      if (selectedCategory !== "ALL" && m.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return m.label.toLowerCase().includes(q) || m.algoKey.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [underperformanceMetrics, showUnderperformingOnly, selectedCategory, searchQuery]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    underperformanceMetrics.forEach((m) => set.add(m.category));
    return Array.from(set).sort();
  }, [underperformanceMetrics]);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* BANNER & HEADER */}
      <div className="bg-slate-900/80 p-5 md:p-7 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-950/80 border border-indigo-500/30 rounded-2xl text-indigo-400">
                <Sliders size={20} />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                  Ajustement Manuel de Biais Expert
                  {activeBiasesCount > 0 && (
                    <span className="px-2.5 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-mono font-bold animate-pulse">
                      {activeBiasesCount} Actif{activeBiasesCount > 1 ? "s" : ""}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Appliquez des boosts temporaires et amortis sur des sous-algorithmes précis selon vos observations de tirages récents sur {drawName}.
                </p>
              </div>
            </div>
          </div>

          {/* ACTIONS GLOBALES */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-boost-underperformers"
              onClick={handleBoostUnderperformers}
              className="px-3.5 py-2 bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-amber-950/30"
              title="Applique un boost expert calibré à tous les sous-algorithmes sous-performants"
            >
              <TrendingUp size={13} className="text-amber-400" />
              <span>Cibler Sous-Performants</span>
            </button>

            <button
              id="btn-reset-expert-biases"
              onClick={handleResetAll}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              title="Efface tous les biais manuels et rétablit les poids d'origine"
            >
              <RotateCcw size={13} />
              <span>Réinitialiser</span>
            </button>

            <button
              id="btn-apply-expert-biases"
              onClick={handleApplyBiases}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/30 border border-indigo-400/30"
            >
              <Sparkles size={14} />
              <span>Valider & Appliquer</span>
            </button>
          </div>
        </div>

        {/* HORIZON DE DÉCROISSANCE & INFO */}
        <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-indigo-400" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Horizon d'Amortissement Global</span>
                <span className="text-xs font-mono font-bold text-white">Validité : {globalHorizon} tirages suivants</span>
              </div>
            </div>
            <select
              value={globalHorizon}
              onChange={(e) => setGlobalHorizon(Number(e.target.value))}
              className="bg-slate-900 text-indigo-300 border border-indigo-500/30 rounded-xl px-2.5 py-1 text-xs font-mono font-bold focus:outline-none"
            >
              <option value={1}>1 tirage</option>
              <option value={3}>3 tirages</option>
              <option value={5}>5 tirages</option>
              <option value={10}>10 tirages</option>
              <option value={20}>20 tirages</option>
            </select>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-emerald-400" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Formule d'Amortissement</span>
                <span className="text-xs font-mono text-slate-300">Décroissance continue exp(-k / H)</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-lg border border-emerald-500/30">
              100% Déterministe
            </span>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-teal-400" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Isolation Absolue</span>
                <span className="text-xs font-mono text-slate-300">Portée : Profil {drawName} uniquement</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-teal-300 bg-teal-950/80 px-2 py-0.5 rounded-lg border border-teal-500/30">
              0 Leakage
            </span>
          </div>
        </div>
      </div>

      {/* FILTRES ET RECHERCHE */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-white/10">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer un sous-algorithme..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 text-white placeholder-slate-500 rounded-xl border border-white/10 text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-950 text-slate-300 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none"
          >
            <option value="ALL">Toutes les Catégories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowUnderperformingOnly((prev) => !prev)}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
            showUnderperformingOnly
              ? "bg-rose-950/80 text-rose-300 border-rose-500/50 shadow-md"
              : "bg-slate-950 text-slate-400 border-white/10 hover:text-white"
          }`}
        >
          <AlertTriangle size={13} className={showUnderperformingOnly ? "text-rose-400" : "text-slate-500"} />
          <span>Sous-Performants Uniquement ({underperformanceMetrics.filter((m) => m.isUnderperforming).length})</span>
        </button>
      </div>

      {/* GRILLE DES SOUS-ALGORITHMES & CONTRÔLE DE BIAIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMetrics.map((metric) => {
          const key = metric.algoKey;
          const bias = biases[key] || {
            algoKey: key,
            biasDelta: 0,
            biasMultiplier: 1.0,
            decayHorizon: globalHorizon,
            appliedAtDrawIndex: history.length,
            appliedAtTimestamp: Date.now(),
            isActive: false,
          };

          const decayRemaining = calculateExpertBiasDecay(bias, history.length);
          const simWeight = simulatedWeights[key] || 0;
          const baseWeight = globalWeights[key] || 0;
          const isBoosted = simWeight > baseWeight + 0.001;
          const isDampened = simWeight < baseWeight - 0.001;

          return (
            <div
              key={key}
              className={`p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                bias.isActive && (bias.biasMultiplier !== 1.0 || bias.biasDelta !== 0)
                  ? "bg-slate-900/90 border-indigo-500/50 shadow-lg shadow-indigo-950/40"
                  : metric.isUnderperforming
                    ? "bg-slate-900/60 border-amber-500/30"
                    : "bg-slate-900/40 border-white/10"
              }`}
            >
              <div>
                {/* En-tête de la carte */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[9px] uppercase font-mono font-bold text-slate-400 tracking-wider block">
                      {metric.category}
                    </span>
                    <h3 className="text-sm font-black text-white mt-0.5">{metric.label}</h3>
                  </div>

                  {/* Badge de statut */}
                  <div className="flex items-center gap-1">
                    {metric.hasEmpiricalProof ? (
                      <span
                        className="px-2 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded-lg text-[9px] font-mono font-bold flex items-center gap-1"
                        title={`Preuve empirique validée (+${metric.proofScore.toFixed(2)}σ)`}
                      >
                        <ShieldCheck size={11} className="text-emerald-400" />
                        <span>+{metric.proofScore.toFixed(1)}σ</span>
                      </span>
                    ) : (
                      <span
                        className="px-2 py-0.5 bg-slate-950 text-slate-400 border border-white/10 rounded-lg text-[9px] font-mono font-bold flex items-center gap-1"
                        title="Non validé empiriquement sur ce tirage"
                      >
                        <Lock size={10} className="text-slate-400" />
                        <span>{metric.proofScore <= 0 ? `${metric.proofScore.toFixed(1)}σ` : "0 preuve"}</span>
                      </span>
                    )}

                    {metric.isUnderperforming && (
                      <span
                        className="px-1.5 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-500/40 rounded-lg text-[9px] font-mono font-bold"
                        title="Taux récent sous la baseline statistique"
                      >
                        Creux
                      </span>
                    )}
                  </div>
                </div>

                {/* Métriques comparatives de poids */}
                <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 bg-slate-950/70 rounded-xl border border-white/5">
                  <div>
                    <span className="text-[9px] uppercase text-slate-400 block font-bold">Poids de Base</span>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {baseWeight.toFixed(4)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-400 block font-bold">Poids Modulé Simulé</span>
                    <span
                      className={`text-xs font-mono font-black flex items-center gap-1 ${
                        isBoosted
                          ? "text-emerald-400"
                          : isDampened
                            ? "text-rose-400"
                            : "text-slate-200"
                      }`}
                    >
                      {simWeight.toFixed(4)}
                      {isBoosted && <TrendingUp size={11} />}
                      {isDampened && <TrendingDown size={11} />}
                    </span>
                  </div>
                </div>

                {/* Slider Multiplicateur de Biais */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-bold uppercase">Facteur Multiplicatif</span>
                    <span className="font-mono font-bold text-indigo-300">
                      x{bias.biasMultiplier.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="2.5"
                    step="0.05"
                    value={bias.biasMultiplier}
                    onChange={(e) => handleMultiplierChange(key, parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] font-mono text-slate-400">
                    <span>x0.2 (Amorti)</span>
                    <span>x1.0 (Neutre)</span>
                    <span>x2.5 (Boost)</span>
                  </div>
                </div>

                {/* Slider Delta de Nudge Direct */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-bold uppercase">Nudge Delta (Δb)</span>
                    <span className="font-mono font-bold text-emerald-300">
                      {bias.biasDelta >= 0 ? `+${bias.biasDelta.toFixed(3)}` : bias.biasDelta.toFixed(3)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-0.15"
                    max="0.25"
                    step="0.01"
                    value={bias.biasDelta}
                    onChange={(e) => handleDeltaChange(key, parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Pied de la carte : Durée & Reset individuel */}
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                  <Clock size={11} />
                  <span>Horizon :</span>
                  <select
                    value={bias.decayHorizon || globalHorizon}
                    onChange={(e) => handleHorizonChange(key, Number(e.target.value))}
                    className="bg-slate-950 text-slate-200 border border-white/10 rounded px-1.5 py-0.5 text-[9px] font-mono focus:outline-none"
                  >
                    <option value={1}>1 T</option>
                    <option value={3}>3 T</option>
                    <option value={5}>5 T</option>
                    <option value={10}>10 T</option>
                  </select>
                </div>

                {bias.isActive && (
                  <button
                    onClick={() => {
                      handleMultiplierChange(key, 1.0);
                      handleDeltaChange(key, 0);
                    }}
                    className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 font-mono text-[9px]"
                  >
                    <RotateCcw size={10} />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
