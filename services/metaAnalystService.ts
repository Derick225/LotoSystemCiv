import { 
  PlatinumResult, 
  DrawResult, 
  StrategyBias,
  PlatinumCombo,
  ScoreBreakdown
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';
import { 
    calculateVolatility, 
    calculateShannonEntropy, 
    detectGameRegime,
    calculateRegularity,
    calculateACValue
} from './mathService';

/**
 * Nexus MetaAnalyst v5.3 - Synchronized Synthesis Kernel
 * Fusionne les signaux algorithmiques pour générer des super-combinaisons à haute diversité.
 */

// Cache avec timestamp étendu à 1 heure pour optimiser les performances HPC
const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    // Cache valide 1 heure (3600000ms) selon spec v5.3
    if (cached && (now - cached.ts < 3600000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    // Profondeur augmentée à 100+ pour capturer les cycles de rupture
    const deepHistory = history.slice(0, 120);
    const masterPred = await generateMasterPrediction(drawName, deepHistory, weights, metrics, { runBacktest: true });
    
    const data = masterPred.breakdown || {};
    
    // Remplissage des vecteurs manquants (protection stochastique)
    for (let i = 1; i <= 90; i++) {
        if (!data[i]) {
            data[i] = { 
                frequency: 0, gap: 0, spectral: 0, fractal: 0, markov: 0, 
                wavelet: 0, momentum: 0, orchestration: 0, equilibrium: 50 
            } as any;
        }
    }

    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

/**
 * Calcule le biais optimal en fonction du régime du flux.
 */
export function calculateOptimalUserBias(drawName: string, history: DrawResult[]): StrategyBias {
    const vol = calculateVolatility(history);
    const ent = calculateShannonEntropy(history);
    const reg = detectGameRegime(history);
    const lastDraw = history[0];
    
    let stability = 0.35, chaos = 0.4, harmony = 0.45, wavelet = 0.5, orchestration = 0.55;
    
    if (ent.normalized > 0.9) {
        stability = 0.2; 
        orchestration += 0.2; 
    }

    const machineOverlap = lastDraw.machine ? lastDraw.gagnants.filter(n => lastDraw.machine?.includes(n)).length : 0;
    if (machineOverlap > 0) orchestration *= 1.35;
    
    if (vol.score > 60) { chaos = 0.75; stability = 0.25; }
    if (reg.regime === 'PERSISTANT') { stability = 0.7; harmony = 0.7; orchestration = 0.6; }
    
    return { stability, chaos, harmony, wavelet, orchestration };
}

/**
 * GÉNÉRATION PLATINUM FUSION v15.1 (TOURNAMENT EDITION)
 */
export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias?: StrategyBias
): Promise<PlatinumResult> {
    if (!history || history.length < 15) throw new Error("Historique insuffisant pour la synthèse.");

    const bias = userBias || calculateOptimalUserBias(drawName, history);
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const regularity = calculateRegularity(history);
    const pool = Object.keys(scores).map(Number);

    // --- PHASE 1 : IDENTIFICATION DES KING NUMBERS (DIVERSIFIÉS) ---
    // Contrainte v15 : avgGap > 10 pour éviter la saturation fréquentielle
    const rawKingPool = pool.map(n => {
        const b = scores[n];
        const val = ((b.spectral || 0) * bias.harmony) + 
                    ((b.momentum || 50) * bias.stability) + 
                    ((b.markov || 0) * bias.orchestration * 1.5) +
                    ((b.wavelet || 0) * (bias.wavelet || 0.5));
        return { num: n, val };
    });

    const kingNumbers = rawKingPool
        .filter(item => {
            const reg = regularity.find(r => r.number === item.num);
            return (reg?.avgGap || 0) > 10;
        })
        .sort((a, b) => b.val - a.val)
        .slice(0, 8)
        .map(k => k.num);

    // --- PHASE 2 : GÉNÉRATION PAR TOURNOI STOCHASTIQUE ---
    const combinations: PlatinumCombo[] = [];

    for (let i = 0; i < 5; i++) {
        let bestCombo: number[] = [];
        let maxFitness = -Infinity;

        // 100 cycles de sélection par ticket pour l'équilibre de Nash
        for (let attempt = 0; attempt < 100; attempt++) {
            const candidate: number[] = [];
            const tempPool = [...pool];
            let kingCount = 0;

            while (candidate.length < 5 && tempPool.length > 0) {
                // LOGIQUE TOURNOI v5.3 : Sélection pondérée
                let bestInTournament = -1;
                let topTournamentScore = -Infinity;

                // Tirage de 8 candidats pour comparaison
                for (let k = 0; k < 8; k++) {
                    const idx = Math.floor(Math.random() * tempPool.length);
                    const n = tempPool[idx];
                    const b = scores[n];
                    
                    // Formule de Score Composite
                    const score = ((b.spectral || 0) * bias.harmony) + 
                                  ((b.momentum || 0) * bias.stability) + 
                                  ((b.gap || 0) * bias.chaos);

                    if (score > topTournamentScore) {
                        topTournamentScore = score;
                        bestInTournament = n;
                    }
                }

                if (bestInTournament !== -1) {
                    const isKing = kingNumbers.includes(bestInTournament);
                    // Contrainte de diversité : Max 3 King Numbers par ticket
                    if (isKing && kingCount >= 3) {
                        tempPool.splice(tempPool.indexOf(bestInTournament), 1);
                        continue;
                    }

                    if (isKing) kingCount++;
                    candidate.push(bestInTournament);
                    tempPool.splice(tempPool.indexOf(bestInTournament), 1);
                }
            }

            candidate.sort((a, b) => a - b);
            
            // Évaluation de la fitness structurelle
            const sum = candidate.reduce((a, b) => a + b, 0);
            const ac = calculateACValue(candidate);
            let fitness = candidate.reduce((acc, n) => acc + (scores[n].spectral || 0), 0);
            
            if (sum >= 170 && sum <= 245) fitness += 30;
            if (ac >= 8) fitness += 20;

            if (fitness > maxFitness) {
                maxFitness = fitness;
                bestCombo = candidate;
            }
        }

        combinations.push({
            numbers: bestCombo,
            score: Math.min(99, Math.round(maxFitness / 6)),
            tags: i === 0 ? ["Alpha Fusion"] : ["Vecteur Tournoi"],
            breakdown: { 
                harmony: Math.round(bias.harmony * 100), 
                stability: Math.round(bias.stability * 100), 
                chaos: Math.round(bias.chaos * 100),
                kings: bestCombo.filter(n => kingNumbers.includes(n)).length
            }
        });
    }

    return {
        id: crypto.randomUUID(),
        kingNumbers: kingNumbers.map(n => ({ number: n, count: 1 })), 
        targetSumRange: { min: 170, max: 245, reason: "Équilibre de Nash (Tournament Edition)" },
        hotZonesSpectro: combinations[0].numbers,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: Math.round(combinations[0].score * 0.95),
        analysis: `Synthèse v15.1 active. Tournoi stochastique complété. Biais : Harmonie ${(bias.harmony*100).toFixed(0)}%, Stabilité ${(bias.stability*100).toFixed(0)}%, Chaos ${(bias.chaos*100).toFixed(0)}%. Diversité KingNumbers garantie (avg_gap > 10).`,
        drawName,
        timestamp: Date.now()
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existingStr = localStorage.getItem(key);
    const existing = existingStr ? JSON.parse(existingStr) : [];
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 10)));
};