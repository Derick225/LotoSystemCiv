import { AlgoWeights } from '../../types';

export const WeightVersionManager = {
  saveVersion: async (
    drawName: string, 
    weights: AlgoWeights, 
    score: number, 
    relativeGain: number, 
    metadata: { source: string; forensicReportsCount: number; backtestSampleSize?: number }
  ) => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    
    try {
      const historyData = localStorage.getItem(`nexus_weights_history_${drawName}`);
      let history: any[] = historyData ? JSON.parse(historyData) : [];
      
      const version = {
          id: `v_${Date.now()}`,
          timestamp: new Date().toISOString(),
          drawName,
          weights,
          score,
          relativeGain,
          metadata
      };

      history.unshift(version);
      if (history.length > 50) history = history.slice(0, 50); 
      localStorage.setItem(`nexus_weights_history_${drawName}`, JSON.stringify(history));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('PREFERENCES_TRIGGER_SYNC'));
      }
    } catch (e) {
      console.error("[WeightVersionManager] Error saving version", e);
    }
  }
};
