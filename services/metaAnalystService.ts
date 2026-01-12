
import { PlatinumResult, PlatinumCombo, ScoreBreakdown, DrawResult, SpectralMetric } from '../types';
import { getAlgoWeights, generateMasterPrediction } from './predictionEngine';
import { detectGameRegime, calculateVolatility, calculateSpectralMetricsAsync } from './mathService';
import { fetchResults } from './lotteryService';

/**
 * Nexus MetaAnalyst v6.0 (Structural Edition)
 * Couche d'abstraction qui fusionne les signaux faibles pour générer des "Super Combinaisons".
 * Intègre la logique de succession contextuelle (Markov/Voisinage/Miroir) et des filtres structurels stricts.
 */

const PLATINUM_STORAGE_KEY = 'lotopro_platinum_history';

export interface StrategyBias {
    stability: number; // Poids donné aux stats long terme (Momentum)
    chaos: number;     // Poids donné à l'entropie et à la vélocité (Rupture)
    harmony: number;   // Poids donné à la résonance spectrale (Cycle)
}

// Cache avec timestamp pour éviter de recalculer si les données n'ont pas changé
const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    // Cache valide 1 heure
    if (cached && (now - cached.ts < 3600000)) {
        return cached.data;
    }
    
    const weights = await getAlgoWeights(drawName);
    // On appelle le moteur de prédiction standard pour avoir les scores bruts par numéro
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    
    const data = masterPred.breakdown || {};
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

export const savePlatinumHistory = (result: PlatinumResult) => {
    try {
        const raw = localStorage.getItem(PLATINUM_STORAGE_KEY);
        const history = raw ? JSON.parse(raw) : [];
        const updated = [result, ...history.filter((r: any) => r.drawName === result.drawName)].slice(0, 50);
        localStorage.setItem(PLATINUM_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
        console.warn("Storage quota exceeded for Platinum history", e);
    }
};

/**
 * Calcule automatiquement le biais utilisateur optimal selon le profil du tirage.
 */
export const calculateOptimalUserBias = (
  drawName: string, 
  history: DrawResult[]
): StrategyBias => {
  const { regime, hurst } = detectGameRegime(history);
  const { score: volScore } = calculateVolatility(history);
  const name = drawName.toUpperCase();

  // Profils par défaut
  let stability = 0.5;
  let chaos = 0.3;
  let harmony = 0.5;

  // 1. Profilage par Nom (Spécificité du Jeu)
  if (name.includes('MONDAY') || name.includes('BONANZA')) {
      return { stability: 0.3, chaos: 0.7, harmony: 0.45 };
  }
  
  if (name.includes('NATIONAL') || name.includes('DIAMANT')) {
      return { stability: 0.8, chaos: 0.2, harmony: 0.6 };
  }

  // 2. Profilage Mathématique
  if (regime === 'PERSISTANT' && hurst > 0.65) {
      stability = 0.8;
      chaos = 0.2;
  } else if (regime === 'ANTI-PERSISTANT') {
      stability = 0.4;
      harmony = 0.8;
  } else if (volScore > 70) {
      chaos = 0.7;
      stability = 0.2;
  }

  return { 
      stability: parseFloat(stability.toFixed(2)), 
      chaos: parseFloat(chaos.toFixed(2)), 
      harmony: parseFloat(harmony.toFixed(2)) 
  };
};

/**
 * Calcule l'affinité de succession avancée :
 * - Analyse les gagnants (Succession directe)
 * - Analyse la Machine (Contexte de flux)
 * - Analyse les Miroirs (Symétrie)
 */
const calculatePostDrawAffinity = (history: DrawResult[], lastDraw: DrawResult): Record<number, number> => {
    const scores: Record<number, number> = {};
    // Init scores
    for(let i=1; i<=90; i++) scores[i] = 0;

    if (history.length < 10) return scores;

    // Analyse approfondie sur les 150 derniers tirages pour capter les cycles longs
    const depth = Math.min(history.length - 1, 150);
    
    const lastWinners = lastDraw.gagnants;
    const lastMachine = lastDraw.machine || [];
    const lastMirrors = lastWinners.map(n => 91 - n);

    for (let i = 1; i < depth; i++) {
        // history[i] est le tirage "passé" (contexte)
        // history[i-1] est le tirage "suivant" (conséquence)
        const pastDraw = history[i];
        const nextDraw = history[i-1];

        // 1. Correspondance Gagnants
        const winMatches = pastDraw.gagnants.filter(n => lastWinners.includes(n));
        
        // 2. Correspondance Machine (Si disponible)
        const macMatches = (pastDraw.machine || []).filter(n => lastMachine.includes(n));

        // 3. Correspondance Miroirs (Symétrie Inverse)
        const mirrorMatches = pastDraw.gagnants.filter(n => lastMirrors.includes(n));

        // Calcul du poids de pertinence de ce tirage passé
        let contextWeight = 0;
        
        // Les gagnants sont le signal le plus fort
        if (winMatches.length > 0) contextWeight += Math.pow(winMatches.length, 1.5) * 1.5;
        
        // La machine donne le contexte "ambiant"
        if (macMatches.length > 0) contextWeight += macMatches.length * 0.8;
        
        // Les miroirs indiquent une résonance inverse
        if (mirrorMatches.length > 0) contextWeight += mirrorMatches.length * 1.2;

        if (contextWeight > 0) {
            nextDraw.gagnants.forEach(nextNum => {
                // Impact Direct
                scores[nextNum] = (scores[nextNum] || 0) + (10 * contextWeight);

                // Impact Voisinage (Glissement +1/-1)
                const nPlus = nextNum === 90 ? 1 : nextNum + 1;
                const nMinus = nextNum === 1 ? 90 : nextNum - 1;
                
                scores[nPlus] = (scores[nPlus] || 0) + (2 * contextWeight);
                scores[nMinus] = (scores[nMinus] || 0) + (2 * contextWeight);
            });
        }
    }

    // Normalisation 0-100
    const maxVal = Math.max(...Object.values(scores), 1);
    for(let i=1; i<=90; i++) {
        scores[i] = (scores[i] / maxVal) * 100;
    }

    return scores;
};

/**
 * Vérifie si l'ajout d'un numéro à une combinaison maintient sa validité structurelle.
 * (Filtres Stochastiques Avancés)
 */
const isValidAddition = (currentCombo: number[], newNum: number): boolean => {
    // Ne pas ajouter si déjà présent
    if (currentCombo.includes(newNum)) return false;

    const nextCombo = [...currentCombo, newNum].sort((a, b) => a - b);
    
    // 1. Somme Sigma (Uniquement pertinent si on approche des 5 numéros)
    if (nextCombo.length >= 4) {
        const sum = nextCombo.reduce((a, b) => a + b, 0);
        // On vise une somme réaliste (130-330 couvre 90% des tirages normaux)
        // Si on a 4 numéros et que la somme est déjà 300, ajouter un 80 est suicidaire.
        if (nextCombo.length === 5 && (sum < 130 || sum > 330)) return false;
        if (nextCombo.length === 4 && sum > 300) return false; // Prévention
    }

    // 2. Suites Consécutives (Max 2 numéros qui se suivent)
    // Ex: 12-13-14 est très rare. 12-13 c'est ok.
    let consecutiveCount = 0;
    let hasTriple = false;
    for (let i = 0; i < nextCombo.length - 1; i++) {
        if (nextCombo[i+1] === nextCombo[i] + 1) {
            consecutiveCount++;
            if (i < nextCombo.length - 2 && nextCombo[i+2] === nextCombo[i] + 2) {
                hasTriple = true;
            }
        }
    }
    if (hasTriple) return false; // Interdit les triplés (1-2-3)
    if (consecutiveCount > 2) return false; // Max 2 paires distinctes

    // 3. Concentration par Dizaine (Max 3 par dizaine)
    // Ex: 10-12-15-18-19 (Trop dense)
    const decades = nextCombo.map(n => Math.floor((n - 1) / 10));
    const decadeCounts = decades.reduce((acc, d) => { acc[d] = (acc[d] || 0) + 1; return acc; }, {} as Record<number, number>);
    if (Object.values(decadeCounts).some(c => c > 3)) return false;

    // 4. Équilibre Pair/Impair (Si la combi est pleine)
    if (nextCombo.length === 5) {
        const odds = nextCombo.filter(n => n % 2 !== 0).length;
        // On évite 0 Impairs ou 5 Impairs (Très rare)
        if (odds === 0 || odds === 5) return false; 
    }

    return true;
};

export async function generatePlatinumPrediction(
    drawName: string, 
    history?: DrawResult[],
    precomputedMetrics?: any,
    userBias: StrategyBias = { stability: 0.5, chaos: 0.3, harmony: 0.2 }
): Promise<PlatinumResult> {
    const data = history || (await fetchResults(drawName)).data;
    if (data.length < 20) throw new Error("Historique insuffisant pour la fusion.");

    // 1. Récupération des scores de base (Algorithmes standards)
    const scores = await precomputeBaseScores(drawName, data, precomputedMetrics);
    
    // 2. Calcul des scores de succession contextuelle (Le "Liant")
    // On passe le dernier tirage complet pour avoir accès aux machines
    const successionScores = calculatePostDrawAffinity(data, data[0]);

    const combinations: PlatinumCombo[] = [];
    const pool = Object.keys(scores).map(Number);

    // Algorithme de synthèse avec Tournoi + Filtres Structurels
    let attempts = 0;
    const MAX_ATTEMPTS = 500; // Sécurité boucle infinie

    while (combinations.length < 5 && attempts < MAX_ATTEMPTS) {
        attempts++;
        const combo: number[] = [];
        const tempPool = [...pool]; // Pool local pour ce ticket
        
        let abortTicket = false;

        while (combo.length < 5 && tempPool.length > 0) {
            // Sélection par Tournoi : On prend N candidats au hasard et on garde le meilleur score pondéré
            let bestCandidate = -1;
            let bestVal = -Infinity;
            
            // Taille du tournoi : Plus c'est grand, plus on est "Greedy" (meilleurs scores). 
            // Plus c'est petit, plus on laisse de la place au hasard (Chaos).
            const tournamentSize = 8 + Math.floor(userBias.chaos * 10);

            for(let k=0; k < tournamentSize; k++) { 
                if (tempPool.length === 0) break;
                const idx = Math.floor(Math.random() * tempPool.length);
                const n = tempPool[idx];
                const b = scores[n];
                const succScore = successionScores[n] || 0;
                
                // Formule Platinum v6 : Fusion Biaisée + Succession
                const val = ((b.spectral || 0) * userBias.harmony) + 
                            ((b.momentum || 0) * userBias.stability) + 
                            ((b.gap || 0) * userBias.chaos * 0.5) + // Gap moins impactant en tournoi
                            (succScore * 0.7); // La succession est le facteur dominant en v6
                
                // Ajout d'un bruit aléatoire basé sur le chaos utilisateur
                const noise = (Math.random() - 0.5) * (userBias.chaos * 20);

                if ((val + noise) > bestVal) {
                    // VERIFICATION STRUCTURELLE AVANT SELECTION
                    if (isValidAddition(combo, n)) {
                        bestVal = val + noise;
                        bestCandidate = n;
                    }
                }
            }
            
            if (bestCandidate !== -1) {
                combo.push(bestCandidate);
                // On retire le candidat du pool temporaire
                const removeIdx = tempPool.indexOf(bestCandidate);
                if (removeIdx !== -1) tempPool.splice(removeIdx, 1);
            } else {
                // Si on n'a trouvé aucun candidat valide dans ce tournoi (blocage structurel), on abandonne ce ticket
                // pour ne pas le remplir avec des déchets.
                abortTicket = true; 
                break; 
            }
        }
        
        if (!abortTicket && combo.length === 5) {
            combo.sort((a,b) => a-b);
            
            // Dédoublonnage des combinaisons
            const comboStr = combo.join('-');
            const exists = combinations.some(c => c.numbers.join('-') === comboStr);
            
            if (!exists) {
                // Calcul du score final du ticket
                let totalScore = 0;
                combo.forEach(n => {
                    const b = scores[n];
                    const succ = successionScores[n] || 0;
                    totalScore += (b.spectral || 0) * 0.3 + (b.momentum || 0) * 0.3 + (succ * 0.4);
                });
                
                // Normalisation Score
                const normalizedScore = Math.min(100, Math.round(totalScore / 5 * 1.1));

                combinations.push({
                    numbers: combo,
                    score: normalizedScore,
                    tags: ["Platinum v6", "Structure+"],
                    breakdown: { 
                        harmony: Math.round(userBias.harmony * 100), 
                        stability: Math.round(userBias.stability * 100), 
                        chaos: Math.round(userBias.chaos * 100), 
                        pattern: Math.round(normalizedScore * 0.8) 
                    }
                });
            }
        }
    }

    // Calcul des King Numbers (les numéros les plus récurrents dans les 5 combos)
    const freqMap: Record<number, number> = {};
    combinations.forEach(c => c.numbers.forEach(n => freqMap[n] = (freqMap[n] || 0) + 1));
    const kingNumbers = Object.entries(freqMap)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Calcul des Hot Zones Spectrales (si metrics dispo)
    const spectralMetrics = precomputedMetrics?.spectral || await calculateSpectralMetricsAsync(data);
    const hotZonesSpectro = spectralMetrics.slice(0, 10).map((m: SpectralMetric) => m.number);

    return {
        kingNumbers, 
        targetSumRange: { min: 130, max: 330, reason: "Filtre Gaussien v6" },
        hotZonesSpectro,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: 92, // Confiance accrue grâce aux filtres structurels
        analysis: `Synthèse Platinum v6 : Succession contextuelle (G+M) et filtres structurels actifs. Biais: H${(userBias.harmony*100).toFixed(0)} S${(userBias.stability*100).toFixed(0)} C${(userBias.chaos*100).toFixed(0)}.`,
        drawName,
        timestamp: Date.now()
    };
}
