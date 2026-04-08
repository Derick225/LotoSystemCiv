import { describe, it, expect } from 'vitest';
import { runMarkovPrediction } from '../services/lstmCore';
import { DrawResult } from '../types';

describe('lstmCore - runMarkovPrediction', () => {
    it('should return zeros if history is less than 10', () => {
        const history: DrawResult[] = Array.from({ length: 9 }, (_, i) => ({
            id: String(i),
            drawName: 'Test',
            date: '2023-01-01',
            gagnants: [1, 2, 3, 4, 5],
            machine: [],
            version: 1
        }));

        const result = runMarkovPrediction(history);
        expect(result.probabilities.length).toBe(90);
        expect(result.probabilities.every(p => p === 0)).toBe(true);
        expect(result.accuracy).toBe(0);
    });

    it('should sum probabilities to approximately 1', () => {
        const history: DrawResult[] = Array.from({ length: 20 }, (_, i) => ({
            id: String(i),
            drawName: 'Test',
            date: '2023-01-01',
            gagnants: [i % 90 + 1, (i + 1) % 90 + 1, (i + 2) % 90 + 1, (i + 3) % 90 + 1, (i + 4) % 90 + 1],
            machine: [],
            version: 1
        }));

        const result = runMarkovPrediction(history);
        const sum = result.probabilities.reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - 1)).toBeLessThan(0.01);
    });

    it('should detect linear progression trend', () => {
        // Create a sequence where the next number is always predictable
        const history: DrawResult[] = [];
        for (let i = 0; i < 20; i++) {
            history.push({
                id: String(i),
                drawName: 'Test',
                date: '2023-01-01',
                gagnants: [i % 90 + 1, (i + 1) % 90 + 1, (i + 2) % 90 + 1, (i + 3) % 90 + 1, (i + 4) % 90 + 1],
                machine: [],
                version: 1
            });
        }
        
        // Reverse so index 0 is the latest
        history.reverse();

        const result = runMarkovPrediction(history);
        expect(result.accuracy).toBeGreaterThanOrEqual(0.6);
    });
});
