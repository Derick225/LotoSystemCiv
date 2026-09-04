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
  NeuralFeedbackLog,
} from "../types";
import { getNextScheduledDraw, fetchResults } from "../services/lotteryService";
import {
  getAlgoWeights,
  saveAlgoWeights,
  normalizeWeights,
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
  neuralFeedbackLogs: NeuralFeedbackLog[];
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
  wavelet: any[];
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
  addNeuralFeedbackLogs: (logs: NeuralFeedbackLog[]) => void;
  setVocalContext: (ctx: OracleVocalContext | null) => void;
  setUseCloudEngine: (useCloud: boolean) => void;
  setUseSpatioTemporalHawkes: (use: boolean) => void;
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
      drawName: "",
      currentDrawName: "",
      inspectingNumber: null,
      hoveredNumber: null,
      activeMainTab: "Flux",
      activeSubTab: null,
      isFocusMode: false,

      globalWeights: {} as AlgoWeights, // Will be initialized by initialize or getAlgoWeights
      isForensicOptimized: false,
      isAutonomousAgentActive: typeof window !== "undefined" && window.localStorage && window.localStorage.getItem("nexus_enable_bg_autolearn") === "true" ? true : false,
      useSpatioTemporalHawkes: false,
      agentLogs: [],
      neuralFeedbackLogs: [],
      vocalContext: null,
      useCloudEngine: true,
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

        // Écouter l'hydratation cloud et les mises à jour de poids pour forcer le store à se synchroniser
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
            } catch (e) {
              console.error(
                "Failed to rehydrate NexusStore on cloud hydration:",
                e,
              );
            }
          });

          window.addEventListener("NEXUS_WEIGHTS_UPDATED", (e: any) => {
            const currentDraw = useNexusStore.getState().drawName;
            if (e?.detail?.drawName === currentDraw && e?.detail?.weights) {
              const currentWeights = useNexusStore.getState().globalWeights;
              if (JSON.stringify(currentWeights) !== JSON.stringify(e.detail.weights)) {
                set({ globalWeights: e.detail.weights });
              }
            }
          });
        }

        const nextDraw = getNextScheduledDraw();
        const currentDraw = get().drawName;
        
        if (!currentDraw && nextDraw) {
          set({ drawName: nextDraw.name, currentDrawName: nextDraw.name });

          // On initialise aussi les poids si le store est vide
          const { globalWeights } = get();
          if (Object.keys(globalWeights).length === 0) {
            const weights = await getAlgoWeights(nextDraw.name);
            set({ globalWeights: weights });
          }
        } else if (currentDraw) {
          // Si on a déjà un tirage actif, on s'assure de charger ses poids s'ils sont vides
          const { globalWeights } = get();
          if (Object.keys(globalWeights).length === 0) {
            const weights = await getAlgoWeights(currentDraw);
            set({ globalWeights: weights });
          }
        }
      },

      setDrawName: (name) => {
        set({ drawName: name, currentDrawName: name });
        if (name) {
          getAlgoWeights(name).then((weights) => {
            if (get().drawName === name) {
              set({ globalWeights: weights });
            }
          }).catch(() => {});
        }
      },
      setInspectingNumber: (num) => set({ inspectingNumber: num }),
      setHoveredNumber: (num) => set({ hoveredNumber: num }),
      setFocusMode: (focus) => set({ isFocusMode: focus }),
      navigateToModule: (mainTab, subTab = null) =>
        set({ activeMainTab: mainTab, activeSubTab: subTab }),
      setGlobalWeights: (weights) => {
        const currentDraw = get().drawName;
        const normalized = normalizeWeights(weights);
        set({ globalWeights: normalized });
        if (currentDraw) {
          saveAlgoWeights(currentDraw, normalized).catch((err) => {
            console.error("Failed to persist global weights:", err);
          });
        }
      },
      setForensicOptimized: (opt) => set({ isForensicOptimized: opt }),
      setAutonomousAgentActive: (active) => {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("nexus_enable_bg_autolearn", active ? "true" : "false");
        }
        set({ isAutonomousAgentActive: active });
      },
      addAgentLog: (log) =>
        set((s) => ({ agentLogs: [log, ...s.agentLogs].slice(0, 15) })),
      addNeuralFeedbackLogs: (logs) =>
        set((s) => ({
          neuralFeedbackLogs: [...logs, ...s.neuralFeedbackLogs].slice(0, 100),
        })),
      setVocalContext: (ctx) => set({ vocalContext: ctx }),
      setUseCloudEngine: (useCloud) => set({ useCloudEngine: useCloud }),
      setUseSpatioTemporalHawkes: (use) => set({ useSpatioTemporalHawkes: use }),
      setTemporalDepth: (depth) => set({ temporalDepth: depth }),
      setLastPrediction: (pred) => set({ lastPrediction: pred }),
      setSmartInsights: (insights) => set({ smartInsights: insights }),
      setCalibration: (cal) => set({ calibration: cal }),
      setEmpiricalCalibration: (cal) => set({ empiricalCalibration: cal }),

      setHistoryData: (history, stats, gaps) => set({ history, stats, gaps }),
      setAnalyticsData: (analytics) =>
        set({
          spectral: analytics?.spectral || [],
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
          const historyData = data || [];
          
          const counts: Record<number, number> = {};
          historyData.forEach((d) =>
            (d.gagnants || []).forEach((n) => {
              if (n >= 1 && n <= 90) counts[n] = (counts[n] || 0) + 1;
            })
          );
          const stats = Object.entries(counts)
            .map(([n, c]) => ({ number: Number(n), count: c }))
            .sort((a, b) => b.count - a.count);

          // Calcul des écarts en 1 seule passe linéaire O(N*5) avec terminaison anticipée
          const gapsMap = new Map<number, number>();
          for (let i = 1; i <= 90; i++) gapsMap.set(i, -1);
          let foundCount = 0;
          for (let dIdx = 0; dIdx < historyData.length && foundCount < 90; dIdx++) {
            const winners = historyData[dIdx].gagnants || [];
            for (let g = 0; g < winners.length; g++) {
              const num = winners[g];
              if (gapsMap.get(num) === -1) {
                gapsMap.set(num, dIdx);
                foundCount++;
              }
            }
          }
          const gaps = Array.from({ length: 90 }, (_, idx) => {
            const num = idx + 1;
            const g = gapsMap.get(num);
            return { number: num, gap: g === -1 ? historyData.length : g! };
          });

          set({ history: historyData, stats, gaps });
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

// --- ATOMIC SELECTORS FOR SUB-TABS AND COMPONENTS ---
// State selectors
export const useNexusDrawName = () => useNexusStore((s) => s.drawName);
export const useNexusCurrentDrawName = () => useNexusStore((s) => s.currentDrawName);
export const useNexusInspectingNumber = () => useNexusStore((s) => s.inspectingNumber);
export const useNexusHoveredNumber = () => useNexusStore((s) => s.hoveredNumber);
export const useNexusActiveMainTab = () => useNexusStore((s) => s.activeMainTab);
export const useNexusActiveSubTab = () => useNexusStore((s) => s.activeSubTab);
export const useNexusIsFocusMode = () => useNexusStore((s) => s.isFocusMode);

// Config & Settings selectors
export const useNexusGlobalWeights = () => useNexusStore((s) => s.globalWeights);
export const useNexusIsForensicOptimized = () => useNexusStore((s) => s.isForensicOptimized);
export const useNexusIsAutonomousAgentActive = () => useNexusStore((s) => s.isAutonomousAgentActive);
export const useNexusAgentLogs = () => useNexusStore((s) => s.agentLogs);
export const useNexusNeuralFeedbackLogs = () => useNexusStore((s) => s.neuralFeedbackLogs);
export const useNexusVocalContext = () => useNexusStore((s) => s.vocalContext);
export const useNexusUseCloudEngine = () => useNexusStore((s) => s.useCloudEngine);
export const useNexusUseSpatioTemporalHawkes = () => useNexusStore((s) => s.useSpatioTemporalHawkes);
export const useNexusTemporalDepth = () => useNexusStore((s) => s.temporalDepth);

// Data selectors
export const useNexusHistory = () => useNexusStore((s) => s.history);
export const useNexusStats = () => useNexusStore((s) => s.stats);
export const useNexusGaps = () => useNexusStore((s) => s.gaps);

// Analytics selectors
export const useNexusSpectral = () => useNexusStore((s) => s.spectral);
export const useNexusWavelet = () => useNexusStore((s) => s.wavelet);
export const useNexusFractal = () => useNexusStore((s) => s.fractal);
export const useNexusVolatility = () => useNexusStore((s) => s.volatility);
export const useNexusRegime = () => useNexusStore((s) => s.regime);
export const useNexusCorrelationMatrix = () => useNexusStore((s) => s.correlationMatrix);
export const useNexusRegularity = () => useNexusStore((s) => s.regularity);
export const useNexusSymbioticContext = () => useNexusStore((s) => s.symbioticContext);

// Engine selectors
export const useNexusLastPrediction = () => useNexusStore((s) => s.lastPrediction);
export const useNexusSmartInsights = () => useNexusStore((s) => s.smartInsights);
export const useNexusCalibration = () => useNexusStore((s) => s.calibration);
export const useNexusEmpiricalCalibration = () => useNexusStore((s) => s.empiricalCalibration);
export const useNexusLoading = () => useNexusStore((s) => s.loading);

// Actions selectors
export const useNexusActions = () =>
  useNexusStore((s) => ({
    setDrawName: s.setDrawName,
    setInspectingNumber: s.setInspectingNumber,
    setHoveredNumber: s.setHoveredNumber,
    setFocusMode: s.setFocusMode,
    navigateToModule: s.navigateToModule,
    setGlobalWeights: s.setGlobalWeights,
    setForensicOptimized: s.setForensicOptimized,
    setAutonomousAgentActive: s.setAutonomousAgentActive,
    addAgentLog: s.addAgentLog,
    addNeuralFeedbackLogs: s.addNeuralFeedbackLogs,
    setVocalContext: s.setVocalContext,
    setUseCloudEngine: s.setUseCloudEngine,
    setUseSpatioTemporalHawkes: s.setUseSpatioTemporalHawkes,
    setTemporalDepth: s.setTemporalDepth,
    setLastPrediction: s.setLastPrediction,
    setSmartInsights: s.setSmartInsights,
    setCalibration: s.setCalibration,
    setEmpiricalCalibration: s.setEmpiricalCalibration,
    setHistoryData: s.setHistoryData,
    setAnalyticsData: s.setAnalyticsData,
    setLoading: s.setLoading,
    refreshData: s.refreshData,
    updateGlobalWeights: s.updateGlobalWeights,
    refresh: s.refresh,
    resetInfrastructure: s.resetInfrastructure,
  }));

