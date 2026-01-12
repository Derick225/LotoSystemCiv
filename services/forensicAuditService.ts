
import { DrawResult } from '../types';
import { calculateShannonEntropy, calculateBenfordCompliance } from './mathService';

export interface ForensicIndicator {
    label: string;
    value: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    impact: number;
}

export interface ForensicAuditResult {
    suspicionScore: number;
    indicators: ForensicIndicator[];
    riggedProbability: number;
    entropyCollapse: boolean;
    benfordCompliance: number;
    evidenceLogs: string[];
}

/**
 * Détecte si un numéro suit un cycle temporel strict (ex: sort tous les 3 tirages exactement).
 */
const analyzeTemporalPatterns = (numbers: number[], history: DrawResult[], logs: string[], indicators: ForensicIndicator[]) => {
    let temporalPoints = 0;
    
    // On analyse chaque numéro du tirage actuel
    numbers.forEach(num => {
        let gaps = [];
        let lastIdx = -1;
        // On remonte sur 30 tirages
        for(let i=0; i<30; i++) {
            if (history[i].gagnants.includes(num)) {
                if (lastIdx !== -1) {
                    gaps.push(i - lastIdx);
                }
                lastIdx = i;
            }
        }
        
        // Si on a assez de données et que les gaps sont identiques (variance nulle)
        if (gaps.length >= 2) {
            const isPeriodic = gaps.every(g => g === gaps[0]);
            if (isPeriodic && gaps[0] > 1) {
                const impact = 20;
                indicators.push({
                    label: `Cycle Mécanique N°${num}`,
                    value: `Période ${gaps[0]}t`,
                    severity: 'high',
                    description: `Le numéro ${num} sort exactement tous les ${gaps[0]} tirages. Signature artificielle.`,
                    impact
                });
                logs.push(`PATTERN : Périodicité stricte détectée sur ${num} (T=${gaps[0]}).`);
                temporalPoints += impact;
            }
        }
    });
    return temporalPoints;
};

/**
 * Moteur d'Audit Forensique Sentinel v4.1.
 */
export const analyzeForManipulation = (numbers: number[], history: DrawResult[]): ForensicAuditResult => {
    const indicators: ForensicIndicator[] = [];
    const logs: string[] = [];
    let suspicionPoints = 0;

    const sum = numbers.reduce((a, b) => a + b, 0);
    const sorted = [...numbers].sort((a, b) => a - b);
    const entropy = calculateShannonEntropy(history.slice(0, 100)); // Utilise un échantillon plus large pour le contexte
    const benford = calculateBenfordCompliance(numbers);
    
    // 1. Analyse de la Variance des Écarts (Anti-Harmonie)
    const setGaps = [];
    for(let i=0; i<sorted.length-1; i++) setGaps.push(sorted[i+1] - sorted[i]);
    const avgGap = (sorted[sorted.length-1] - sorted[0]) / (sorted.length - 1);
    const gapVariance = setGaps.reduce((acc, g) => acc + Math.pow(g - avgGap, 2), 0) / setGaps.length;
    
    if (gapVariance < 6.0) {
        const impact = 45;
        indicators.push({
            label: "Harmonie Linéaire",
            value: "CRITIQUE",
            severity: 'high',
            description: "La régularité des écarts entre numéros est statistiquement impossible pour un tirage stochastique pur.",
            impact
        });
        logs.push(`ALERTE : Variance des gaps (${gapVariance.toFixed(2)}) sous le seuil critique 6.0. Signature de sélection humaine.`);
        suspicionPoints += impact;
    }

    // 2. Test de Benford (Conformité de distribution)
    if (benford.score < 40) {
        const impact = 35;
        indicators.push({
            label: "Divergence Benford",
            value: `${Math.round(benford.score)}%`,
            severity: 'medium',
            description: "Divergence majeure par rapport à la loi logarithmique naturelle des premiers chiffres.",
            impact
        });
        logs.push(`ANOMALIE : Distribution Benford (${Math.round(benford.score)}%) suggère un flux généré algorithmiquement.`);
        suspicionPoints += impact;
    }

    // 3. Echo de Registre T-1 (Persistance excessive)
    if (history.length > 0) {
        const lastWinners = history[0].gagnants;
        const repeats = numbers.filter(n => lastWinners.includes(n)).length;
        if (repeats >= 3) {
            const impact = repeats === 3 ? 25 : 65;
            indicators.push({
                label: "Echo de Registre",
                value: `${repeats} Hits T-1`,
                severity: repeats >= 4 ? 'high' : 'medium',
                description: "Réplication anormale du tirage précédent. Risque de boucle de flux ou de rémanence machine.",
                impact
            });
            logs.push(`DÉTECTION : ${repeats} répétitions du tirage J-1. Probabilité de coïncidence < 0.004%.`);
            suspicionPoints += impact;
        }
    }

    // 4. Test de Dérive Sigma (Centre de Masse)
    const avgTheoretical = 227.5; // (1+90)/2 * 5
    const deviance = Math.abs(sum - avgTheoretical);
    if (deviance > 130) {
        const impact = 30;
        indicators.push({
            label: "Dérive Sigma",
            value: `Δ ${Math.round(deviance)}`,
            severity: 'medium',
            description: "Somme totale située aux extrémités extrêmes de la courbe de Gauss.",
            impact
        });
        logs.push(`SIGNAL : La somme ${sum} présente une déviation sigma de ${Math.round(deviance)} pts.`);
        suspicionPoints += impact;
    }

    // 5. Entropie de Shannon (Complexité du flux)
    if (entropy.normalized < 0.85) {
        const impact = 20;
        indicators.push({
            label: "Collapsus Entropique",
            value: `${Math.round(entropy.normalized * 100)}%`,
            severity: 'low',
            description: "Le système présente une perte de désordre. Le flux semble 'dirigé'.",
            impact
        });
        logs.push(`NOTE : Entropie normalisée (${entropy.normalized.toFixed(2)}) indique une structure prédictible.`);
        suspicionPoints += impact;
    }

    // 6. NOUVEAU : Analyse Temporelle (Cycles)
    suspicionPoints += analyzeTemporalPatterns(numbers, history, logs, indicators);

    return {
        suspicionScore: Math.min(100, suspicionPoints),
        indicators,
        riggedProbability: suspicionPoints > 75 ? 0.98 : suspicionPoints > 45 ? 0.62 : 0.05,
        entropyCollapse: entropy.normalized < 0.85,
        benfordCompliance: benford.score,
        evidenceLogs: logs
    };
};

/**
 * GENERATEUR SHADOW ORACLE v4.0.
 * Extrait les vecteurs de rupture en pénalisant le consensus public (les Favoris).
 */
export const generateShadowOracleVector = (history: DrawResult[], oracleScores: Record<number, number>): number[] => {
    // 1. Calcul du consensus (Favoris de masse)
    const scores = Object.entries(oracleScores).map(([n, s]) => ({ num: parseInt(n), score: Number(s) }));
    const sortedByProb = [...scores].sort((a, b) => b.score - a.score);
    const superFavorites = new Set(sortedByProb.slice(0, 12).map(e => e.num));
    
    // 2. Identification du "Silence Statistique" (Numéros viables mais ignorés par le consensus)
    const shadowCandidates = scores.filter(s => s.score > 38 && !superFavorites.has(s.num));

    const result: Set<number> = new Set();
    
    // Strategie Alpha: Translocation Machine Directe (T-1) non favorisée
    const machineLast = history[0]?.machine || [];
    const validMachine = machineLast.filter(n => !superFavorites.has(n));
    if (validMachine.length > 0) {
        result.add(validMachine[Math.floor(Math.random() * validMachine.length)]);
    }

    // Strategie Beta: Voisinage Inverse du Favori 1
    const topFavori = sortedByProb[0]?.num;
    if (topFavori) {
        const neighbors = [topFavori - 1, topFavori + 1].filter(n => n >= 1 && n <= 90 && !superFavorites.has(n));
        if (neighbors.length > 0) result.add(neighbors[Math.floor(Math.random() * neighbors.length)]);
    }

    // Strategie Gamma: Anti-Consensus (Extraction pure du pool de silence)
    const sortedShadow = shadowCandidates.sort((a, b) => b.score - a.score);
    let i = 0;
    while (result.size < 5 && i < sortedShadow.length) {
        result.add(sortedShadow[i].num);
        i++;
    }

    // Remplissage de sécurité (No-Consensus Random)
    while (result.size < 5) {
        const rnd = Math.floor(Math.random() * 90) + 1;
        if (!superFavorites.has(rnd)) result.add(rnd);
    }

    return Array.from(result).sort((a, b) => a - b);
};
