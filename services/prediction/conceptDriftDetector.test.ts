import { describe, it, expect } from 'vitest';
import { ConceptDriftDetector } from './conceptDriftDetector';

describe('Concept Drift Detector', () => {
    const detector = new ConceptDriftDetector();

    describe('Page-Hinkley Test on Error Streams', () => {
        it('should not detect drift on static/stationary streams', () => {
            // Un flux d'erreur stationnaire autour de 0.2
            const errorStream = Array.from({ length: 50 }, () => 0.2);
            const result = detector.detectDriftPageHinkley(errorStream);
            expect(result.hasDrift).toBe(false);
            expect(result.confidence).toBeLessThan(50);
        });

        it('should detect a sharp step increase in error levels', () => {
            // Flux d'erreur stationnaire (0.1) qui saute brutalement à 0.8 à l'index 25
            const errorStream = [
                ...Array.from({ length: 25 }, () => 0.1),
                ...Array.from({ length: 25 }, () => 0.8),
            ];
            const result = detector.detectDriftPageHinkley(errorStream);
            expect(result.hasDrift).toBe(true);
            expect(result.driftIndex).toBeGreaterThanOrEqual(23);
            expect(result.driftIndex).toBeLessThanOrEqual(27);
            expect(result.confidence).toBeGreaterThanOrEqual(80);
        });
    });

    describe('Kullback-Leibler Divergence', () => {
        it('should return 0 for identical probability distributions', () => {
            const distP = new Float64Array(91);
            const distQ = new Float64Array(91);
            for (let i = 1; i <= 90; i++) {
                distP[i] = 1.0 / 90.0;
                distQ[i] = 1.0 / 90.0;
            }
            const kl = detector.computeKLDivergence(distP, distQ);
            expect(kl).toBeCloseTo(0, 5);
        });

        it('should calculate positive divergence for differing distributions', () => {
            const distP = new Float64Array(91);
            const distQ = new Float64Array(91);
            for (let i = 1; i <= 45; i++) {
                distP[i] = 2.0 / 90.0;
                distQ[i] = 0.5 / 90.0;
            }
            for (let i = 46; i <= 90; i++) {
                distP[i] = 0.5 / 90.0;
                distQ[i] = 2.0 / 90.0;
            }
            const kl = detector.computeKLDivergence(distP, distQ);
            expect(kl).toBeGreaterThan(0);
        });
    });

    describe('Performance Drift Risk Estimation', () => {
        it('should flag high performance drift risk if recent success collapse occurs', () => {
            const result = detector.evaluatePerformanceDriftRisk(
                -4.5, // Forte déviation t négative (régression statistique)
                1.2,  // Variance de base de référence
                0.05, // Succès récent s'effondre
                0.25  // Succès historique stable
            );
            expect(result.isPerformanceDrift).toBe(true);
            expect(result.driftRisk).toBeGreaterThan(0.95);
        });

        it('should keep risk low when performance is stable', () => {
            const result = detector.evaluatePerformanceDriftRisk(
                0.2,  // Pas de déviation négative
                1.0,
                0.24,
                0.25
            );
            expect(result.isPerformanceDrift).toBe(false);
            expect(result.driftRisk).toBeLessThan(0.5);
        });
    });
});
