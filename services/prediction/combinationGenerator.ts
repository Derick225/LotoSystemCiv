import { ScoredNumber } from './scoringEngine';
import { PREDICTION_CONSTANTS } from '../../shared/prediction.types';

export const isValidCombination = (combo: number[]): boolean => {
    if (combo.length !== 5) return false;
    
    const sum = combo.reduce((a, b) => a + b, 0);
    if (sum < PREDICTION_CONSTANTS.MIN_SUM || sum > PREDICTION_CONSTANTS.MAX_SUM) return false; 
    
    const evens = combo.filter(n => n % 2 === 0).length;
    if (evens === 0 || evens === 5) return false; 
    
    let consecutiveCount = 0;
    const sortedCombo = [...combo].sort((a, b) => a - b);
    for (let i = 0; i < sortedCombo.length - 1; i++) {
        if (sortedCombo[i] + 1 === sortedCombo[i+1]) consecutiveCount++;
    }
    if (consecutiveCount > 2) return false; 
    
    return true;
};

export const generateCombination = (
    sortedScores: ScoredNumber[],
    affinityMap: Map<number, Map<number, number>>,
    outsiderCount: number = 2
): number[] => {
    let selection: number[] = [];
    let attempts = 0;
    const maxAttempts = 100;

    while (selection.length !== 5 && attempts < maxAttempts) {
        attempts++;
        let currentSelection: number[] = [];
        
        const seed = sortedScores[0].num;
        currentSelection.push(seed);

        for (let i = 1; i < 5; i++) {
            const isOutsiderSlot = i >= (5 - outsiderCount);
            
            const adjustedSorted = sortedScores
                .filter(s => !currentSelection.includes(s.num))
                .map(s => {
                    let totalAffinity = 0;
                    currentSelection.forEach(selectedNum => {
                        const affinities = affinityMap.get(selectedNum);
                        if (affinities) {
                            totalAffinity += (affinities.get(s.num) || 0);
                        }
                    });
                    return { ...s, tempScore: s.score + (totalAffinity * 3) };
                })
                .sort((a, b) => b.tempScore - a.tempScore);

            if (adjustedSorted.length === 0) break;

            if (isOutsiderSlot) {
                const pool = adjustedSorted.slice(10, 35);
                const picked = pool[Math.floor(Math.random() * pool.length)] || adjustedSorted[0];
                currentSelection.push(picked.num);
            } else {
                currentSelection.push(adjustedSorted[0].num);
            }
        }

        if (currentSelection.length === 5) {
            const sortedCombo = [...currentSelection].sort((a, b) => a - b);
            if (isValidCombination(sortedCombo)) {
                selection = sortedCombo;
                break;
            }
        }
    }

    if (selection.length !== 5) {
        const topPickCount = 5 - outsiderCount;
        const topPicks = sortedScores.slice(0, topPickCount).map(s => s.num);
        const outsiderPoolStart = Math.max(topPickCount + 2, 10);
        const outsiderPool = sortedScores.slice(outsiderPoolStart, outsiderPoolStart + 25);
        const outsiders = outsiderPool.sort(() => 0.5 - Math.random()).slice(0, outsiderCount).map(s => s.num);
        selection = [...topPicks, ...outsiders].sort((a,b) => a-b);
    }

    return selection;
};
