import { describe, it, expect } from 'vitest';
import { calculateScores } from './scoringEngine';
import { AlgoWeights, AlgoKey } from '../../shared/prediction.types';
import { ExtractedFeatures } from './featureExtractor';
import { EnhancedMetrics } from './metrics.types';
import { DrawResult } from '../../types';

describe('Scoring Engine', () => {
    // 1. Initialisation des features factices conformes aux dimensions réelles
    const mockFeatures: ExtractedFeatures = {
        freqMap: new Float32Array(91).map(() => 5.0),
        gapsMap: new Int32Array(91).map(() => 3),
        markovMap: new Float32Array(91).map(() => 0.1),
        affinityMap: Array.from({ length: 91 }, () => new Float32Array(91).fill(0.05)),
        momentumMap: new Float32Array(91).map(() => 1.2),
        machineTransferMap: new Float32Array(91).map(() => 0.15),
        shadowProbabilityMap: new Float32Array(91).map(() => 0.08),
        networkCorrelationMap: new Float32Array(91).map(() => 0.22)
    };

    // 2. Initialisation des poids
    const mockWeights: AlgoWeights = {
        [AlgoKey.FREQUENCY]: 0.25,
        [AlgoKey.GAPS]: 0.25,
        [AlgoKey.MARKOV]: 0.25,
        [AlgoKey.AFFINITY]: 0.25,
    } as any;

    // 3. Initialisation des métriques enrichies
    const mockMetrics: EnhancedMetrics = {
        statisticalBounds: {
            median: 50,
            q1: 25,
            q3: 75,
            variance: 100,
            kurtosis: 0,
            skewness: 0,
            shannonEntropy: 0.8,
            hurstExponent: 0.5
        },
        poisson: {},
        bayes: {},
        temporal: {}
    } as any;

    // 4. Historique de tirage factice
    const mockHistory: DrawResult[] = [
        { id: '1', date: '2026-07-20', gagnants: [5, 12, 45, 67, 88], drawName: 'Reveil' },
        { id: '2', date: '2026-07-13', gagnants: [2, 18, 33, 56, 79], drawName: 'Reveil' }
    ];

    it('should compute scores and return exactly 90 numbers sorted by final score descending', () => {
        const scores = calculateScores(mockFeatures, mockWeights, mockMetrics, mockHistory);

        // Devrait retourner exactement 90 numéros (les numéros de 1 à 90)
        expect(scores.length).toBe(90);

        // Devrait être trié par score décroissant
        for (let i = 0; i < scores.length - 1; i++) {
            expect(scores[i].score).toBeGreaterThanOrEqual(scores[i + 1].score);
        }

        // S'assurer que chaque élément possède les attributs requis
        const first = scores[0];
        expect(first.num).toBeGreaterThanOrEqual(1);
        expect(first.num).toBeLessThanOrEqual(90);
        expect(typeof first.score).toBe('number');
        expect(first.breakdown).toBeDefined();
    });

    it('should maintain determinism and reproducibility with the same inputs', () => {
        const run1 = calculateScores(mockFeatures, mockWeights, mockMetrics, mockHistory);
        const run2 = calculateScores(mockFeatures, mockWeights, mockMetrics, mockHistory);

        expect(run1).toEqual(run2);
    });
});
