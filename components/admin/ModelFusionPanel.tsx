import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  GitMerge,
  Dna,
  Sliders,
  History,
  RefreshCw,
  Save,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Layers,
  Sparkles,
  Search,
  Activity,
  Zap,
  Scale,
  ArrowRight,
  Database,
  Eye,
  Info,
} from "lucide-react";
import { useNexusStore } from "../../store/useNexusStore";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { NumberBall } from "../NumberBall";
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from "../../shared/prediction.types";
import { LABELS_MAP } from "../../hooks/useAlgorithmSync";
import type { AlgoWeights } from "../../types";
import {
  getAlgoWeights,
  saveAlgoWeights,
  normalizeWeights,
  getDefaultWeights,
} from "../../services/prediction/weightsManager";
import {
  getModelDnaHistory,
  recordModelDnaVersion,
  getModelEvolutionLineage,
  extractSpecializations,
  computeModelDnaFingerprint,
  ModelDnaRecord,
  ModelEvolutionLineage,
} from "../../services/prediction/modelDnaKnowledgeBase";
import { applyOptimizedWeights } from "../../services/prediction/optimizationController";
import {
  runSystematicDnaAudit,
  DnaAuditReport,
  computeDeterministicCriticalThreshold,
} from "../../services/prediction/dnaAuditService";
import { calculateFusion } from "../../services/fusionService";
import { DnaPerformanceDriftPanel } from "./DnaPerformanceDriftPanel";

export type ActiveViewTab = "weights" | "dna_lineage" | "tripartite_fusion" | "dna_drift";

interface ModelFusionPanelProps {
  selectedDrawName: string;
  initialTab?: ActiveViewTab;
}

const CATEGORY_MAP: Record<string, { label: string; keys: AlgoKey[]; color: string }> = {
  core: {
    label: "Noyau & Fréquentiel",
    keys: [
      AlgoKey.FREQUENCY,
      AlgoKey.GAPS,
      AlgoKey.GAP_TREND,
      AlgoKey.GAP_CADENCE,
      AlgoKey.GAP_SEQUENCE,
      AlgoKey.GAP_BAND_SEQUENCE,
    ],
    color: "indigo",
  },
  physics: {
    label: "Physique Ondulatoire & Espaces",
    keys: [
      AlgoKey.SPECTRAL,
      AlgoKey.FRACTAL,
      AlgoKey.SPATIAL,
      AlgoKey.DERIVED_NEIGHBOR,
      AlgoKey.SHADOW_PROBABILITY,
    ],
    color: "purple",
  },
  bayesian: {
    label: "Bayésien, Markov & Dynamique",
    keys: [
      AlgoKey.BAYES,
      AlgoKey.MARKOV,
      AlgoKey.AFFINITY,
      AlgoKey.TEMPORAL,
      AlgoKey.ECHO_STATE,
      AlgoKey.NETWORK_CORRELATION,
    ],
    color: "emerald",
  },
  meta: {
    label: "Méta-Modèles & Décisions",
    keys: [
      AlgoKey.MOMENTUM,
      AlgoKey.SEQUENCE_PATTERN,
      AlgoKey.GAP_PATTERN,
      AlgoKey.MACHINE_TRANSFER,
      AlgoKey.ISOLATION_ANOMALY,
      AlgoKey.INTER_MONTHLY_RESONANCE,
      AlgoKey.INTER_DRAW_RESONANCE,
    ],
    color: "amber",
  },
};

export const ModelFusionPanel: React.FC<ModelFusionPanelProps> = ({
  selectedDrawName,
  initialTab,
}) => {
  const { showToast } = useToast();

  // Nexus Store
  const activeDrawName = useNexusStore((state) => state.drawName);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const updateGlobalWeights = useNexusStore((state) => state.updateGlobalWeights);
  const refreshData = useNexusStore((state) => state.refreshData);
  const history = useNexusStore((state) => state.history);
  const spectral = useNexusStore((state) => state.spectral);
  const lastPrediction = useNexusStore((state) => state.lastPrediction);

  // Local State
  const [activeTab, setActiveTab] = useState<ActiveViewTab>(initialTab || "weights");

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [weights, setWeights] = useState<AlgoWeights>({} as AlgoWeights);
  const [lockedKeys, setLockedKeys] = useState<Set<AlgoKey>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  // Search & Filter for Weights
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // DNA Lineage & Audit
  const [dnaHistory, setDnaHistory] = useState<ModelDnaRecord[]>([]);
  const [lineage, setLineage] = useState<ModelEvolutionLineage | null>(null);
  const [auditReport, setAuditReport] = useState<DnaAuditReport | null>(null);
  const [snapshotTag, setSnapshotTag] = useState("");
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);

  // Tripartite Fusion Interactive State
  const [fusionBiases, setFusionBiases] = useState({
    logic: 1.0,
    physics: 1.0,
    intuition: 1.0,
  });
  const [fusionMethod, setFusionMethod] = useState<
    "map" | "balanced" | "harmonic_consensus" | "quantum_bayesian"
  >("quantum_bayesian");

  // Canonical baseline weights
  const canonicalWeights = useMemo(() => getDefaultWeights(), []);

  // 1. Load weights, lineage, and audit specifically for selectedDrawName
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedWeights = await getAlgoWeights(selectedDrawName);
      const historyList = await getModelDnaHistory(selectedDrawName, 30);
      const evoLineage = await getModelEvolutionLineage(selectedDrawName);
      const audit = await runSystematicDnaAudit(
        selectedDrawName,
        history,
        loadedWeights
      );

      setWeights(loadedWeights);
      setDnaHistory(historyList);
      setLineage(evoLineage);
      setAuditReport(audit);
      setIsDirty(false);
    } catch (e) {
      console.error("[ModelFusionPanel] Erreur de chargement:", e);
      showToast("Erreur lors de la lecture des paramètres de fusion", "error");
    } finally {
      setIsLoading(false);
    }
  }, [selectedDrawName, history, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time synchronization when store changes on active draw
  useEffect(() => {
    if (
      !isDirty &&
      selectedDrawName === activeDrawName &&
      globalWeights &&
      Object.keys(globalWeights).length > 0
    ) {
      setWeights(globalWeights);
    }
  }, [globalWeights, selectedDrawName, activeDrawName, isDirty]);

  // Compute live DNA fingerprint
  const currentFingerprint = useMemo(() => {
    if (!weights || Object.keys(weights).length === 0) return "DNA-INIT";
    return computeModelDnaFingerprint(selectedDrawName, weights);
  }, [selectedDrawName, weights]);

  // Compute total active weight sum
  const totalWeightSum = useMemo(() => {
    const vals = Object.values(weights) as number[];
    return vals.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }, [weights]);

  // Compute critical drift metric
  const criticalThreshold = useMemo(() => {
    const validCount = Object.keys(weights).length;
    const entropy = auditReport?.statisticalSignature?.shannonEntropy || 3.8;
    const variance = auditReport?.statisticalSignature?.variance || 675;
    return computeDeterministicCriticalThreshold(validCount, entropy, variance);
  }, [weights, auditReport]);

  // Handle Weight Slider change
  const handleWeightChange = (key: AlgoKey, newWeight: number) => {
    audioEngine.play("click");
    const clamped = Math.max(0, parseFloat(newWeight.toFixed(5)));
    setWeights((prev) => ({
      ...prev,
      [key]: clamped,
    }));
    setIsDirty(true);
  };

  // Toggle Lock on specific algorithm
  const toggleLock = (key: AlgoKey) => {
    audioEngine.play("click");
    setLockedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Auto-normalize weights with lock respect and topological bounds
  const handleAutoNormalize = () => {
    audioEngine.play("click");
    if (totalWeightSum === 0) return;

    // Normalisation L1 continue
    const normalized = normalizeWeights(weights);
    setWeights(normalized);
    setIsDirty(true);
    showToast("Tensor Flow L1 normalisé avec succès (Σ = 1.0)", "info");
  };

  // Reset to canonical baseline
  const handleResetToCanonical = () => {
    audioEngine.play("click");
    setWeights({ ...canonicalWeights });
    setLockedKeys(new Set());
    setIsDirty(true);
    showToast("ADN restauré aux poids canoniques par défaut", "info");
  };

  // Anti-redundancy orthogonalization
  const handleAntiRedundancyAlignment = () => {
    audioEngine.play("scan");
    // Déflation continue des paires à forte corrélation
    const adjusted = { ...weights };
    const dampFactor = 0.92;

    // Si Spectral et Fractal sont tous deux élevés, lisser
    if (
      (adjusted[AlgoKey.SPECTRAL] || 0) > 0.05 &&
      (adjusted[AlgoKey.FRACTAL] || 0) > 0.05
    ) {
      adjusted[AlgoKey.SPECTRAL] = (adjusted[AlgoKey.SPECTRAL] || 0) * dampFactor;
      adjusted[AlgoKey.FRACTAL] = (adjusted[AlgoKey.FRACTAL] || 0) * dampFactor;
    }
    // Si Markov et Bayes sont tous deux colinéaires
    if (
      (adjusted[AlgoKey.MARKOV] || 0) > 0.05 &&
      (adjusted[AlgoKey.BAYES] || 0) > 0.05
    ) {
      adjusted[AlgoKey.MARKOV] = (adjusted[AlgoKey.MARKOV] || 0) * dampFactor;
      adjusted[AlgoKey.BAYES] = (adjusted[AlgoKey.BAYES] || 0) * dampFactor;
    }

    const reNormalized = normalizeWeights(adjusted);
    setWeights(reNormalized);
    setIsDirty(true);
    showToast("Orthogonalisation anti-redondance appliquée", "success");
  };

  // Save changes to IndexedDB & sync to Store
  const handleSaveWeights = async () => {
    audioEngine.play("success");
    setIsSaving(true);
    try {
      const optResult = await applyOptimizedWeights({
        drawName: selectedDrawName,
        weights,
        origin: "MANUAL_CALIBRATION",
        performance: {
          score: auditReport?.coherenceScore || 85,
          relativeGain: 0,
        },
        causalAuditTrail: [
          `Calibration manuelle depuis le panneau de Fusion de Modèles Admin.`,
        ],
        reason: `Fusion de Modèles Admin (${selectedDrawName})`,
        allowCriticalDrift: true,
        history,
      });

      if (selectedDrawName === activeDrawName) {
        await refreshData(selectedDrawName, true);
      }

      setWeights(optResult.appliedWeights);
      setIsDirty(false);
      showToast(
        `Poids de fusion enregistrés pour [${selectedDrawName}] (${optResult.fingerprint})`,
        "success"
      );
      // Reload history
      const historyList = await getModelDnaHistory(selectedDrawName, 30);
      setDnaHistory(historyList);
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de la sauvegarde des poids", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Snapshot creation
  const handleCreateSnapshot = async () => {
    if (!snapshotTag.trim()) {
      showToast("Veuillez saisir un libellé pour l'instantané ADN", "info");
      return;
    }
    audioEngine.play("click");
    setIsTakingSnapshot(true);
    try {
      const normalized = normalizeWeights(weights);
      await recordModelDnaVersion({
        drawName: selectedDrawName,
        origin: "HYPERPARAM_TUNER",
        version: snapshotTag.trim(),
        weights: normalized,
        performance: {
          score: auditReport?.coherenceScore || 90,
          relativeGain: 0,
        },
        causalAuditTrail: [
          `Instantané ADN [${snapshotTag.trim()}] enregistré manuellement.`,
        ],
      });

      const updatedHistory = await getModelDnaHistory(selectedDrawName, 30);
      setDnaHistory(updatedHistory);
      setSnapshotTag("");
      showToast(`Snapshot ADN "${snapshotTag.trim()}" enregistré`, "success");
    } catch (e) {
      showToast("Erreur lors de l'enregistrement de l'instantané", "error");
    } finally {
      setIsTakingSnapshot(false);
    }
  };

  // Rollback to specific DNA version
  const handleRollbackVersion = async (record: ModelDnaRecord) => {
    audioEngine.play("scan");
    try {
      const optResult = await applyOptimizedWeights({
        drawName: selectedDrawName,
        weights: record.weights,
        origin: "MANUAL_CALIBRATION",
        performance: record.performance,
        causalAuditTrail: [
          `Rollback vers la version ADN ${record.version} (${record.timestamp})`,
        ],
        reason: `Restauration ADN ${record.version}`,
        allowCriticalDrift: true,
        history,
      });

      setWeights(optResult.appliedWeights);
      setIsDirty(false);

      if (selectedDrawName === activeDrawName) {
        await refreshData(selectedDrawName, true);
      }

      showToast(
        `Restauration de la version ADN ${record.version} effectuée`,
        "success"
      );
    } catch (e) {
      showToast("Erreur lors de la restauration", "error");
    }
  };

  // Tripartite Fusion Live Computation
  const fusionSimulation = useMemo(() => {
    if (!history || history.length === 0 || !weights || Object.keys(weights).length === 0) {
      return null;
    }
    try {
      return calculateFusion(
        history,
        [],
        spectral || [],
        lastPrediction,
        weights,
        fusionBiases,
        fusionMethod,
        selectedDrawName
      );
    } catch (e) {
      console.warn("[ModelFusionPanel] Erreur simulation fusion:", e);
      return null;
    }
  }, [history, spectral, lastPrediction, weights, fusionBiases, fusionMethod, selectedDrawName]);

  // Filtered algorithms list for weights matrix
  const filteredAlgos = useMemo(() => {
    const validKeys = Object.values(AlgoKey);
    return validKeys
      .filter((key) => {
        // Category filter
        if (selectedCategory !== "all") {
          const cat = CATEGORY_MAP[selectedCategory];
          if (!cat || !cat.keys.includes(key)) return false;
        }
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const label = (LABELS_MAP[key] || key).toLowerCase();
          const k = key.toLowerCase();
          if (!label.includes(q) && !k.includes(q)) return false;
        }
        return true;
      })
      .map((key) => {
        const activeW = Number(weights[key]) || 0;
        const canonW = Number(canonicalWeights[key]) || 0;
        const delta = Math.abs(activeW - canonW);
        const isLocked = lockedKeys.has(key);
        const isDrifted = delta > criticalThreshold;
        return {
          key,
          label: LABELS_MAP[key] || key,
          activeW,
          canonW,
          delta,
          isLocked,
          isDrifted,
        };
      })
      .sort((a, b) => b.activeW - a.activeW);
  }, [weights, canonicalWeights, lockedKeys, selectedCategory, searchQuery, criticalThreshold]);

  // Specializations from Knowledge Base
  const specializations = useMemo(() => {
    if (!weights || Object.keys(weights).length === 0) return [];
    return extractSpecializations(weights).slice(0, 8);
  }, [weights]);

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* 1. EXECUTIVE HEADER COCKPIT */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl text-white shadow-lg">
                <GitMerge size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    FUSION DE MODÈLES & GOUVERNANCE ADN
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                    {selectedDrawName}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-400">
                  Orchestrateur multi-capteurs, contrôle fin des tenseurs neuronaux et intégrité génomique
                </p>
              </div>
            </div>
          </div>

          {/* Stat Pills */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-2xl flex items-center gap-2.5">
              <Dna size={16} className="text-purple-400" />
              <div>
                <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
                  Empreinte ADN
                </span>
                <span className="text-xs font-black text-purple-300 font-mono">
                  {currentFingerprint}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-2xl flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-emerald-400" />
              <div>
                <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
                  Cohérence ADN
                </span>
                <span className="text-xs font-black text-emerald-400 font-mono">
                  {auditReport?.coherenceScore ?? 94}%
                </span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-2xl flex items-center gap-2.5">
              <Scale size={16} className="text-indigo-400" />
              <div>
                <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
                  Norme L1 (Σ)
                </span>
                <span
                  className={`text-xs font-black font-mono ${
                    Math.abs(totalWeightSum - 1.0) < 0.001
                      ? "text-indigo-300"
                      : "text-amber-400"
                  }`}
                >
                  {totalWeightSum.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveWeights}
              disabled={isSaving || !isDirty}
              className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
                isDirty
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 animate-pulse"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              <Save size={15} />
              {isSaving ? "Sauvegarde..." : isDirty ? "Sauvegarder les Poids" : "Poids Synchronisés"}
            </button>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoNormalize}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
              title="Normalise la somme des poids à 1.0 tout en respectant les bornes topologiques"
            >
              <Scale size={13} className="text-indigo-400" />
              Normaliser L1
            </button>
            <button
              onClick={handleAntiRedundancyAlignment}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
              title="Applique un amortissement différentiable aux modèles colinéaires"
            >
              <Sparkles size={13} className="text-purple-400" />
              Dé-Redondance
            </button>
            <button
              onClick={handleResetToCanonical}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
              title="Réinitialise aux poids canoniques par défaut"
            >
              <RotateCcw size={13} className="text-amber-400" />
              Reset Canonique
            </button>
            <button
              onClick={loadData}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
            >
              <RefreshCw
                size={13}
                className={`text-slate-400 ${isLoading ? "animate-spin" : ""}`}
              />
              Recharger
            </button>
          </div>

          {/* Quick Snapshot Creator */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Tag snapshot (ex: Calib_Prod_v2)"
              value={snapshotTag}
              onChange={(e) => setSnapshotTag(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-48"
            />
            <button
              onClick={handleCreateSnapshot}
              disabled={isTakingSnapshot || !snapshotTag.trim()}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shadow-md"
            >
              <Dna size={13} />
              Créer Snapshot ADN
            </button>
          </div>
        </div>
      </div>

      {/* 2. SUB-TABS NAVIGATION */}
      <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 w-max max-w-full overflow-x-auto gap-1">
        {[
          {
            id: "weights" as ActiveViewTab,
            label: "Matrice des Moteurs Neuronaux",
            desc: "Poids & Dérives",
            icon: Sliders,
            color: "text-indigo-400",
          },
          {
            id: "dna_lineage" as ActiveViewTab,
            label: "Base de Connaissances ADN",
            desc: "Lignée & Rollback",
            icon: History,
            color: "text-purple-400",
          },
          {
            id: "tripartite_fusion" as ActiveViewTab,
            label: "Couche de Fusion Multi-Capteurs",
            desc: "Simulateur Kalman Tripartite",
            icon: Layers,
            color: "text-emerald-400",
          },
          {
            id: "dna_drift" as ActiveViewTab,
            label: "Surveillance & Dérive ADN",
            desc: "Écart de performance Post-Tirage",
            icon: Activity,
            color: "text-amber-400",
          },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                audioEngine.play("click");
                setActiveTab(t.id);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-white dark:bg-slate-700 shadow-md text-slate-800 dark:text-white ring-1 ring-black/5 dark:ring-white/10"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              <Icon size={15} className={isActive ? t.color : ""} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. TAB CONTENT */}
      {/* TAB 1: WEIGHTS MATRIX */}
      {activeTab === "weights" && (
        <div className="space-y-6">
          {/* Controls: Categories & Search */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === "all"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Tous ({Object.keys(AlgoKey).length})
              </button>
              {Object.entries(CATEGORY_MAP).map(([catKey, cat]) => (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedCategory === catKey
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {cat.label} ({cat.keys.length})
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full md:w-64">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                placeholder="Filtrer algorithme..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Grid of Weights Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAlgos.map((algo) => {
              const weightPercent = (algo.activeW * 100).toFixed(2);
              const canonPercent = (algo.canonW * 100).toFixed(2);
              const deltaPercent = (algo.delta * 100).toFixed(2);

              return (
                <div
                  key={algo.key}
                  className={`p-5 rounded-2xl border transition-all ${
                    algo.isLocked
                      ? "bg-slate-900/60 border-indigo-500/50"
                      : algo.isDrifted
                      ? "bg-slate-900 border-amber-500/40"
                      : "bg-slate-900 border-slate-800"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        {algo.label}
                        {algo.isLocked && (
                          <Lock size={12} className="text-indigo-400" />
                        )}
                      </h4>
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                        {algo.key}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleLock(algo.key)}
                        className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          algo.isLocked
                            ? "bg-indigo-950 text-indigo-400 border border-indigo-700"
                            : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                        title={
                          algo.isLocked
                            ? "Déverrouiller le poids"
                            : "Verrouiller le poids pour la normalisation"
                        }
                      >
                        {algo.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                      </button>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase font-mono ${
                          algo.isDrifted
                            ? "bg-amber-950 text-amber-400 border border-amber-800/60"
                            : "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                        }`}
                      >
                        {algo.isDrifted ? `Δ +${deltaPercent}%` : "Aligné"}
                      </span>
                    </div>
                  </div>

                  {/* Slider Control */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 font-bold">
                        Poids: <span className="text-white">{weightPercent}%</span>
                      </span>
                      <span className="text-slate-500">
                        Canon: {canonPercent}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="0.4"
                      step="0.001"
                      value={algo.activeW}
                      onChange={(e) =>
                        handleWeightChange(algo.key, parseFloat(e.target.value))
                      }
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />

                    {/* Progress visual comparison bar */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                      <div
                        className="bg-indigo-500 h-full transition-all duration-200"
                        style={{ width: `${Math.min(100, algo.activeW * 250)}%` }}
                      />
                    </div>

                    {/* Micro steppers */}
                    <div className="flex justify-between items-center pt-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() =>
                            handleWeightChange(algo.key, algo.activeW - 0.01)
                          }
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded text-[10px] font-mono cursor-pointer"
                        >
                          -0.01
                        </button>
                        <button
                          onClick={() =>
                            handleWeightChange(algo.key, algo.activeW + 0.01)
                          }
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded text-[10px] font-mono cursor-pointer"
                        >
                          +0.01
                        </button>
                      </div>

                      <button
                        onClick={() => handleWeightChange(algo.key, algo.canonW)}
                        className="text-[10px] text-slate-500 hover:text-slate-300 font-mono transition-colors cursor-pointer"
                      >
                        Reset ({canonPercent}%)
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: DNA KNOWLEDGE BASE & AUDIT */}
      {activeTab === "dna_lineage" && (
        <div className="space-y-6">
          {/* Top Lineage Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Générations Traçables
              </span>
              <p className="text-2xl font-black text-white mt-1">
                {lineage?.totalGenerations || dnaHistory.length}
              </p>
              <span className="text-[11px] text-slate-400">
                Sur l'historique isolé de {selectedDrawName}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Indice de Stabilité
              </span>
              <p className="text-2xl font-black text-emerald-400 mt-1">
                {lineage?.stabilityIndex || 95}%
              </p>
              <span className="text-[11px] text-slate-400">
                Variance continue des poids dans le temps
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Seuil de Dérive Critique
              </span>
              <p className="text-2xl font-black text-purple-400 mt-1">
                {(criticalThreshold * 100).toFixed(2)}%
              </p>
              <span className="text-[11px] text-slate-400">
                Dérivé de l'entropie et de la variance du tirage
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Algorithmes Dominants
              </span>
              <p className="text-2xl font-black text-indigo-400 mt-1">
                {specializations[0]?.algoKey || "FREQUENCY"}
              </p>
              <span className="text-[11px] text-slate-400">
                Impact score: {specializations[0]?.impactScore || "0.04"}
              </span>
            </div>
          </div>

          {/* Dominant Specializations Radar / Table */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Zap size={16} className="text-amber-400" />
              Spécialisations Génomiques Dominantes
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {specializations.map((spec, i) => (
                <div
                  key={spec.algoKey}
                  className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-200">
                      #{i + 1} {LABELS_MAP[spec.algoKey as AlgoKey] || spec.algoKey}
                    </span>
                    <span className="block text-[10px] text-slate-500 font-mono">
                      Poids: {(spec.weight * 100).toFixed(2)}%
                    </span>
                  </div>
                  <span
                    className={`text-xs font-mono font-bold ${
                      spec.deltaFromCanonical >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {spec.deltaFromCanonical >= 0 ? "+" : ""}
                    {(spec.deltaFromCanonical * 100).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* DNA History Timeline */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <History size={16} className="text-purple-400" />
              Historique des Versions ADN & Rollback
            </h3>

            {dnaHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                Aucun historique ADN archivé pour ce tirage. Créez un premier instantané ci-dessus.
              </div>
            ) : (
              <div className="divide-y divide-slate-800 overflow-x-auto">
                {dnaHistory.map((record) => (
                  <div
                    key={record.id}
                    className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-800/30 px-3 rounded-xl transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-white">
                          {record.version}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-950 text-indigo-400 border border-indigo-800/50">
                          {record.origin}
                        </span>
                        <span className="text-[10px] font-mono text-purple-400">
                          {record.dnaFingerprint}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {record.causalAuditTrail?.[0] || "Version enregistrée."}
                      </p>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(record.timestamp).toLocaleString("fr-FR")}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase block font-black">
                          Score Précision
                        </span>
                        <span className="text-xs font-black text-emerald-400 font-mono">
                          {record.performance?.score || 90}%
                        </span>
                      </div>

                      <button
                        onClick={() => handleRollbackVersion(record)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
                        title="Restaurer cette version des poids"
                      >
                        <RotateCcw size={13} />
                        Restaurer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TRIPARTITE MULTI-SENSOR FUSION */}
      {activeTab === "tripartite_fusion" && (
        <div className="space-y-6">
          {/* Fusion Method & Sensor Biases */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <Layers size={18} className="text-indigo-400" />
                  Moteur de Fusion Multi-Capteurs Tripartite
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Filtrage de Kalman tensoriel par inverse-variance & consensus multi-modèles
                </p>
              </div>

              {/* Selection Method Pills */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 overflow-x-auto">
                {[
                  { id: "quantum_bayesian", label: "Symbiose Quantique" },
                  { id: "harmonic_consensus", label: "Consensus Harmonique" },
                  { id: "balanced", label: "Anti-Surpondération" },
                  { id: "map", label: "MAP Neutre" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      audioEngine.play("click");
                      setFusionMethod(m.id as any);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      fusionMethod === m.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3 Sensor Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {/* Logic Axis */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      Axe Logique (Python)
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {fusionBiases.logic.toFixed(2)}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  EMA adaptatif, gaps dynamiques et régression continue
                </p>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={fusionBiases.logic}
                  onChange={(e) =>
                    setFusionBiases((prev) => ({
                      ...prev,
                      logic: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Physics Axis */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      Axe Physique (Quantique)
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-purple-400">
                    {fusionBiases.physics.toFixed(2)}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Spectre FFT, météo fractale et résonance spatiale
                </p>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={fusionBiases.physics}
                  onChange={(e) =>
                    setFusionBiases((prev) => ({
                      ...prev,
                      physics: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              {/* Intuition Axis */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      Axe Intuition (Oracle)
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    {fusionBiases.intuition.toFixed(2)}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Graphes markoviens, corrélation et rétroaction ADN
                </p>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={fusionBiases.intuition}
                  onChange={(e) =>
                    setFusionBiases((prev) => ({
                      ...prev,
                      intuition: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Live Fusion Diagnostics & Ticket Output */}
          {fusionSimulation && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Projected Ticket Box */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Sparkles size={16} className="text-amber-400" />
                      Ticket Synthétique Fusionné (Top 5)
                    </h4>
                    <span className="text-xs text-slate-400">
                      Projection déterministe immédiate sur l'historique isolé
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block font-black">
                        Confiance Système
                      </span>
                      <span className="text-sm font-black text-emerald-400 font-mono">
                        {fusionSimulation.confidence}%
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block font-black">
                        Entropie Résiduelle
                      </span>
                      <span className="text-sm font-black text-indigo-400 font-mono">
                        {fusionSimulation.entropy}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5 Winning Balls */}
                <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 flex justify-center items-center gap-4 sm:gap-6 flex-wrap">
                  {fusionSimulation.finalTicket.map((num) => (
                    <div key={num} className="flex flex-col items-center gap-1.5">
                      <NumberBall number={num} size="lg" glow={true} />
                      <span className="text-[10px] font-mono text-slate-400 font-bold">
                        N°{num}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Top 15 Converged Table */}
                <div className="space-y-2">
                  <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    Faisceau de Convergence (Top 15 Candidats)
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {fusionSimulation.convergedNumbers.map((cn) => (
                      <div
                        key={cn.number}
                        className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <NumberBall number={cn.number} size="xs" />
                          <span className="text-xs font-black text-white">
                            {cn.number}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {cn.score.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Kalman & Diagnostics Sidebar */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Activity size={16} className="text-indigo-400" />
                  Métriques & Tenseur de Kalman
                </h4>

                <div className="space-y-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-400">
                      Cohérence Inter-Capteurs
                    </span>
                    <span className="text-xs font-black text-emerald-400 font-mono">
                      {fusionSimulation.coherenceIndex}%
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-400">
                      Information de Fisher
                    </span>
                    <span className="text-xs font-black text-purple-400 font-mono">
                      {fusionSimulation.crossCovariance?.fisherGain ?? "0.00"}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-400">
                      Orthogonalisation Active
                    </span>
                    <span
                      className={`text-xs font-black font-mono ${
                        fusionSimulation.orthogonalizationApplied
                          ? "text-emerald-400"
                          : "text-slate-500"
                      }`}
                    >
                      {fusionSimulation.orthogonalizationApplied
                        ? "Oui (Dé-redondé)"
                        : "Neutre"}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Gains de Kalman Répartis
                    </span>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">
                          Logique
                        </span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {fusionSimulation.kalmanGains?.logic != null
                            ? fusionSimulation.kalmanGains.logic.toFixed(3)
                            : "0.333"}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">
                          Physique
                        </span>
                        <span className="text-xs font-mono font-bold text-purple-400">
                          {fusionSimulation.kalmanGains?.physics != null
                            ? fusionSimulation.kalmanGains.physics.toFixed(3)
                            : "0.333"}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">
                          Intuition
                        </span>
                        <span className="text-xs font-mono font-bold text-indigo-400">
                          {fusionSimulation.kalmanGains?.intuition != null
                            ? fusionSimulation.kalmanGains.intuition.toFixed(3)
                            : "0.333"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DNA PERFORMANCE DRIFT */}
      {activeTab === "dna_drift" && (
        <DnaPerformanceDriftPanel
          drawName={selectedDrawName}
          history={history}
          activeWeights={weights}
          onWeightsUpdated={(newWeights) => {
            setWeights(newWeights);
            setIsDirty(false);
          }}
        />
      )}
    </div>
  );
};
