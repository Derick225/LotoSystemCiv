import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AlgoWeights, Prediction, SmartInsight, OracleVocalContext, RiskProfile, DrawResult, AnalyticsData, CalibrationData } from '../types';
import { getNextScheduledDraw, fetchResults } from '../services/lotteryService';
import { saveAlgoWeights } from '../services/prediction/weightsManager';

interface NexusState {
  // UI State
  drawName: string;
  currentDrawName: string;
  inspectingNumber: number | null;
  hoveredNumber: number | null;
  
  // Settings & Config
  riskProfile: RiskProfile;
  globalWeights: AlgoWeights;
  vocalContext: OracleVocalContext | null;
  useCloudEngine: boolean;
  
  // Data State
  history: DrawResult[];
  stats: { number: number; count: number }[];
  gaps: { number: number; gap: number }[];
  
  // Analytics State
  spectral: any[];
  wavelet: any[];
  fractal: any[];
  volatility: any | null;
  regime: any | null;
  correlationMatrix: any;
  regularity: any[];
  symbioticContext: any | null;
  
  // Engine State
  lastPrediction: Prediction | null;
  smartInsights: SmartInsight[];
  calibration: CalibrationData | null;
  loading: boolean;

  // Actions
  setDrawName: (name: string) => void;
  setInspectingNumber: (num: number | null) => void;
  setHoveredNumber: (num: number | null) => void;
  setRiskProfile: (profile: RiskProfile) => void;
  setGlobalWeights: (weights: AlgoWeights) => void;
  setVocalContext: (ctx: OracleVocalContext | null) => void;
  setUseCloudEngine: (useCloud: boolean) => void;
  setLastPrediction: (pred: Prediction | null) => void;
  setSmartInsights: (insights: SmartInsight[]) => void;
  setCalibration: (cal: CalibrationData | null) => void;
  
  // Engine Actions
  setHistoryData: (history: DrawResult[], stats: { number: number; count: number }[], gaps: { number: number; gap: number }[]) => void;
  setAnalyticsData: (analytics: AnalyticsData) => void;
  setLoading: (loading: boolean) => void;
  refreshData: (name: string, force?: boolean) => Promise<void>;
  updateGlobalWeights: (weights: AlgoWeights) => Promise<void>;
  refresh: () => Promise<void>;
  initialize: () => void;
}

export const useNexusStore = create<NexusState>()(
  persist(
    (set, get) => ({
      drawName: 'Reveil',
      currentDrawName: 'Reveil',
      inspectingNumber: null,
      hoveredNumber: null,
      
      riskProfile: 'BALANCED',
      globalWeights: {} as AlgoWeights,
      vocalContext: null,
      useCloudEngine: false,
      
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
      loading: true,

      initialize: () => {
        const nextDraw = getNextScheduledDraw();
        if (nextDraw) {
            set({ drawName: nextDraw.name, currentDrawName: nextDraw.name });
        }
      },

      setDrawName: (name) => set({ drawName: name, currentDrawName: name }),
      setInspectingNumber: (num) => set({ inspectingNumber: num }),
      setHoveredNumber: (num) => set({ hoveredNumber: num }),
      setRiskProfile: (profile) => set({ riskProfile: profile }),
      setGlobalWeights: (weights) => set({ globalWeights: weights }),
      setVocalContext: (ctx) => set({ vocalContext: ctx }),
      setUseCloudEngine: (useCloud) => set({ useCloudEngine: useCloud }),
      setLastPrediction: (pred) => set({ lastPrediction: pred }),
      setSmartInsights: (insights) => set({ smartInsights: insights }),
      setCalibration: (cal) => set({ calibration: cal }),
      
      setHistoryData: (history, stats, gaps) => set({ history, stats, gaps }),
      setAnalyticsData: (analytics) => set({
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
            const { data } = await fetchResults(name);
            set({ history: data });
        } catch (error) {
            console.error("Failed to refresh data:", error);
        } finally {
            set({ loading: false });
        }
      },
      updateGlobalWeights: async (weights) => {
        set({ globalWeights: weights });
        const { drawName } = get();
        try {
            await saveAlgoWeights(drawName, weights);
        } catch (error) {
            console.error("Failed to save algo weights:", error);
        }
      },
      refresh: async () => {
        const { drawName } = get();
        await get().refreshData(drawName, true);
      }
    }),
    {
      name: 'nexus-storage',
      version: 2,
      partialize: (state) => ({ 
        riskProfile: state.riskProfile,
        globalWeights: state.globalWeights,
        drawName: state.drawName,
        useCloudEngine: state.useCloudEngine
      }),
    }
  )
);
