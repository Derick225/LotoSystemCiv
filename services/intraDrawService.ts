
import { DrawResult } from '../types';
import { calculateACValue, calculateDigitalRoot } from './mathService';

// --- CONFIGURATION & SEUILS ---
const GRID_COLS = 10;
const GRID_ROWS = 9;

const THRESHOLDS = {
    GAP: { CRITICAL: 2, HIGH: 4 }, // Écarts internes
    SPREAD: { MAX: 78, MIN: 25 },  // Dispersion totale
    ALIGNMENT: { MIN_NODES: 3 },   // Alignement géométrique
    DISPERSION: { COMPACT: 2.5, EXPANDED: 5.5 } // Rayon de dispersion
};

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
        spatialDispersion: number; // Nouveau
        barycenter: { x: number, y: number }; // Nouveau
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

// Helper: Coordonnées Grille 9x10 (1-based index 1..90)
// x: 0..9 (Col), y: 0..8 (Row)
const getCoordinates = (n: number) => ({
    x: (n - 1) % GRID_COLS,
    y: Math.floor((n - 1) / GRID_COLS)
});

/**
 * Analyse la structure d'un tirage isolé pour identifier des anomalies géométriques ou arithmétiques.
 */
export const analyzeIntraDraw = (result: DrawResult): IntraDrawMetrics => {
    const winners = [...result.gagnants].sort((a, b) => a - b);
    const machineSet = new Set(result.machine || []);
    
    // --- 1. MÉTRIQUES DE BASE & MAPS ---
    const internalGaps: number[] = [];
    const finalesMap = new Map<number, number>();
    const decadesMap = new Map<number, number>();
    
    let sum = 0;
    let oddsCount = 0;
    let lowCount = 0;

    // Passe unique pour les stats scalaires
    for (let i = 0; i < winners.length; i++) {
        const n = winners[i];
        sum += n;
        if (n % 2 !== 0) oddsCount++;
        if (n <= 45) lowCount++;

        // Gap (sauf pour le dernier)
        if (i < winners.length - 1) {
            internalGaps.push(winners[i + 1] - n);
        }

        // Maps
        const finale = n % 10;
        const decade = Math.floor((n - 1) / 10);
        finalesMap.set(finale, (finalesMap.get(finale) || 0) + 1);
        decadesMap.set(decade, (decadesMap.get(decade) || 0) + 1);
    }

    // --- 2. ANALYSE SPATIALE & GÉOMÉTRIQUE (Grille 9x10) ---
    let sumX = 0, sumY = 0;
    const rowCounts = new Map<number, number>();
    const colCounts = new Map<number, number>();
    // Diagonales (somme x+y et diff x-y)
    const diag1Counts = new Map<number, number>(); 
    const diag2Counts = new Map<number, number>();

    winners.forEach(n => {
        const { x, y } = getCoordinates(n);
        sumX += x;
        sumY += y;
        
        rowCounts.set(y, (rowCounts.get(y) || 0) + 1);
        colCounts.set(x, (colCounts.get(x) || 0) + 1);
        diag1Counts.set(x + y, (diag1Counts.get(x + y) || 0) + 1);
        diag2Counts.set(x - y, (diag2Counts.get(x - y) || 0) + 1);
    });

    // Barycentre
    const barycenter = { x: sumX / 5, y: sumY / 5 };

    // Dispersion (Écart-type de la distance au barycentre)
    const varianceSum = winners.reduce((acc, n) => {
        const { x, y } = getCoordinates(n);
        const distSq = Math.pow(x - barycenter.x, 2) + Math.pow(y - barycenter.y, 2);
        return acc + distSq;
    }, 0);
    const spatialDispersion = Math.sqrt(varianceSum / 5);

    // --- 3. DÉTECTION DE PATTERNS ---
    const patterns: NamedPattern[] = [];

    // A. Pattern "Le Serpent" (Gaps serrés)
    const tightGaps = internalGaps.filter(g => g <= THRESHOLDS.GAP.CRITICAL).length;
    if (tightGaps >= 3) {
        patterns.push({ 
            id: 'snake', name: 'Le Serpent', severity: 'high',
            description: `Séquence ultra-condensée (${tightGaps} écarts ≤ ${THRESHOLDS.GAP.CRITICAL}).`
        });
    }

    // B. Pattern "L'Éventail" (Spread)
    const spread = winners[4] - winners[0];
    if (spread > THRESHOLDS.SPREAD.MAX) {
        patterns.push({ 
            id: 'spread-max', name: 'Grand Éventail', severity: 'low',
            description: `Dispersion maximale du spectre (${spread} rangs).` 
        });
    } else if (spread < THRESHOLDS.SPREAD.MIN) {
        patterns.push({ 
            id: 'spread-min', name: 'Micro-Cluster', severity: 'high',
            description: `Compression extrême sur ${spread} rangs.` 
        });
    }

    // C. Pattern "Alignement Géométrique"
    const maxRow = Math.max(...rowCounts.values());
    const maxCol = Math.max(...colCounts.values());
    const maxDiag = Math.max(Math.max(...diag1Counts.values()), Math.max(...diag2Counts.values()));

    if (maxRow >= THRESHOLDS.ALIGNMENT.MIN_NODES) {
        patterns.push({ id: 'geo-row', name: 'Ligne de Force', severity: 'medium', description: `${maxRow} numéros sur la même ligne horizontale.` });
    }
    if (maxCol >= THRESHOLDS.ALIGNMENT.MIN_NODES) {
        patterns.push({ id: 'geo-col', name: 'Pilier Vertical', severity: 'medium', description: `${maxCol} numéros sur la même colonne.` });
    }
    if (maxDiag >= THRESHOLDS.ALIGNMENT.MIN_NODES) {
        patterns.push({ id: 'geo-diag', name: 'Coupe Diagonale', severity: 'high', description: `Alignement oblique rare de ${maxDiag} numéros.` });
    }

    // D. Pattern "Résonance Finale" (Jumeaux/Triplés)
    const maxFinale = Math.max(...finalesMap.values());
    if (maxFinale >= 3) {
        patterns.push({ id: 'twins', name: 'Triplé Finale', severity: 'medium', description: 'Concentration harmonique sur une unité de finale.' });
    }

    // E. Pattern "Écho Machine"
    const autoTransfers = winners.filter(n => machineSet.has(n));
    if (autoTransfers.length >= 2) {
        patterns.push({
            id: 'echo-machine', name: 'Miroir de Flux', severity: 'high',
            description: `${autoTransfers.length} numéros en double flux Gagnant/Machine.`
        });
    }

    // F. Pattern "Densité Spatiale"
    if (spatialDispersion < THRESHOLDS.DISPERSION.COMPACT) {
        patterns.push({ id: 'spatial-dense', name: 'Singularité Spatiale', severity: 'high', description: `Numéros géographiquement très proches (Dispersion ${spatialDispersion.toFixed(2)}).` });
    }

    // --- 4. FORMATAGE DE SORTIE ---
    const ac = calculateACValue(winners);
    const maxDecadeCount = Math.max(...decadesMap.values());

    return {
        acValue: ac,
        sum,
        digitalRoot: calculateDigitalRoot(sum),
        parityRatio: `${5 - oddsCount}P-${oddsCount}I`,
        lowHighRatio: `${lowCount}M-${5 - lowCount}P`,
        internalGaps,
        maxInternalGap: Math.max(...internalGaps, 0),
        finalesCount: Object.fromEntries(finalesMap), // Conversion Map -> Object pour compatibilité UI
        patterns,
        topology: {
            maxDecadeCount,
            spread,
            isClustered: maxDecadeCount >= 4,
            spatialDispersion: parseFloat(spatialDispersion.toFixed(2)),
            barycenter: { x: parseFloat(barycenter.x.toFixed(1)), y: parseFloat(barycenter.y.toFixed(1)) }
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
