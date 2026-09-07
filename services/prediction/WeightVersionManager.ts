import { AlgoWeights } from '../../types';
import { recordModelDnaGeneration } from './modelDnaKnowledgeBase';

export const WeightVersionManager = {
  saveVersion: async (
    drawName: string, 
    weights: AlgoWeights, 
    score: number, 
    relativeGain: number, 
    metadata: { source: string; forensicReportsCount: number; backtestSampleSize?: number }
  ) => {
    // 1. Enregistrement enrichi dans la Base de Connaissances ADN structurée
    try {
      const sourceKey = metadata.source === 'forensic_autopsy' 
        ? 'forensic_autopsy' 
        : (metadata.source === 'sgd' ? 'sgd' : 'hyperparameter_tuning');
      await recordModelDnaGeneration(drawName, weights, score, sourceKey, {
        relativeGain,
        metadata: {
          forensicReportsCount: metadata.forensicReportsCount,
          backtestSampleSize: metadata.backtestSampleSize,
        }
      });
    } catch (e) {
      console.warn("[WeightVersionManager] Erreur synchronisation base ADN:", e);
    }

    // 2. Maintien de la compatibilité ascendante localStorage
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
