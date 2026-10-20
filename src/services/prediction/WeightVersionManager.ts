import { AlgoWeights } from '../../types';
import { recordModelDnaVersion, getModelDnaHistory, getModelEvolutionLineage, rollbackToModelDnaVersion, ModelDnaOrigin } from './modelDnaKnowledgeBase';

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

      // Synchronisation avec la Base de Connaissances ADN du Modèle
      let origin: ModelDnaOrigin = 'SGD_CYBERNETIC';
      if (metadata.source?.includes('autopsy') || metadata.source?.includes('forensic')) {
        origin = 'FORENSIC_AUTOPSY';
      } else if (metadata.source?.includes('genetic') || metadata.source?.includes('evolution')) {
        origin = 'GENETIC_EVOLUTION';
      } else if (metadata.source?.includes('tuner') || metadata.source?.includes('hyperparam')) {
        origin = 'HYPERPARAM_TUNER';
      }

      await recordModelDnaVersion({
        drawName,
        version: version.id,
        origin,
        weights,
        performance: {
          score,
          relativeGain,
        },
        causalAuditTrail: [
          `Optimisation source: ${metadata.source}`,
          `Rapports médico-légaux intégrés: ${metadata.forensicReportsCount}`,
          metadata.backtestSampleSize ? `Échantillon backtest: ${metadata.backtestSampleSize}` : 'Échantillon continu',
        ],
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('PREFERENCES_TRIGGER_SYNC'));
      }
    } catch (e) {
      console.error("[WeightVersionManager] Error saving version", e);
    }
  },

  getHistory: getModelDnaHistory,
  getLineage: getModelEvolutionLineage,
  rollback: rollbackToModelDnaVersion,
};
