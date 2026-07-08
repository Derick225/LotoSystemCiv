import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "./idbStorage";
import {
  AlgoWeights,
  Prediction,
  SmartInsight,
  OracleVocalContext,
  DrawResult,
  AnalyticsData,
  CalibrationData,
  SpectralMetric,
  FractalMetric,
  VolatilityMetric,
  GameRegime,
  NumberRegularity,
  SymbioticContext,
} from "../types";
import { getNextScheduledDraw, fetchResults } from "../services/lotteryService";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import {
  getAlgoWeights,
  saveAlgoWeights,
} from "../services/prediction/weightsManager";
import { EmpiricalCalibration } from "../shared/prediction.types";

interface NexusState {
  // UI State
  drawName: string;
  currentDrawName: string;
  inspectingNumber: number | null;
  hoveredNumber: number | null;
  activeMainTab: string;
  activeSubTab: string | null;
  isFocusMode: boolean;

  // Settings & Config
  globalWeights: AlgoWeights;
  isForensicOptimized: boolean;
  isAutonomousAgentActive: boolean;
  agentLogs: {
    id: string;
    timestamp: Date;
    action: string;
    type: "SCAN" | "AUTOTUNE" | "WARNING" | "OVERRIDE" | "META";
    impact?: string;
  }[];
  vocalContext: OracleVocalContext | null;
  useCloudEngine: boolean;
  useSpatioTemporalHawkes: boolean;
  temporalDepth: number;

  // Data State
  history: DrawResult[];
  stats: { number: number; count: number }[];
  gaps: { number: number; gap: number }[];

  // Analytics State
  spectral: SpectralMetric[];
  wavelet: SpectralMetric[];
  fractal: FractalMetric[];
  volatility: VolatilityMetric | null;
  regime: GameRegime | null;
  correlationMatrix: Record<number, { affinities: Record<number, number> }>;
  regularity: NumberRegularity[];
  symbioticContext: SymbioticContext | null;

  // Engine State
  lastPrediction: Prediction | null;
  smartInsights: SmartInsight[];
  calibration: CalibrationData | null;
  empiricalCalibration: EmpiricalCalibration | null;
  loading: boolean;

  // Actions
  setDrawName: (name: string) => void;
  setInspectingNumber: (num: number | null) => void;
  setHoveredNumber: (num: number | null) => void;
  setFocusMode: (focus: boolean) => void;
  navigateToModule: (mainTab: string, subTab?: string | null) => void;
  setGlobalWeights: (weights: AlgoWeights) => void;
  setForensicOptimized: (opt: boolean) => void;
  setAutonomousAgentActive: (active: boolean) => void;
  addAgentLog: (log: {
    id: string;
    timestamp: Date;
    action: string;
    type: "SCAN" | "AUTOTUNE" | "WARNING" | "OVERRIDE" | "META";
    impact?: string;
  }) => void;
  setVocalContext: (ctx: OracleVocalContext | null) => void;
  setUseCloudEngine: (useCloud: boolean) => void;
  setUseSpatioTemporalHawkes: (enabled: boolean) => void;
  setTemporalDepth: (depth: number) => void;
  setLastPrediction: (pred: Prediction | null) => void;
  setSmartInsights: (insights: SmartInsight[]) => void;
  setCalibration: (cal: CalibrationData | null) => void;
  setEmpiricalCalibration: (cal: EmpiricalCalibration) => void;

  // Engine Actions
  setHistoryData: (
    history: DrawResult[],
    stats: { number: number; count: number }[],
    gaps: { number: number; gap: number }[],
  ) => void;
  setAnalyticsData: (analytics: AnalyticsData) => void;
  setLoading: (loading: boolean) => void;
  refreshData: (name: string, force?: boolean) => Promise<void>;
  updateGlobalWeights: (
    weights: AlgoWeights,
    targetDrawName?: string,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  resetInfrastructure: () => void;
  initialize: () => void;
}

export const useNexusStore = create<NexusState>()(
  persist(
    (set, get) => ({
      drawName: "Reveil",
      currentDrawName: "Reveil",
      inspectingNumber: null,
      hoveredNumber: null,
      activeMainTab: "Flux",
      activeSubTab: null,
      isFocusMode: false,

      globalWeights: {} as AlgoWeights, // Will be initialized by initialize or getAlgoWeights
      isForensicOptimized: false,
      isAutonomousAgentActive: false,
      agentLogs: [],
      vocalContext: null,
      useCloudEngine: true,
      useSpatioTemporalHawkes: true,
      temporalDepth: 100,

      history: [],
      stats: [],
      gaps: [],

      spectral: [],
      wavelet: [],
      fractal: [],
      volatility: null,
      regime: null,
      correlationMatrix: {},
      regularity: [],
      symbioticContext: null,

      lastPrediction: null,
      smartInsights: [],
      calibration: null,
      empiricalCalibration: null,
      loading: true,

      initialize: async () => {
        // Safety boot check
        if (
          typeof window !== "undefined" &&
          window.localStorage.getItem("nexus_safety_boot") === "true"
        ) {
          window.localStorage.removeItem("nexus_safety_boot");
          console.warn(
            "Nexus s'est réinitialisé en mode de sécurité pour contourner une corruption de cache.",
          );
        }

        // Run Cache Garbage Collection to free up IndexedDB memory
        try {
          const { globalCache } =
            await import("../services/cache/CacheService");
          await globalCache.runGarbageCollection();
        } catch (e) {
          console.warn("Garbage collection skipped:", e);
        }

        // Écouter l'hydratation cloud pour forcer le store à se recharger depuis IndexedDB
        if (
          typeof window !== "undefined" &&
          !(window as any).__NEXUS_SYNC_REGISTERED__
        ) {
          (window as any).__NEXUS_SYNC_REGISTERED__ = true;
          window.addEventListener("PREFERENCES_HYDRATED", async () => {
            try {
              await useNexusStore.persist.rehydrate();
              const currentDraw = useNexusStore.getState().drawName;
              if (currentDraw) {
                const weights = await getAlgoWeights(currentDraw);
                set({ globalWeights: weights });
              }
              window.dispatchEvent(new CustomEvent('NEXUS_STORE_REHYDRATED'));
            } catch (e) {
              console.error(
                "Failed to rehydrate NexusStore on cloud hydration:",
                e,
              );
            }
          });
        }

        const nextDraw = getNextScheduledDraw();
        if (nextDraw) {
          set({ drawName: nextDraw.name, currentDrawName: nextDraw.name });

          // On initialise aussi les poids si le store est vide
          const { globalWeights } = get();
          if (Object.keys(globalWeights).length === 0) {
            const weights = await getAlgoWeights(nextDraw.name);
            set({ globalWeights: weights });
          }
        }
      },

      setDrawName: (name) => set({ drawName: name, currentDrawName: name }),
      setInspectingNumber: (num) => set({ inspectingNumber: num }),
      setHoveredNumber: (num) => set({ hoveredNumber: num }),
      setFocusMode: (focus) => set({ isFocusMode: focus }),
      navigateToModule: (mainTab, subTab = null) =>
        set({ activeMainTab: mainTab, activeSubTab: subTab }),
      setGlobalWeights: (weights) => set({ globalWeights: weights }),
      setForensicOptimized: (opt) => set({ isForensicOptimized: opt }),
      setAutonomousAgentActive: (active) =>
        set({ isAutonomousAgentActive: active }),
      addAgentLog: (log) =>
        set((s) => ({ agentLogs: [log, ...s.agentLogs].slice(0, 15) })),
      setVocalContext: (ctx) => set({ vocalContext: ctx }),
      setUseCloudEngine: (useCloud) => set({ useCloudEngine: useCloud }),
      setUseSpatioTemporalHawkes: (enabled) => set({ useSpatioTemporalHawkes: enabled }),
      setTemporalDepth: (depth) => set({ temporalDepth: depth }),
      setLastPrediction: (pred) => {
        if (pred !== null) {
          try {
            // Validation d'intégrité de la prédiction du moteur neural
            if (typeof pred !== "object") {
              throw new Error("La prédiction n'est pas un objet valide.");
            }
            if (!Array.isArray(pred.suggestedNumbers) || pred.suggestedNumbers.length === 0) {
              throw new Error("La liste des numéros suggérés (suggestedNumbers) est manquante ou vide.");
            }
            const hasInvalidSuggested = pred.suggestedNumbers.some(
              (n) => typeof n !== "number" || isNaN(n) || !isFinite(n) || n <= 0
            );
            if (hasInvalidSuggested) {
              throw new Error("La prédiction contient des numéros suggérés non numériques ou invalides (NaN/infinités).");
            }
            if (!Array.isArray(pred.candidates)) {
              throw new Error("La liste des numéros candidats (candidates) est absente ou corrompue.");
            }
            if (typeof pred.confidence !== "number" || isNaN(pred.confidence) || !isFinite(pred.confidence)) {
              throw new Error("La valeur de confiance (confidence) est invalide ou NaN.");
            }
            if (pred.confidence < 0 || pred.confidence > 100) {
              throw new Error(`L'indice de confiance (${pred.confidence}) est hors de l'intervalle légal [0, 100].`);
            }
            if (typeof pred.breakdown !== "object" || pred.breakdown === null) {
              throw new Error("La structure de répartition des scores (breakdown) est invalide.");
            }
            if (typeof pred.timestamp !== "number" || isNaN(pred.timestamp) || pred.timestamp <= 0) {
              throw new Error("L'horodatage de la prédiction (timestamp) est absent ou invalide.");
            }

            // Si l'intégrité est parfaite, on applique la mise à jour
            set({ lastPrediction: pred });

            // Notification d'agent de type SCAN confirmant la validation réussie
            const currentDraw = get().drawName;
            get().addAgentLog({
              id: `verify-${Date.now()}`,
              timestamp: new Date(),
              action: `Intégrité de la prédiction validée avec succès pour le tirage [${currentDraw}].`,
              type: "SCAN",
              impact: `${pred.suggestedNumbers.length} numéros, Confiance: ${pred.confidence.toFixed(1)}%`
            });

          } catch (error: any) {
            console.error("[NEXUS INTEGRITY CHECK] Erreur d'intégrité détectée sur la prédiction :", error.message);
            
            // Enregistrement d'un log d'avertissement d'intégrité bloquant pour l'agent
            get().addAgentLog({
              id: `warning-${Date.now()}`,
              timestamp: new Date(),
              action: `Corruption de prédiction interceptée ! ${error.message}`,
              type: "WARNING",
              impact: "Mise à jour de l'interface bloquée pour protéger la stabilité de l'UI."
            });

            // On lève l'erreur pour que l'appelant asynchrone reçoive l'information de l'échec d'intégrité
            throw error;
          }
        } else {
          set({ lastPrediction: null });
        }
      },
      setSmartInsights: (insights) => set({ smartInsights: insights }),
      setCalibration: (cal) => set({ calibration: cal }),
      setEmpiricalCalibration: (cal) => set({ empiricalCalibration: cal }),

      setHistoryData: (history, stats, gaps) => set({ history, stats, gaps }),
      setAnalyticsData: (analytics) =>
        set({
          spectral: analytics?.spectral || [],
          wavelet: analytics?.wavelet || [],
          fractal: analytics?.fractal || [],
          volatility: analytics?.volatility || null,
          regime: analytics?.regime || null,
          correlationMatrix: analytics?.correlationMatrix || {},
          regularity: analytics?.regularity || [],
          symbioticContext: analytics?.symbioticContext || null,
        }),
      setLoading: (loading) => set({ loading }),

      refreshData: async (name, force) => {
        set({ loading: true, drawName: name, currentDrawName: name });
        try {
          const { data } = await fetchResults(name, force);
          const purifiedData = purifyHistoryForDraw(name, data);
          set({ history: purifiedData });
        } catch (error) {
          console.error("Failed to refresh data:", error);
        } finally {
          set({ loading: false });
        }
      },
      updateGlobalWeights: async (weights, targetDrawName) => {
        const nameToSave = targetDrawName || get().drawName;
        if (nameToSave === get().drawName) {
          set({ globalWeights: weights });
        }
        try {
          await saveAlgoWeights(nameToSave, weights);
        } catch (error) {
          console.error("Failed to save algo weights:", error);
        }
      },
      refresh: async () => {
        const { drawName } = get();
        await get().refreshData(drawName, true);
      },
      resetInfrastructure: () => {
        if (typeof window !== "undefined") {
          import("idb-keyval").then(({ clear }) => {
            clear();
            window.localStorage.removeItem("nexus_safety_boot");
            window.localStorage.removeItem("nexus-storage"); // Keep this just in case old data exists
            window.localStorage.setItem("nexus-cloud-disabled", "true");
            window.location.reload();
          });
        }
      },
    }),
    {
      name: "nexus-storage",
      version: 2,
      partialize: (state) => ({
        globalWeights: state.globalWeights,
        drawName: state.drawName,
        useCloudEngine: state.useCloudEngine,
        useSpatioTemporalHawkes: state.useSpatioTemporalHawkes,
        temporalDepth: state.temporalDepth,
      }),
      storage:
        typeof window !== "undefined"
          ? createJSONStorage(() => idbStorage)
          : createJSONStorage(() => ({
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            })),
    },
  ),
);
