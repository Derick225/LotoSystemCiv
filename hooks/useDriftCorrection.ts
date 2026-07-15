import { useEffect } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { LearningService } from '../services/learningService';
import { useToast } from '../components/ui/Toast';

export const useDriftCorrection = (drawName: string, history: any[]) => {
  const isAutonomousAgentActive = useNexusStore((state) => state.isAutonomousAgentActive);
  const { showToast } = useToast();

  useEffect(() => {
    const checkForDrift = async () => {
      if (!history || history.length === 0 || !drawName) return;
      try {
        const { getPredictionHistoryAsync } = await import('../services/predictionHistoryService');
        const predictions = await getPredictionHistoryAsync(drawName);
        const driftResult = await LearningService.checkDrift(drawName, predictions, history);
        
        if (driftResult && driftResult.hasDrift) {
          if (isAutonomousAgentActive) {
            showToast(
              `Dérive détectée pour ${drawName} (${driftResult.reason}). Lancement de la boucle de correction active autonome...`,
              "info"
            );
            
            try {
              // 1. Appliquer les corrélations de dérive au moteur neuronal
              const { applyDriftCorrelationsToNeuralEngine } = await import("../services/training/driftCorrelationService");
              await applyDriftCorrelationsToNeuralEngine(drawName);
              
              // 2. Déclencher un auto-apprentissage complet
              const result = await LearningService.triggerAutoLearning(drawName, undefined, true, true);
              if (result && result.improvement && result.weights) {
                await useNexusStore.getState().updateGlobalWeights(result.weights, drawName);
                showToast(`Correction active appliquée avec succès : ADN stabilisé (${result.message}).`, "success");
              }
            } catch (corrErr) {
              console.error("Failed active drift correction:", corrErr);
            }
          } else {
            showToast(
              `Alerte Dérive Algorithmique : L'agent recommande un rééquilibrage via Autopsie Forensic pour ${drawName}. (${driftResult.reason})`,
              "error"
            );
          }
        }
      } catch (e) {
        console.error("Drift check failed", e);
      }
    };
    
    checkForDrift();
  }, [drawName, history?.length, isAutonomousAgentActive, showToast]);
};
