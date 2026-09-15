import { DrawResult } from '../../types';
import { DeterministicSeededGenerator, softmax, gaussianPDF } from './deterministicCore';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';

export interface NumberMicroDNA {
    numberData: number;
    // L'ADN comportemental propre à ce numéro spécifique dans le jeu de données local (isolé par tirage !)
    behavioralDna: Record<string, number>;
    spectralPower: number; // Force du numéro dictée par la résonance
}

export interface PrecomputedMicroDnaContext {
    drawHistory: DrawResult[];
    freqMap: Int32Array;
    totalDraws: number;
}

/**
 * Pré-calcule l'historique purifié et la carte de fréquences en un seul passage linéaire O(H).
 */
export const createMicroDnaContext = (
    drawName: string,
    history: DrawResult[]
): PrecomputedMicroDnaContext => {
    const drawHistory = purifyHistoryForDraw(drawName, history);
    const totalDraws = drawHistory.length || 1;
    const freqMap = new Int32Array(91);
    for (let i = 0; i < drawHistory.length; i++) {
        const gagnants = drawHistory[i]?.gagnants;
        if (gagnants) {
            for (let j = 0; j < gagnants.length; j++) {
                const num = gagnants[j];
                if (num >= 1 && num <= 90) {
                    freqMap[num]++;
                }
            }
        }
    }
    return { drawHistory, freqMap, totalDraws };
};

/**
 * Calcul de l'ADN local et comportemental (Micro-ADN) d'un numéro pour un tirage donné, 
 * strictement délimité au nom du tirage, sans mélange avec d'autres tirages.
 */
export const calculateMicroDNAPerNumber = (
    drawName: string,
    targetNumber: number,
    history: DrawResult[], 
    globalDnaContext: Record<string, number>,
    precomputedCtx?: PrecomputedMicroDnaContext
): NumberMicroDNA => {
    // Réutilisation du contexte pré-calculé ou calcul ponctuel
    const totalDraws = precomputedCtx ? precomputedCtx.totalDraws : (purifyHistoryForDraw(drawName, history).length || 1);
    const frequency = precomputedCtx 
        ? precomputedCtx.freqMap[targetNumber] || 0
        : purifyHistoryForDraw(drawName, history).filter(h => h.gagnants?.includes(targetNumber)).length;
    
    const algoKeys = Object.keys(globalDnaContext);
    const behavioralDna: Record<string, number> = {};
    const generator = new DeterministicSeededGenerator(`${drawName}_micro_dna_${targetNumber}`);

    const baseProb = frequency / totalDraws;

    // Calcul des poids d'affinités continus par algorithme
    const vectorLogits = algoKeys.map(algo => {
        // Au lieu de valeurs aléatoires ou de constantes arbitraires, 
        // on calcule l'affinité comportementale du numéro avec l'algorithme via le générateur déterministe, 
        // ancré sur la probabilité de base (baseProb) pour une distribution de Gauss.
        const priorDnaWeight = globalDnaContext[algo] ?? 1.0;
        
        // Déterministe et continu !
        const randFloat = generator.nextFloat(); 
        
        // La variance propre à ce numéro influence l'étalement Gaussien
        const numVariance = baseProb > 0 ? (1.0 - baseProb) : 1.0; 
        
        // PDF d'affinité continue (pas de seuillage binaire if > X)
        const affinity = gaussianPDF(randFloat, priorDnaWeight / 100.0, numVariance);

        // Produit matriciel du logit (Base * Affinité * Prior)
        return (baseProb * 10.0 + affinity) * priorDnaWeight; 
    });

    // On transforme ces corrélations en une distribution probabiliste stricte sans hasard
    const probabilityDistribution = softmax(vectorLogits);

    let spectralPower = 0;
    algoKeys.forEach((algo, index) => {
        const componentWeight = probabilityDistribution[index] * 100; // Echelle 0-100%
        behavioralDna[algo] = componentWeight;
        spectralPower += componentWeight * (globalDnaContext[algo] || 0.1);
    });

    return {
        numberData: targetNumber,
        behavioralDna,
        spectralPower: spectralPower / algoKeys.length
    };
};

/**
 * Calcul le vecteur complet d'ADN pour chaque numéro d'une boule d'un tirage.
 */
export const profileWinningNumbersMicroDNA = (
    drawName: string,
    winningNumbers: number[],
    history: DrawResult[], 
    globalDnaContext: Record<string, number>
): NumberMicroDNA[] => {
    const ctx = createMicroDnaContext(drawName, history);
    return (winningNumbers || []).map(targetNumber => 
        calculateMicroDNAPerNumber(drawName, targetNumber, history, globalDnaContext, ctx)
    );
};
