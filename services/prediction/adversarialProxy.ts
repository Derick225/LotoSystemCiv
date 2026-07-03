import { DrawResult } from '../../types';
import { AlgoKey, ScoreBreakdown } from '../../shared/prediction.types';
import { calculateHurstForNumber } from '../mathService';

/**
 * Générateur Antagoniste Déterministe (Generative Adversarial Proxy)
 * 
 * Sa mission est de détruire le ticket de prédiction de manière continue,
 * sans aucun seuil binaire arbitraire, en utilisant des fonctions d'activation lisses.
 */
export const evaluateAdversarialSurvival = (
    selection: number[],
    breakdownRecord: Record<number, ScoreBreakdown>,
    history: DrawResult[],
    forensicOracleDrift: Record<string, number> = {}
): { survivalScore: number; risks: string[] } => {
    let survivalScore = 100.0;
    const risks: string[] = [];

    // 1. Analyse de la sur-saturation d'algorithmes (Effondrement de la variance)
    const algoContributions = new Map<string, number>();
    selection.forEach(num => {
        const bdown = breakdownRecord[num];
        if (bdown) {
            Object.entries(bdown).forEach(([k, v]) => {
                if (typeof v === 'number') {
                    algoContributions.set(k, (algoContributions.get(k) || 0) + v);
                }
            });
        }
    });

    // 1b. Pénalisation continue des algorithmes en dérive
    algoContributions.forEach((totalScore, algo) => {
        const oracleDrift = forensicOracleDrift[algo];
        if (oracleDrift !== undefined && oracleDrift > 0) {
             // Fonction continue : pas de seuil `if (totalScore > 30)`
             // Plus le totalScore est élevé, plus la dérive de l'oracle impacte fortement (Sigmoïde d'activation)
             const activation = 1.0 / (1.0 + Math.exp(-0.2 * (totalScore - 20.0))); 
             const penalty = (oracleDrift / 100.0) * (totalScore / 10.0) * activation;
             
             survivalScore -= penalty;
             if (penalty > 3.0) {
                 risks.push(`Proxy (Forensic Sync): Forte exposition de l'algo [${algo}] en surestimation (Drift=${oracleDrift.toFixed(1)}).`);
             }
        }
    });

    // 2. Évaluation de la Répétition (Entropie Topologique) via Loi de Puissance Continue
    const lastDrawGagnants = history[0]?.gagnants || [];
    let overlapCount = 0;
    selection.forEach(num => {
        if (lastDrawGagnants.includes(num)) {
            overlapCount++;
        }
    });
    
    // Pénalisation continue exponentielle au lieu d'un if (overlapCount >= 3)
    const overlapPenalty = Math.pow(overlapCount, 2.5); // 1 -> 1, 2 -> 5.6, 3 -> 15.5
    survivalScore -= overlapPenalty;
    if (overlapPenalty > 10.0) {
        risks.push(`Proxy: Répétition massive du tirage précédent détectée (Pénalité: -${overlapPenalty.toFixed(1)}).`);
    }

    // 3. Détection des signaux anti-persistants
    selection.forEach(num => {
        const { hurst } = calculateHurstForNumber(num, history.slice(0, 50));
        const markovScore = breakdownRecord[num]?.[AlgoKey.MARKOV] || 0;
        
        // Au lieu de (hurst < 0.35 && markov > 30), utilisation d'une activation douce
        const hurstAntiPersistance = Math.max(0, 0.40 - hurst) / 0.40; // [0, 1] où 1 est très anti-persistant
        const markovReliance = 1.0 / (1.0 + Math.exp(-0.15 * (markovScore - 20.0))); // Sigmoïde de confiance markovienne
        
        const antiPersistantPenalty = hurstAntiPersistance * markovReliance * 25.0; // Max 25 points par numéro
        
        survivalScore -= antiPersistantPenalty;
        if (antiPersistantPenalty > 5.0) {
            risks.push(`Proxy: Le numéro ${num} est dans un cycle anti-persistant (H=${hurst.toFixed(2)}), le modèle Markovien est trompé.`);
        }
    });

    // 4. Test de la Sérialité Forcée (Symmetry Attack)
    let serialPairs = 0;
    const sorted = [...selection].sort((a,b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i+1] - sorted[i] === 1) serialPairs++;
    }
    
    // Pénalisation continue (Quadratique)
    const serialPenalty = Math.pow(serialPairs, 2) * 5.0; // 1 -> 5, 2 -> 20, 3 -> 45
    survivalScore -= serialPenalty;
    
    if (serialPenalty > 15.0) {
        risks.push("Proxy: Concentration sérielle exponentielle (Cluster artificiel).");
    }

    // 5. Calcul Final du score de survie
    survivalScore = Math.max(1, Math.min(99, Math.round(survivalScore)));

    if (survivalScore >= 95 && risks.length === 0) {
        risks.push("Proxy n'a détecté aucune faille structurelle majeure.");
    }

    return { survivalScore, risks };
};
