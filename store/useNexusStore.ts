import { create, StateCreator } from "zustand";
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
import {
  getAlgoWeights,
  saveAlgoWeights,
} from "../services/prediction/weightsManager";
import { EmpiricalCalibration } from "../shared/prediction.types";

export interface UiSlice {
  drawName: string;
  currentDrawName: string;
  inspectingNumber: number | null;
  hoveredNumber: number | null;
  activeMainTab: string;
  activeSubTab: string | null;
  isFocusMode: boolean;

  setDrawName: (name: string) => void;
  setInspectingNumber: (num: number | null) => void;
  setHoveredNumber: (num: number | null) => void;
  setFocusMode: (focus: boolean) => void;
  navigateToModule: (mainTab: string, subTab?: string | null) => void;
}

export interface SettingsSlice {
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
  setUseSpatioTemporalHawkes: (use: boolean) => void;
  setTemporalDepth: (depth: number) => void;
  updateGlobalWeights: (
    weights: AlgoWeights,
    targetDrawName?: string,
  ) => Promise<void>;
}

export interface DataSlice {
  history: DrawResult[];
  stats: { number: number; count: number }[];
  gaps: { number: number; gap: number }[];
  spectral: SpectralMetric[];
  wavelet: any[];
  fractal: FractalMetric[];
  volatility: VolatilityMetric | null;
  regime: GameRegime | null;
  correlationMatrix: Record<number, { affinities: Record<number, number> }>;
  regularity: NumberRegularity[];
  symbioticContext: SymbioticContext | null;

  setHistoryData: (
    history: DrawResult[],
    stats: { number: number; count: number }[],
    gaps: { number: number; gap: number }[],
  ) => void;
  setAnalyticsData: (analytics: AnalyticsData) => void;
  setLoading: (loading: boolean) => void;
  refreshData: (name: string, force?: boolean) => Promise<void>;
}

export interface PredictionSlice {
  lastPrediction: Prediction | null;
  smartInsights: SmartInsight[];
  calibration: CalibrationData | null;
  empiricalCalibration: EmpiricalCalibration | null;
  loading: boolean;

  setLastPrediction: (pred: Prediction | null) => void;
  setSmartInsights: (insights: SmartInsight[]) => void;
  setCalibration: (cal: CalibrationData | null) => void;
  setEmpiricalCalibration: (cal: EmpiricalCalibration) => void;
  refresh: () => Promise<void>;
  resetInfrastructure: () => void;
  initialize: () => void;
}

export interface NexusState
  extends UiSlice,
    SettingsSlice,
    DataSlice,
    PredictionSlice {}

// 1. UI Slice Creator
const createUiSlice: StateCreator<NexusState, [], [], UiSlice> = (set) => ({
  drawName: "Reveil",
  currentDrawName: "Reveil",
  inspectingNumber: null,
  hoveredNumber: null,
  activeMainTab: "Flux",
  activeSubTab: null,
  isFocusMode: false,

  setDrawName: (name) => set({ drawName: name, currentDrawName: name }),
  setInspectingNumber: (num) => set({ inspectingNumber: num }),
  setHoveredNumber: (num) => set({ hoveredNumber: num }),
  setFocusMode: (focus) => set({ isFocusMode: focus }),
  navigateToModule: (mainTab, subTab = null) =>
    set({ activeMainTab: mainTab, activeSubTab: subTab }),
});

// 2. Settings & Config Slice Creator
const createSettingsSlice: StateCreator<NexusState, [], [], SettingsSlice> = (set, get) => ({
  globalWeights: {} as AlgoWeights,
  isForensicOptimized: false,
  isAutonomousAgentActive: false,
  agentLogs: [],
  vocalContext: null,
  useCloudEngine: true,
  useSpatioTemporalHawkes: false,
  temporalDepth: 100,

  setGlobalWeights: (weights) => set({ globalWeights: weights }),
  setForensicOptimized: (opt) => set({ isForensicOptimized: opt }),
  setAutonomousAgentActive: (active) => set({ isAutonomousAgentActive: active }),
  addAgentLog: (log) => set((s) => ({ agentLogs: [log, ...s.agentLogs].slice(0, 15) })),
  setVocalContext: (ctx) => set({ vocalContext: ctx }),
  setUseCloudEngine: (useCloud) => set({ useCloudEngine: useCloud }),
  setUseSpatioTemporalHawkes: (use) => set({ useSpatioTemporalHawkes: use }),
  setTemporalDepth: (depth) => set({ temporalDepth: depth }),
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
});

// 3. Data & Analytics Slice Creator
const createDataSlice: StateCreator<NexusState, [], [], DataSlice> = (set) => ({
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
      set({ history: data });

      // Pre-calculate features asynchronously to warm up IndexedDB and Memory Cache
      if (data && data.length > 0) {
        import("../services/prediction/featureExtractor").then(({ extractFeatures }) => {
          extractFeatures(name, data).catch(err => {
            console.error("[Precompute] Failed to warm up features for:", name, err);
          });
        }).catch(err => {
          console.error("[Precompute] Failed to load featureExtractor module:", err);
        });
      }
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      set({ loading: false });
    }
  },
});

// 4. Engine & Prediction Slice Creator
const createPredictionSlice: StateCreator<NexusState, [], [], PredictionSlice> = (set, get) => ({
  lastPrediction: null,
  smartInsights: [],
  calibration: null,
  empiricalCalibration: null,
  loading: true,

  setLastPrediction: (pred) => set({ lastPrediction: pred }),
  setSmartInsights: (insights) => set({ smartInsights: insights }),
  setCalibration: (cal) => set({ calibration: cal }),
  setEmpiricalCalibration: (cal) => set({ empiricalCalibration: cal }),

  refresh: async () => {
    const { drawName } = get();
    await get().refreshData(drawName, true);
  },

  resetInfrastructure: () => {
    if (typeof window !== "undefined") {
      import("idb-keyval").then(({ clear }) => {
        clear();
        window.localStorage.removeItem("nexus_safety_boot");
        window.localStorage.removeItem("nexus-storage");
        window.localStorage.setItem("nexus-cloud-disabled", "true");
        window.location.reload();
      });
    }
  },

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
          const state = useNexusStore.getState();
          const currentDraw = state.drawName;
          if (currentDraw) {
            const weights = await getAlgoWeights(currentDraw);
            set({ globalWeights: weights });

            // Warm up cache for the persisted history (affinity, gaps, markov, etc.)
            if (state.history && state.history.length > 0) {
              import("../services/prediction/featureExtractor").then(({ extractFeatures }) => {
                extractFeatures(currentDraw, state.history).catch(() => {});
              }).catch(() => {});
            }
          }
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
});

export const useNexusStore = create<NexusState>()(
  persist(
    (...a) => ({
      ...createUiSlice(...a),
      ...createSettingsSlice(...a),
      ...createDataSlice(...a),
      ...createPredictionSlice(...a),
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
