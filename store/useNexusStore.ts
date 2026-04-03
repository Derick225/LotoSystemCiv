import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AlgoWeights, Prediction, SmartInsight, OracleVocalContext, RiskProfile, DrawResult } from '../types';
import { getNextScheduledDraw } from '../services/lotteryService';

interface NexusState {
  // UI State
  drawName: string;
  currentDrawName: string;
  inspectingNumber: number | null;
  hoveredNumber: number | null;
  isGodMode: boolean;
  
  // Settings & Config
  riskProfile: RiskProfile;
  globalWeights: AlgoWeights;
  vocalContext: OracleVocalContext | null;
  
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
  calibration: any;
  loading: boolean;

  // Actions
  setDrawName: (name: string) => void;
  setInspectingNumber: (num: number | null) => void;
  setHoveredNumber: (num: number | null) => void;
  toggleGodMode: () => void;
  setRiskProfile: (profile: RiskProfile) => void;
  setGlobalWeights: (weights: AlgoWeights) => void;
  setVocalContext: (ctx: OracleVocalContext | null) => void;
  setLastPrediction: (pred: Prediction | null) => void;
  setSmartInsights: (insights: SmartInsight[]) => void;
  setCalibration: (cal: any) => void;
  
  // Engine Actions
  setHistoryData: (history: DrawResult[], stats: any[], gaps: any[]) => void;
  setAnalyticsData: (analytics: any) => void;
  setLoading: (loading: boolean) => void;
  refreshData: (name: string, force?: boolean) => Promise<void>;
  updateGlobalWeights: (weights: AlgoWeights) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useNexusStore = create<NexusState>()(
  persist(
    (set, get) => ({
      drawName: getNextScheduledDraw()?.name || 'Reveil',
      currentDrawName: getNextScheduledDraw()?.name || 'Reveil',
      inspectingNumber: null,
      hoveredNumber: null,
      isGodMode: false,
      
      riskProfile: 'BALANCED',
      globalWeights: {} as AlgoWeights,
      vocalContext: null,
      
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

      setDrawName: (name) => set({ drawName: name, currentDrawName: name }),
      setInspectingNumber: (num) => set({ inspectingNumber: num }),
      setHoveredNumber: (num) => set({ hoveredNumber: num }),
      toggleGodMode: () => set((state) => ({ isGodMode: !state.isGodMode })),
      setRiskProfile: (profile) => set({ riskProfile: profile }),
      setGlobalWeights: (weights) => set({ globalWeights: weights }),
      setVocalContext: (ctx) => set({ vocalContext: ctx }),
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
        set({ drawName: name, currentDrawName: name });
        if (force) {
          // Will be handled by the engine component listening to drawName changes
        }
      },
      updateGlobalWeights: async (weights) => {
        set({ globalWeights: weights });
        // The actual saving will be handled by the engine or a side effect
      },
      refresh: async () => {
        // Handled by engine
      }
    }),
    {
      name: 'nexus-storage',
      partialize: (state) => ({ 
        isGodMode: state.isGodMode, 
        riskProfile: state.riskProfile
      }),
    }
  )
);
