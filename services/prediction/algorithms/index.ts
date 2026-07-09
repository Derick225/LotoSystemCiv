
import { registerAlgorithm } from '../algorithmRegistry';
import { frequencyPlugin } from './frequency';
import { gapsPlugin } from './gaps';
import { markovPlugin } from './markov';
import { momentumPlugin } from './momentum';
import { affinityPlugin } from './affinity';
import { spectralPlugin, fractalPlugin } from './signals';
import { spatialPlugin } from './spatial';
import { temporalPlugin, bayesPlugin } from './temporalBayes';
import { decadePatternPlugin } from './decadePattern';
import { echoStateNetworkPlugin } from './echoState';
import { gapSequencePlugin } from './gapSequence';
import { derivedNeighborPlugin } from './derivedNeighbor';
import { 
  equilibriumPlugin, 
  shadowProbabilityPlugin, 
  networkCorrelationPlugin, 
  antiConsensusPlugin 
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
  registerAlgorithm(decadePatternPlugin);
  registerAlgorithm(echoStateNetworkPlugin);
  
  // Nouvelles topologies déterministes
  registerAlgorithm(equilibriumPlugin);
  registerAlgorithm(shadowProbabilityPlugin);
  registerAlgorithm(networkCorrelationPlugin);
  registerAlgorithm(antiConsensusPlugin);

  // Séquences, écarts et transformations
  registerAlgorithm(gapSequencePlugin);
  registerAlgorithm(derivedNeighborPlugin);
};

// Exécution immédiate de l'initialisation
initCoreAlgorithms();
