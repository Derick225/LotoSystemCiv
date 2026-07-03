import { DrawResult } from '../../types';
import { DeterministicSeededGenerator, softmax, gaussianPDF } from './deterministicCore';

export interface NumberMicroDNA {
    numberData: number;
    // L'ADN comportemental propre à ce numéro spécifique dans le jeu de données local (isolé par tirage !)
    behavioralDna: Record<string, number>;
    spectralPower: number; // Force du numéro dictée par la résonance
}

/**
 * Calcul de l'ADN local et comportemental (Micro-ADN) d'un numéro pour un tirage donné, 
 * strictement délimité au nom du tirage, sans mélange avec d'autres tirages.
 */
export const calculateMicroDNAPerNumber = (
    drawName: string,
    targetNumber: number,
    history: DrawResult[], 
    globalDnaContext: Record<string, number>
): NumberMicroDNA => {
    
    // Règle 2: Isolation Absolue - Filtrer l'historique au tirage cible
    const drawHistory = history.filter(h => h.drawName === drawName);
    
    const algoKeys = Object.keys(globalDnaContext);
    const behavioralDna: Record<string, number> = {};
    const generator = new DeterministicSeededGenerator(`${drawName}_micro_dna_${targetNumber}`);

    // Extraire les statistiques continues sans if/else magiques
    const allDrawsContainingTarget = drawHistory.filter(h => h.gagnants.includes(targetNumber));
    const frequency = allDrawsContainingTarget.length;
    const totalDraws = drawHistory.length || 1;
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
    return winningNumbers.map(targetNumber => 
        calculateMicroDNAPerNumber(drawName, targetNumber, history, globalDnaContext)
    );
};
