
import { registerAlgorithm } from '../algorithmRegistry';
import { frequencyPlugin } from './frequency';
import { gapsPlugin } from './gaps';
import { markovPlugin } from './markov';
import { momentumPlugin } from './momentum';
import { affinityPlugin } from './affinity';
import { spectralPlugin, fractalPlugin } from './signals';
import { spatialPlugin } from './spatial';
import { temporalPlugin, bayesPlugin } from './temporalBayes';
import { echoStateNetworkPlugin } from './echoState';
import { gapSequencePlugin } from './gapSequence';
import { gapPatternPlugin } from './gapPattern';
import { sequencePatternPlugin } from './sequencePattern';
import { derivedNeighborPlugin } from './derivedNeighbor';
import { gapCadencePlugin } from './gapCadence';
import { gapTrendPlugin } from './gapTrend';
import { interMonthlyResonancePlugin } from './interMonthlyResonance';
import { gapRangeSequencePlugin } from './gapRangeSequence';
import { machineTransferPlugin } from './machineTransfer';
import { 
  shadowProbabilityPlugin, 
  networkCorrelationPlugin, 
  isolationAnomalyPlugin,
} from './advancedTopology';

/**
 * Initialisation du Registre des Algorithmes
 * Enregistre uniquement les algorithmes clés évitant la redondance théorique.
 */
export const initCoreAlgorithms = () => {
  registerAlgorithm(frequencyPlugin);
  registerAlgorithm(gapsPlugin);
  registerAlgorithm(markovPlugin);
  registerAlgorithm(momentumPlugin);
  registerAlgorithm(affinityPlugin);
  
  registerAlgorithm(spectralPlugin);
  registerAlgorithm(fractalPlugin);
  
  registerAlgorithm(spatialPlugin);
  registerAlgorithm(temporalPlugin);
  registerAlgorithm(bayesPlugin);
  registerAlgorithm(echoStateNetworkPlugin);
  
  // Nouvelles topologies déterministes
  registerAlgorithm(shadowProbabilityPlugin);
  registerAlgorithm(networkCorrelationPlugin);
  registerAlgorithm(isolationAnomalyPlugin);

  // Séquences, écarts et transformations
  registerAlgorithm(gapSequencePlugin);
  registerAlgorithm(gapPatternPlugin);
  registerAlgorithm(sequencePatternPlugin);
  registerAlgorithm(derivedNeighborPlugin);
  registerAlgorithm(gapCadencePlugin);
  registerAlgorithm(gapTrendPlugin);
  registerAlgorithm(interMonthlyResonancePlugin);
  registerAlgorithm(gapRangeSequencePlugin);
  registerAlgorithm(machineTransferPlugin);
};

// Exécution immédiate de l'initialisation
initCoreAlgorithms();
