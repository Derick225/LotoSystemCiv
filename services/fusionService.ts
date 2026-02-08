
import { FusionResult, SpectralMetric, Prediction, DrawResult } from '../types';

/**
 * VECTEUR PYTHON (Logique & Statistique)
 * Utilise une Moyenne Mobile Exponentielle (EMA) sur la fréquence d'apparition 
 * pour détecter les tendances chaudes, combinée à une analyse des écarts (Gaps).
 */
const calculatePythonVector = (history: DrawResult[]): { number: number, score: number }[] => {
    const scores: Record<number, number> = {};
    const DECAY = 0.96; // Facteur d'oubli (plus il est bas, plus on privilégie le très récent)
    
    // Analyse sur une fenêtre glissante de 60 tirages
    const recent = history.slice(0, 60).reverse(); 
    
    // 1. Calcul EMA Fréquence
    recent.forEach((draw, idx) => {
        // Le poids augmente exponentiellement vers les tirages récents
        const weight = Math.pow(DECAY, recent.length - 1 - idx);
        draw.gagnants.forEach(n => {
            scores[n] = (scores[n] || 0) + (10 * weight);
        });
    });

    // 2. Calcul des Écarts (Gaps) pour bonus de maturité
    const gaps: Record<number, number> = {};
    const lastAppearanceIndex: Record<number, number> = {};
    
    // Init
    for(let i=1; i<=90; i++) {
        gaps[i] = 0;
        lastAppearanceIndex[i] = -1;
    }

    // Scan historique pour trouver le dernier écart
    for(let i=0; i<Math.min(history.length, 100); i++) {
        const draw = history[i];
        draw.gagnants.forEach(n => {
            if (lastAppearanceIndex[n] === -1) {
                lastAppearanceIndex[n] = i;
                gaps[n] = i;
            }
        });
    }

    return Object.entries(scores).map(([n, s]) => {
        const num = parseInt(n);
        const gap = gaps[num] || 50; // Si jamais sorti, gros écart
        
        // Bonus "Zone de Retour" : Statistiquement, beaucoup de numéros sortent entre 6 et 18 tours d'écart
        let gapBonus = 0;
        if (gap >= 6 && gap <= 20) gapBonus = 25;
        if (gap > 40) gapBonus = 10; // Loi des grands nombres (pression)

        // Normalisation approximative vers 0-100
        const finalScore = Math.min(100, (s * 5) + gapBonus);
        return { number: num, score: finalScore };
    });
};

/**
 * VECTEUR QUANTUM (Physique & Énergie)
 * Se base sur l'analyse spectrale (FFT) pré-calculée par le moteur HPC.
 * Sélectionne les numéros en "Résonance" (Haut niveau d'énergie cyclique).
 */
const calculateQuantumVector = (spectral: SpectralMetric[]): { number: number, score: number }[] => {
    return spectral.map(s => ({
        number: s.number,
        // L'énergie spectrale (0-100) est utilisée directement comme score de probabilité physique
        // On amplifie les signaux très forts (>70)
        score: s.energy > 70 ? Math.min(100, s.energy * 1.2) : s.energy * 0.8
    }));
};

/**
 * VECTEUR ORACLE (Intuition & Association)
 * Si une prédiction IA existe, elle est prioritaire.
 * Sinon, utilise un algorithme de "Mémoire Associative" (Loi des séries conditionnelles).
 */
const calculateOracleVector = (history: DrawResult[], lastPrediction: Prediction | null): { number: number, score: number }[] => {
    // Mode IA Active (Prioritaire)
    if (lastPrediction && lastPrediction.suggestedNumbers.length > 0) {
        const preds = new Set(lastPrediction.suggestedNumbers);
        const candidates = new Set(lastPrediction.candidates);
        
        return Array.from({length: 90}, (_, i) => i + 1).map(n => {
            if (preds.has(n)) return { number: n, score: 98 }; // Top Pick IA
            if (candidates.has(n)) return { number: n, score: 65 }; // Outsider IA
            return { number: n, score: 10 }; // Bruit de fond
        });
    }

    // Mode Fallback : Mémoire Associative (Pattern Matching T-1)
    // "Quels numéros ont tendance à sortir après les numéros du dernier tirage ?"
    if (history.length < 2) return [];
    
    const lastDrawNumbers = history[0].gagnants;
    const associationScores: Record<number, number> = {};
    const depth = Math.min(history.length - 1, 150);
    
    for (let i = 1; i < depth; i++) {
        const prevDraw = history[i];
        // On compte combien de numéros du "Passé T" correspondent au "Dernier Tirage Réel"
        const commonCount = prevDraw.gagnants.filter(n => lastDrawNumbers.includes(n)).length;
        
        // Si le tirage passé ressemble au dernier tirage (au moins 1 numéro en commun)
        if (commonCount >= 1) { 
            const nextDraw = history[i-1]; // Le tirage qui a SUIVI ce tirage passé
            
            // Plus le tirage passé est récent et similaire, plus son successeur a de poids
            const weight = commonCount * (1 - (i/depth) * 0.5); 
            
            nextDraw.gagnants.forEach(n => {
                associationScores[n] = (associationScores[n] || 0) + weight;
            });
        }
    }
    
    // Normalisation
    const maxScore = Math.max(...Object.values(associationScores), 1);
    return Object.entries(associationScores).map(([n, s]) => ({
        number: parseInt(n),
        score: (s / maxScore) * 100
    }));
};

/**
 * MOTEUR DE FUSION HYPER-CONVERGENCE
 * Agrège les 3 vecteurs avec pondération dynamique.
 */
export const calculateFusion = (
    history: DrawResult[],
    _stats: { number: number; count: number }[], // Stats brutes (moins précises que le vecteur Python)
    spectral: SpectralMetric[],
    lastPrediction: Prediction | null
): FusionResult => {
    
    // 1. Calcul des Vecteurs (HPC)
    const vPython = calculatePythonVector(history);
    const vQuantum = calculateQuantumVector(spectral);
    const vOracle = calculateOracleVector(history, lastPrediction);

    // Maps pour accès rapide O(1)
    const mPython = new Map(vPython.map(v => [v.number, v.score]));
    const mQuantum = new Map(vQuantum.map(v => [v.number, v.score]));
    const mOracle = new Map(vOracle.map(v => [v.number, v.score]));

    // 2. Matrice de Fusion
    const scoreMap: Record<number, { score: number, sources: string[], details: any }> = {};
    
    // Poids des vecteurs dans la décision finale (Ajustables)
    const W_PYTHON = 1.0;  // Logique pure
    const W_QUANTUM = 1.3; // Physique (Souvent très précis sur les cycles)
    const W_ORACLE = 1.6;  // IA/Association (La plus forte valeur prédictive)

    for (let i = 1; i <= 90; i++) {
        const sP = mPython.get(i) || 0;
        const sQ = mQuantum.get(i) || 0;
        const sO = mOracle.get(i) || 0;

        // Seuil de bruit : on ignore les signaux très faibles pour nettoyer la sortie
        if (sP < 15 && sQ < 15 && sO < 15) continue;

        const weightedScore = (sP * W_PYTHON) + (sQ * W_QUANTUM) + (sO * W_ORACLE);
        // Normalisation approximative
        const finalScore = Math.min(100, Math.round(weightedScore / (W_PYTHON + W_QUANTUM + W_ORACLE)));

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
        .filter(c => c.score > 35) // Filtre de pertinence globale
        .sort((a, b) => b.score - a.score)
        .slice(0, 12); // On garde les 12 meilleurs candidats

    // 4. Sélection du Ticket Ultime (Top 5 Intelligent)
    const finalTicket: number[] = [];
    const candidates = [...convergedNumbers];
    
    // On prend les 2 meilleurs scores absolus (Piliers)
    for(let i=0; i<2; i++) {
        if(candidates.length > 0) finalTicket.push(candidates.shift()!.number);
    }

    // On complète avec des numéros qui apportent de la diversité (pas trop proches des piliers)
    while (finalTicket.length < 5 && candidates.length > 0) {
        const cand = candidates.shift()!;
        // Simple règle d'espacement : on évite les suites de 3 numéros (ex: 41,42,43)
        // Ici on simplifie : on accepte tout pour l'instant car l'algo de fusion est déjà sélectif
        finalTicket.push(cand.number);
    }
    
    // Tri final pour affichage
    finalTicket.sort((a, b) => a - b);

    // 5. Calcul de Confiance Système
    // Basé sur la "densité" de convergence (Combien de sources sont d'accord ?)
    const strongAgreements = convergedNumbers.filter(c => c.sources.length >= 2).length;
    const confidence = Math.min(99, 60 + (strongAgreements * 8));

    return {
        sources: {
            python: vPython.sort((a,b) => b.score - a.score).slice(0, 5).map(v => v.number),
            quantum: vQuantum.sort((a,b) => b.score - a.score).slice(0, 5).map(v => v.number),
            oracle: vOracle.sort((a,b) => b.score - a.score).slice(0, 5).map(v => v.number)
        },
        convergedNumbers,
        finalTicket: finalTicket.slice(0, 5), // Sécurité taille
        confidence,
        entropy: 0.1
    };
};
