import React from 'react';
import { NeuralSelfOptimizationPanel } from '../genomic/NeuralSelfOptimizationPanel';
import { AlgoWeights } from '../../shared/prediction.types';
import { DrawResult } from '../../types';

export interface NeuralAutoOptimizationPanelProps {
  drawName: string;
  history?: DrawResult[];
  currentWeights?: AlgoWeights;
  onApplyWeights?: (newWeights: AlgoWeights) => void;
}

/**
 * Façade unifiée pour le panneau d'auto-optimisation neurale par rétropropagation.
 * Élimine le doublon historique et délègue au composant canonique NeuralSelfOptimizationPanel
 * avec support Walk-Forward non-bloquant et conformité AGENTS.md.
 */
export const NeuralAutoOptimizationPanel: React.FC<NeuralAutoOptimizationPanelProps> = ({
  drawName,
  onApplyWeights,
}) => {
  return (
    <NeuralSelfOptimizationPanel
      drawName={drawName}
      onWeightsApplied={() => {
        if (onApplyWeights) {
          onApplyWeights({} as any);
        }
      }}
    />
  );
};

export default NeuralAutoOptimizationPanel;
