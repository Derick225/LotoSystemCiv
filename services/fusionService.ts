
import { FusionResult, SpectralMetric, Prediction, DrawResult, AlgoWeights } from '../types';

/**
 * VECTEUR PYTHON (Logique & Statistique)
 * Utilise une Moyenne Mobile Exponentielle (EMA) sur la fréquence d'apparition 
 * pour détecter les tendances chaudes, combinée à une analyse des écarts (Gaps).
 */
const calculatePythonVector = (history: DrawResult[]): { number: number, score: number }[] => {
    // Optimisation : TypedArrays pour performance mémoire et calcul
    const scores = new Float32Array(91); // Index 1-90
    const gaps = new Int16Array(91);
    
    const ALPHA = 0.15; // Facteur de lissage exponentiel
    const limit = Math.min(history.length, 100);
    
    // Calcul EMA (Exponential Moving Average) inversé (du plus ancien au plus récent)
    // On doit inverser l'historique pour que l'EMA fonctionne chronologiquement
    const chronoHistory = [];
    for(let i=limit-1; i>=0; i--) chronoHistory.push(history[i]);

    for (const draw of chronoHistory) {
        for (let num = 1; num <= 90; num++) {
            const isPresent = draw.gagnants.includes(num) ? 1 : 0;
            // Formule EMA : Val_t = alpha * x_t + (1-alpha) * Val_t-1
            scores[num] = (ALPHA * (isPresent * 100)) + ((1 - ALPHA) * scores[num]);
        }
    }

    // Calcul des Écarts (Gaps) sur l'historique original (récent -> ancien)
    for (let num = 1; num <= 90; num++) {
        let gap = 0;
        for (const draw of history) {
            if (draw.gagnants.includes(num)) break;
            gap++;
        }
        gaps[num] = gap;
    }

    const result = [];
    for (let num = 1; num <= 90; num++) {
        let finalScore = scores[num];
        const gap = gaps[num];
        
        finalScore = Math.min(100, finalScore * 4); 

        // Bonus Maturité (Loi du retour)
        if (gap >= 10 && gap <= 30) finalScore += 15;
        if (gap > 40) finalScore += 25;

        result.push({ 
            number: num, 
            score: Math.min(100, Math.round(finalScore)) 
        });
    }

    return result;
};

/**
 * VECTEUR QUANTUM (Physique & Énergie)
 * Se base sur l'analyse spectrale (FFT).
 */
const calculateQuantumVector = (spectral: SpectralMetric[]): { number: number, score: number }[] => {
    return spectral.map(s => ({
        number: s.number,
        score: s.energy > 70 ? Math.min(100, s.energy * 1.2) : s.energy * 0.8
    }));
};

/**
 * VECTEUR ORACLE (Intuition & Association)
 */
const calculateOracleVector = (history: DrawResult[], lastPrediction: Prediction | null): { number: number, score: number }[] => {
    if (lastPrediction && lastPrediction.suggestedNumbers.length > 0) {
        const preds = new Set(lastPrediction.suggestedNumbers);
        const candidates = new Set(lastPrediction.candidates);
        
        return Array.from({length: 90}, (_, i) => i + 1).map(n => {
            if (preds.has(n)) return { number: n, score: 98 };
            if (candidates.has(n)) return { number: n, score: 65 };
            return { number: n, score: 10 };
        });
    }

    if (history.length < 2) return [];
    
    // Fallback : Analyse associative simple si pas de prédiction Oracle active
    const lastDrawNumbers = history[0].gagnants;
    const associationScores = new Float32Array(91);
    const depth = Math.min(history.length - 1, 150);
    
    for (let i = 1; i < depth; i++) {
        const prevDraw = history[i];
        const commonCount = prevDraw.gagnants.filter(n => lastDrawNumbers.includes(n)).length;
        
        if (commonCount >= 1) { 
            const nextDraw = history[i-1];
            // Poids décroissant selon la profondeur
            const weight = commonCount * (1 - (i/depth) * 0.5); 
            
            nextDraw.gagnants.forEach(n => {
                associationScores[n] += weight;
            });
        }
    }
    
    const maxScore = Math.max(...associationScores) || 1;
    const result = [];
    for(let i=1; i<=90; i++) {
        result.push({ number: i, score: (associationScores[i] / maxScore) * 100 });
    }
    return result;
};

/**
 * MOTEUR DE FUSION HYPER-CONVERGENCE (DNA-AWARE)
 * Agrège les 3 vecteurs en respectant scrupuleusement les poids de l'ADN Algorithmique.
 */
export const calculateFusion = (
    history: DrawResult[],
    _stats: { number: number; count: number }[],
    spectral: SpectralMetric[],
    lastPrediction: Prediction | null,
    weights: AlgoWeights // INJECTION ADN
): FusionResult => {
    
    // 1. Calcul des Vecteurs (HPC)
    const vPython = calculatePythonVector(history);
    const vQuantum = calculateQuantumVector(spectral);
    const vOracle = calculateOracleVector(history, lastPrediction);

    const mPython = new Map(vPython.map(v => [v.number, v.score]));
    const mQuantum = new Map(vQuantum.map(v => [v.number, v.score]));
    const mOracle = new Map(vOracle.map(v => [v.number, v.score]));

    // 2. Détermination des coefficients de mélange via l'ADN
    // On regroupe les paramètres ADN par famille de vecteur
    const dnaLogic = (weights.frequency || 0) + (weights.gap || 0) + (weights.momentum || 0) + (weights.equilibrium || 0);
    const dnaPhysics = (weights.spectral || 0) + (weights.fractal || 0) + (weights.spatial || 0) + (weights.wavelet || 0);
    const dnaIntuition = (weights.markov || 0) + (weights.ai_intuition || 0) + (weights.anti_consensus || 0) + (weights.orchestration || 0);

    // Facteur de base (1.0) + Bonus ADN
    // Si l'utilisateur met "Frequency" à fond, dnaLogic augmente, donc W_PYTHON augmente.
    const W_PYTHON = 1.0 + (dnaLogic * 2); 
    const W_QUANTUM = 1.0 + (dnaPhysics * 2);
    const W_ORACLE = 1.0 + (dnaIntuition * 2);

    const scoreMap: Record<number, { score: number, sources: string[], details: any }> = {};
    const entropyCounts = new Float32Array(91); // Pour le calcul d'entropie

    for (let i = 1; i <= 90; i++) {
        const sP = mPython.get(i) || 0;
        const sQ = mQuantum.get(i) || 0;
        const sO = mOracle.get(i) || 0;

        // Seuil de bruit
        if (sP < 15 && sQ < 15 && sO < 15) continue;

        // Moyenne pondérée par l'ADN
        const weightedScore = (sP * W_PYTHON) + (sQ * W_QUANTUM) + (sO * W_ORACLE);
        const finalScore = Math.min(100, Math.round(weightedScore / (W_PYTHON + W_QUANTUM + W_ORACLE)));
        
        entropyCounts[i] = finalScore;

        const sources = [];
        if (sP > 50) sources.push('Logique');
        if (sQ > 50) sources.push('Physique');
        if (sO > 50) sources.push('Intuition');

        scoreMap[i] = {
            score: finalScore,
            sources,
            details: { P: Math.round(sP), Q: Math.round(sQ), O: Math.round(sO) }
        };
    }

    // 3. Extraction et Tri (Convergence)
    const convergedNumbers = Object.entries(scoreMap)
        .map(([n, data]) => ({
            number: parseInt(n),
            score: data.score,
            sources: data.sources,
            details: data.details
        }))
        .filter(c => c.score > 35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

    // 4. Sélection du Ticket Ultime
    const finalTicket: number[] = [];
    const candidates = [...convergedNumbers];
    
    // Stratégie Pilier (Top 2) + Diversité (Suivants)
    for(let i=0; i<2; i++) {
        if(candidates.length > 0) finalTicket.push(candidates.shift()!.number);
    }
    while (finalTicket.length < 5 && candidates.length > 0) {
        const cand = candidates.shift()!;
        finalTicket.push(cand.number);
    }
    
    finalTicket.sort((a, b) => a - b);

    // 5. Confiance Système (Ajustée par la cohérence avec l'ADN)
    const strongAgreements = convergedNumbers.filter(c => c.sources.length >= 2).length;
    const confidence = Math.min(99, 60 + (strongAgreements * 8));

    // 6. Calcul Entropie de Shannon sur les scores
    // Mesure la diversité de la distribution des probabilités
    let entropy = 0;
    let sumScores = 0;
    for(let i=1; i<=90; i++) sumScores += entropyCounts[i];
    
    if (sumScores > 0) {
        for(let i=1; i<=90; i++) {
            if (entropyCounts[i] > 0) {
                const p = entropyCounts[i] / sumScores;
                entropy -= p * Math.log(p);
            }
        }
    }
    // Normalisation approximative (Max entropy ~ log(90) = 4.5)
    const normalizedEntropy = entropy / Math.log(90);

    return {
        sources: {
            python: vPython.sort((a,b) => b.score - a.score).slice(0, 5).map(v => v.number),
            quantum: vQuantum.sort((a,b) => b.score - a.score).slice(0, 5).map(v => v.number),
            oracle: vOracle.sort((a,b) => b.score - a.score).slice(0, 5).map(v => v.number)
        },
        convergedNumbers,
        finalTicket: finalTicket.slice(0, 5),
        confidence,
        entropy: parseFloat(normalizedEntropy.toFixed(3))
    };
};
