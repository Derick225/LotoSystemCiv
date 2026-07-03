const fs = require('fs');
const path = require('path');
const algoDir = path.join(__dirname, 'services', 'prediction', 'algorithms');
fs.mkdirSync(algoDir, {recursive: true});

function write(name, code) { fs.writeFileSync(path.join(algoDir, name + '.ts'), code); }

const TEMPLATE = (name, key, category, weightDef, stability, desc, evalCode) => `
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const ${name}Plugin: AlgorithmPlugin = {
    key: AlgoKey.${key},
    category: '${category}',
    weightDefault: ${weightDef},
    stability: '${stability}',
    description: '${desc}',
    evaluate: (num, ctx) => {
        ${evalCode}
    }
};
`;

write('frequency', TEMPLATE('frequency', 'FREQUENCY', 'core', 0.05, 'stable', 'Fréquence historique normalisée.', 'return ((Number(ctx.features.freqMap[num]) || 0) / ctx.maxFreq) * 100;'));

write('gaps', TEMPLATE('gaps', 'GAPS', 'core', 0.10, 'stable', 'Évaluation des écarts entre les sorties vs écart théorique.', 'const currentGap = Number(ctx.features.gapsMap[num]) || 0; const theoreticalGap = 17; if (currentGap < theoreticalGap) return (currentGap / theoreticalGap) * 40; if (currentGap < theoreticalGap * 3) return 40 + ((currentGap - theoreticalGap) / (theoreticalGap * 2)) * 60; return 90;'));

write('markov', TEMPLATE('markov', 'MARKOV', 'core', 0.12, 'stable', 'Chaînes de Markov analysant la transition n -> n+1.', 'return ((Number(ctx.features.markovMap[num]) || 0) / ctx.maxMarkov) * 100;'));

write('machine_bias', TEMPLATE('machineBias', 'MACHINE_BIAS', 'core', 0.02, 'stable', 'Biais mécanique lié aux machines.', 'return ((Number(ctx.features.machineTransferMap[num]) || 0) / ctx.maxMachineTransfer) * 100;'));

write('momentum', TEMPLATE('momentum', 'MOMENTUM', 'core', 0.05, 'volatile', 'Vitesse de récurrence.', 'return Math.min(100, (Number(ctx.features.momentumMap[num]) || 0) * 30);'));

write('equilibrium', TEMPLATE('equilibrium', 'EQUILIBRIUM', 'core', 0.08, 'stable', 'Loi de l équilibre stochastique.', 'return Number(ctx.features.equilibriumMap[num]) || 50;'));

write('anti_consensus', TEMPLATE('antiConsensus', 'ANTI_CONSENSUS', 'advanced', 0.01, 'volatile', 'Pénalise les numéros trop populaires pour casser le consensus.', 'const acFreq = Number(ctx.features.antiConsensusMap[num]) || 0; if (acFreq === 0) return 80; if (acFreq === 1) return 100; if (acFreq > 3) return 20; return 60;'));

write('affinity', TEMPLATE('affinity', 'AFFINITY', 'advanced', 0.0, 'experimental', 'Affinités numériques. Optimisé pour éviter O(90x90).', 'let affinityScore = 0; const affinityArr = ctx.features.affinityMap[num]; if (affinityArr) { const keys = Object.keys(affinityArr); for(let i=0; i<Math.min(keys.length, 10); i++){ const c1 = Number(keys[i]); const markovProb = Number(ctx.features.markovMap[c1]) || 0; const affinityProb = Number(affinityArr[c1]) || 0; affinityScore += markovProb * affinityProb; } } return ctx.maxMarkov > 0 ? Math.min(100, (affinityScore / ctx.maxMarkov) * 100) : 0;'));

write('volatility', TEMPLATE('volatility', 'VOLATILITY_INDEX', 'experimental', 0.04, 'volatile', 'Indice de volatilité ajusté à la fréquence locale.', 'const v = ctx.advancedMetrics?.volatility; const baseScore = (typeof v === "object" && v !== null) ? ((v as { score?: number }).score || 50) : (Number(v) || 50); const localDev = Math.abs((Number(ctx.features.freqMap[num]) || 0) - (ctx.maxFreq / 2)); return Math.min(100, baseScore * (1 + localDev / (ctx.maxFreq + 1)));'));

write('monte_carlo', TEMPLATE('monteCarlo', 'MONTE_CARLO', 'experimental', 0.0, 'experimental', 'Simulation Monte Carlo stabilisée avec seed déterministe.', 'const contextSeed = (ctx.history[0] ? new Date(ctx.history[0].date).getTime() : 0) + num; return (((contextSeed * 16807) % 2147483647) / 2147483647) * 100;'));

write('stochastic_noise', TEMPLATE('stochasticNoise', 'STOCHASTIC_NOISE', 'experimental', 0.05, 'experimental', 'Bruit stochastique borné pour exploration mineure.', 'const affinityArr = ctx.features.affinityMap[num] || []; const sum = Object.values(affinityArr).reduce((a: number, b: any) => a + (Number(b) || 0), 0); return sum > 0.1 ? 55 : 45;'));

write('signals', `
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const spectralPlugin: AlgorithmPlugin = {
    key: AlgoKey.SPECTRAL, category: 'advanced', weightDefault: 0.14, stability: 'stable', description: 'Transformée de Fourier discrète.',
    evaluate: (num, ctx) => {
        const m = ctx.advancedMetrics?.spectral?.find((s: { number: number }) => s.number === num);
        return m ? Math.min(100, m.energy) : 0;
    }
};

export const waveletPlugin: AlgorithmPlugin = {
    key: AlgoKey.WAVELET, category: 'advanced', weightDefault: 0.05, stability: 'stable', description: 'Différentiel ondelettes.',
    evaluate: (num, ctx) => {
        const m = ctx.advancedMetrics?.wavelet?.find((s: { number: number }) => s.number === num);
        return m ? Math.min(100, m.energy) : 0;
    }
};

export const fractalPlugin: AlgorithmPlugin = {
    key: AlgoKey.FRACTAL, category: 'advanced', weightDefault: 0.03, stability: 'stable', description: 'Dimension de Hurst.',
    evaluate: (num, ctx) => {
        const m = ctx.advancedMetrics?.fractal?.find((s: { number: number }) => s.number === num);
        return m ? Math.min(100, m.hurst * 100) : 0;
    }
};
`);

write('advancedMappings', `
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

const directAdvancedMetricsMapping: Partial<Record<AlgoKey, string>> = {
    [AlgoKey.STRUCTURAL]: 'structural', [AlgoKey.TREND]: 'trend', [AlgoKey.POISSON]: 'poisson', [AlgoKey.BAYES]: 'bayes',
    [AlgoKey.TEMPORAL]: 'temporal', [AlgoKey.DIGITAL_ROOT]: 'digitalRoot', [AlgoKey.RESISTANCE]: 'resistance',
    [AlgoKey.GAP_VELOCITY]: 'gapVelocity', [AlgoKey.LEADER_SUCCESSION]: 'leaderSuccession', [AlgoKey.META_LLM_ENSEMBLE]: 'aiIntuition',
    [AlgoKey.FRACTAL_DIMENSION]: 'fractalResonance', [AlgoKey.PROXIMITY_DIAGNOSTIC]: 'proximityDiagnostic', [AlgoKey.MISSED_MODULATOR]: 'missedModulator',
    [AlgoKey.DRIFT_CORRECTION]: 'driftCorrection', [AlgoKey.SYMBIOTIC_CLUSTERS]: 'symbioticClusters', [AlgoKey.ENTROPY_REGIME]: 'entropyRegime',
    [AlgoKey.TRANSFORMER]: 'transformer'
};

export const mappingPlugins: AlgorithmPlugin[] = Object.entries(directAdvancedMetricsMapping).map(([key, prop]) => ({
    key: key as AlgoKey, category: 'meta', stability: 'volatile', description: 'Mapping dynamique pour ' + prop,
    evaluate: (num, ctx) => ((ctx.advancedMetrics as Record<string, Record<number, number>>)?.[prop]?.[num]) || 0
}));
`);

write('heuristics', `
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const anomalyDetectionPlugin: AlgorithmPlugin = {
    key: AlgoKey.ANOMALY_DETECTION, category: 'advanced', stability: 'experimental', description: 'Détection d\'anomalies.',
    evaluate: (num, ctx) => ctx.advancedMetrics?.anomalyDetection?.[num] || 0
};
export const spatialPlugin: AlgorithmPlugin = {
    key: AlgoKey.SPATIAL, category: 'advanced', stability: 'stable', description: 'Cluster spatial.',
    evaluate: (num, ctx) => (ctx.advancedMetrics?.spatial?.includes(num) ? 100 : 0)
};
export const orchestrationPlugin: AlgorithmPlugin = {
    key: AlgoKey.ORCHESTRATION, category: 'meta', stability: 'stable', description: 'Orchestration symbiotique.',
    evaluate: (num, ctx) => ctx.advancedMetrics?.symbioticContext?.orchestrationBoosts?.[num] || 0
};
export const decisionForestPlugin: AlgorithmPlugin = {
    key: AlgoKey.DECISION_FOREST, category: 'meta', stability: 'stable', description: 'Forêt aléatoire.',
    evaluate: (num, ctx) => ctx.advancedMetrics?.symbioticContext?.forestVotes?.[num] || 0
};
export const latentSuppressionPlugin: AlgorithmPlugin = {
    key: AlgoKey.LATENT_SUPPRESSION, category: 'experimental', stability: 'experimental', description: 'Suppression latente.',
    evaluate: (num, ctx) => (Number(ctx.features.shadowProbabilityMap[num]) || 0) * 100
};
export const twinPlugin: AlgorithmPlugin = {
    key: AlgoKey.TWIN, category: 'advanced', stability: 'stable', description: 'Facteur Jumeaux.',
    evaluate: (num, ctx) => ctx.history.slice(0, 3).some((d) => d.gagnants.some((n: number) => Math.abs(n - num) === 1)) ? 75 : 15
};
export const accelerationPlugin: AlgorithmPlugin = {
    key: AlgoKey.ACCELERATION, category: 'advanced', stability: 'stable', description: 'Accélération temporelle.',
    evaluate: (num, ctx) => {
        const recentFreq = ctx.history.slice(0, 10).filter((d) => d.gagnants.includes(num)).length;
        const olderFreq = ctx.history.slice(10, 30).filter((d) => d.gagnants.includes(num)).length / 2;
        return recentFreq > olderFreq ? 85 : 25;
    }
};
export const networkPlugin: AlgorithmPlugin = {
    key: AlgoKey.NETWORK, category: 'advanced', stability: 'experimental', description: 'Corrélation réseau.',
    evaluate: (num, ctx) => Math.min(100, (Number(ctx.features.networkCorrelationMap[num]) || 0) * 1000)
};
export const isolationAnomalyPlugin: AlgorithmPlugin = {
    key: AlgoKey.ISOLATION_ANOMALY, category: 'experimental', stability: 'experimental', description: 'Anomalie d\'isolement.',
    evaluate: (num, ctx) => ctx.advancedMetrics?.anomalyDetection?.[num] || (ctx.features.gapsMap[num] > 40 ? 80 : 15)
};
`);

write('index', `
import { registerAlgorithm } from '../algorithmRegistry';
import { frequencyPlugin } from './frequency';
import { gapsPlugin } from './gaps';
import { markovPlugin } from './markov';
import { machineBiasPlugin } from './machine_bias';
import { momentumPlugin } from './momentum';
import { equilibriumPlugin } from './equilibrium';
import { antiConsensusPlugin } from './anti_consensus';
import { affinityPlugin } from './affinity';
import { volatilityPlugin } from './volatility';
import { monteCarloPlugin } from './monte_carlo';
import { stochasticNoisePlugin } from './stochastic_noise';
import { spectralPlugin, waveletPlugin, fractalPlugin } from './signals';
import { mappingPlugins } from './advancedMappings';
import { 
    anomalyDetectionPlugin, spatialPlugin, orchestrationPlugin, 
    decisionForestPlugin, latentSuppressionPlugin, twinPlugin, 
    accelerationPlugin, networkPlugin, isolationAnomalyPlugin 
} from './heuristics';

export const initCoreAlgorithms = () => {
    registerAlgorithm(frequencyPlugin);
    registerAlgorithm(gapsPlugin);
    registerAlgorithm(markovPlugin);
    registerAlgorithm(machineBiasPlugin);
    registerAlgorithm(momentumPlugin);
    registerAlgorithm(equilibriumPlugin);
    registerAlgorithm(antiConsensusPlugin);
    registerAlgorithm(affinityPlugin);
    registerAlgorithm(spectralPlugin);
    registerAlgorithm(waveletPlugin);
    registerAlgorithm(fractalPlugin);
    mappingPlugins.forEach(registerAlgorithm);
    registerAlgorithm(anomalyDetectionPlugin);
    registerAlgorithm(spatialPlugin);
    registerAlgorithm(orchestrationPlugin);
    registerAlgorithm(decisionForestPlugin);
    registerAlgorithm(latentSuppressionPlugin);
    registerAlgorithm(twinPlugin);
    registerAlgorithm(accelerationPlugin);
    registerAlgorithm(networkPlugin);
    registerAlgorithm(isolationAnomalyPlugin);
    registerAlgorithm(volatilityPlugin);
    registerAlgorithm(monteCarloPlugin);
    registerAlgorithm(stochasticNoisePlugin);
};
`);

console.log('Algorithmes générés.');
