
import { DrawResult } from '../types';
import { calculateACValue, calculateDigitalRoot } from './mathService';

export interface NamedPattern {
    id: string;
    name: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
}

export interface IntraDrawMetrics {
    acValue: number;
    sum: number;
    digitalRoot: number;
    parityRatio: string;
    lowHighRatio: string;
    internalGaps: number[];
    maxInternalGap: number;
    finalesCount: Record<number, number>;
    patterns: NamedPattern[];
    topology: {
        maxDecadeCount: number;
        spread: number;
        isClustered: boolean;
    };
    machineInteraction: {
        autoTransferCount: number;
        autoTransferNumbers: number[];
    };
    deviation: {
        sumDiff: number;
        acDiff: number;
    };
}

/**
 * Analyse la structure d'un tirage isolé pour identifier des anomalies géométriques ou arithmétiques.
 */
export const analyzeIntraDraw = (result: DrawResult): IntraDrawMetrics => {
    const winners = [...result.gagnants].sort((a, b) => a - b);
    const machine = result.machine || [];
    
    // 1. Écarts internes (Gaps de saut)
    const internalGaps: number[] = [];
    for (let i = 0; i < winners.length - 1; i++) {
        internalGaps.push(winners[i + 1] - winners[i]);
    }

    // 2. Analyse des Finales (Dernier chiffre)
    const finales: Record<number, number> = {};
    winners.forEach(n => {
        const f = n % 10;
        finales[f] = (finales[f] || 0) + 1;
    });

    const patterns: NamedPattern[] = [];
    
    // Pattern: Le Serpent (3+ numéros à écart <= 2) - Seuil de rareté critique
    if (internalGaps.filter(g => g <= 2).length >= 3) {
        patterns.push({ 
            id: 'snake', 
            name: 'Le Serpent', 
            description: 'Succession ultra-rapprochée détectée. Probabilité stochastique < 3.2%.', 
            severity: 'high' 
        });
    }

    // Pattern: L'Éventail (Dispersion maximale, Spread > 78)
    const spread = winners[4] - winners[0];
    if (spread > 78) {
        patterns.push({ 
            id: 'spread', 
            name: 'L\'Éventail', 
            description: 'Dispersion maximale sur l\'ensemble du spectre 1-90.', 
            severity: 'low' 
        });
    }

    // Pattern: Les Jumeaux (Triple finale)
    if (Object.values(finales).some(v => v >= 3)) {
        patterns.push({ 
            id: 'twins', 
            name: 'Résonance Finale', 
            description: 'Concentration harmonique sur une unité de finale unique.', 
            severity: 'medium' 
        });
    }

    // Pattern: Écho de Machine (Transfert immédiat)
    const autoTransfers = winners.filter(n => machine.includes(n));
    if (autoTransfers.length >= 2) {
        patterns.push({
            id: 'echo-machine',
            name: 'Miroir de Flux',
            description: `${autoTransfers.length} numéros en double flux Gagnant/Machine.`,
            severity: 'high'
        });
    }

    const sum = winners.reduce((a, b) => a + b, 0);
    const ac = calculateACValue(winners);
    const odds = winners.filter(n => n % 2 !== 0).length;
    const lows = winners.filter(n => n <= 45).length;
    const decades = winners.map(n => Math.floor((n - 1) / 10));

    return {
        acValue: ac,
        sum,
        digitalRoot: calculateDigitalRoot(sum),
        parityRatio: `${5 - odds}P-${odds}I`,
        lowHighRatio: `${lows}M-${5 - lows}P`,
        internalGaps,
        maxInternalGap: Math.max(...internalGaps, 0),
        finalesCount: finales,
        patterns,
        topology: {
            maxDecadeCount: Math.max(...decades.map(d => decades.filter(x => x === d).length)),
            spread,
            isClustered: new Set(decades).size <= 2
        },
        machineInteraction: {
            autoTransferCount: autoTransfers.length,
            autoTransferNumbers: autoTransfers
        },
        deviation: {
            sumDiff: parseFloat((sum - 227.5).toFixed(1)),
            acDiff: ac - 8
        }
    };
};
