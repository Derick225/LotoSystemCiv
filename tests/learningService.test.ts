import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { LearningService } from '../services/learningService';
import { DrawResult, PredictionHistoryItem } from '../types';

describe('learningService - checkDrift', () => {
    it('should return false if samples are insufficient', async () => {
        const result = await LearningService.checkDrift('Test', [], []);
        expect(result).toBe(false);
    });

    it('should detect drift correctly using property-based testing', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 10, maxLength: 50 }), // Historical hits
                fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 5, maxLength: 5 }),   // Recent hits
                async (historicalHits, recentHits) => {
                    const results: DrawResult[] = [];
                    const predictions: PredictionHistoryItem[] = [];

                    let dateCounter = new Date('2023-01-01').getTime();

                    // Generate historical data
                    for (let i = 0; i < historicalHits.length; i++) {
                        const dateStr = new Date(dateCounter).toISOString().split('T')[0];
                        const gagnants = [1, 2, 3, 4, 5];
                        results.push({ id: `h${i}`, drawName: 'Test', date: dateStr, gagnants, machine: [], version: 1 });
                        
                        const suggestedNumbers = gagnants.slice(0, historicalHits[i]);
                        while (suggestedNumbers.length < 5) suggestedNumbers.push(10 + suggestedNumbers.length);
                        
                        predictions.push({
                            id: `p${i}`,
                            timestamp: dateCounter,
                            drawName: 'Test',
                            prediction: { suggestedNumbers, confidence: 80, baseline: 50, variance: 10, trend: 5, scoreBreakdown: {} as any }
                        });
                        dateCounter += 86400000;
                    }

                    // Generate recent data
                    for (let i = 0; i < recentHits.length; i++) {
                        const dateStr = new Date(dateCounter).toISOString().split('T')[0];
                        const gagnants = [1, 2, 3, 4, 5];
                        results.push({ id: `r${i}`, drawName: 'Test', date: dateStr, gagnants, machine: [], version: 1 });
                        
                        const suggestedNumbers = gagnants.slice(0, recentHits[i]);
                        while (suggestedNumbers.length < 5) suggestedNumbers.push(10 + suggestedNumbers.length);
                        
                        predictions.push({
                            id: `pr${i}`,
                            timestamp: dateCounter,
                            drawName: 'Test',
                            prediction: { suggestedNumbers, confidence: 80, baseline: 50, variance: 10, trend: 5, scoreBreakdown: {} as any }
                        });
                        dateCounter += 86400000;
                    }

                    const isDrift = await LearningService.checkDrift('Test', predictions, results);
                    
                    const allHits = [...historicalHits, ...recentHits];
                    const histAvg = allHits.reduce((a, b) => a + b, 0) / allHits.length;
                    
                    let recentEma = histAvg;
                    for (const hit of recentHits) {
                        recentEma = (0.3 * hit) + (0.7 * recentEma);
                    }

                    const threshold = Math.max(0.6, histAvg * 0.8);
                    const expectedDrift = recentEma < threshold;

                    expect(isDrift).toBe(expectedDrift);
                }
            )
        );
    });
});
