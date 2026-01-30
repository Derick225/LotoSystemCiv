
import { 
  PlatinumResult, 
  DrawResult, 
  StrategyBias,
  PlatinumCombo,
  ScoreBreakdown,
  SymbioticContext,
  FractalMetric,
  SpectralMetric
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';
import { 
    calculateVolatility, 
    calculateShannonEntropy, 
    calculateACValue
} from './mathService';

/**
 * Nexus MetaAnalyst v17.5 - Deep Calibration Kernel
 * Optimisé pour les datasets "Gagnants Uniquement" et la gestion des amplitudes extrêmes.
 * Intègre maintenant le contexte symbiotique pour le veto/boost.
 */

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    if (cached && (now - cached.ts < 1800000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    const deepHistory = history.slice(0, 120);
    
    const masterPred = await generateMasterPrediction(drawName, deepHistory, weights, metrics);
    
    const data = masterPred.breakdown || {};
    
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
 * Calcule les biais optimaux en analysant la profondeur historique, le régime fractal et l'énergie spectrale.
 * Retourne les biais et un rapport de raisonnement.
 */
export function calculateOptimalUserBias(
    drawName: string, 
    history: DrawResult[],
    metrics?: { 
        fractal?: FractalMetric[], 
        spectral?: SpectralMetric[],
        volatility?: { score: number }
    }
): { bias: StrategyBias, reasoning: string } {
    
    // Valeurs de base équilibrées
    let bias: StrategyBias = {
        stability: 0.35,
        chaos: 0.40,
        harmony: 0.45,
        wavelet: 0.50,
        orchestration: 0.40
    };

    const reasoningParts: string[] = [];

    // 1. Analyse Machine (Fuites de données)
    const checkDepth = Math.min(history.length, 20);
    let machineLeakCount = 0;
    let totalMachineChecks = 0;
    
    for (let i = 0; i < checkDepth - 1; i++) {
        const currentDraw = history[i];
        const prevDraw = history[i+1];
        if (prevDraw.machine && prevDraw.machine.length > 0) {
            const leaks = currentDraw.gagnants.filter(n => prevDraw.machine?.includes(n)).length;
            machineLeakCount += leaks;
            totalMachineChecks += 5;
        }
    }
    
    const leakageRate = totalMachineChecks > 0 ? (machineLeakCount / totalMachineChecks) : 0;
    
    if (leakageRate > 0.12) {
        bias.orchestration = 0.8; // Forte corrélation machine
        reasoningParts.push("Translocation Machine active");
    } else if (leakageRate < 0.05) {
        bias.orchestration = 0.2; // Jeu organique
        bias.chaos += 0.1; // Compensation par le chaos
        reasoningParts.push("Flux Organique (Sans Machine)");
    }

    // 2. Analyse Fractale (Exposant de Hurst Global)
    if (metrics?.fractal && metrics.fractal.length > 0) {
        // Moyenne du Hurst sur les numéros chauds
        const avgHurst = metrics.fractal.slice(0, 10).reduce((acc, curr) => acc + curr.hurst, 0) / 10;
        
        if (avgHurst > 0.60) {
            // Régime Persistant (Les tendances durent) -> Favoriser Stabilité
            bias.stability += 0.25;
            bias.wavelet -= 0.1;
            reasoningParts.push("Régime Persistant (Hurst > 0.6)");
        } else if (avgHurst < 0.40) {
            // Régime Anti-Persistant (Retour à la moyenne rapide) -> Favoriser Wavelet/Harmony
            bias.wavelet += 0.2;
            bias.harmony += 0.15;
            bias.stability -= 0.1;
            reasoningParts.push("Régime de Rebond (Hurst < 0.4)");
        }
    }

    // 3. Analyse Spectrale (Résonance)
    if (metrics?.spectral && metrics.spectral.length > 0) {
        const maxEnergy = Math.max(...metrics.spectral.map(s => s.energy));
        if (maxEnergy > 85) {
            bias.harmony += 0.25; // Forte cyclicité détectée
            reasoningParts.push("Résonance Harmonique Forte");
        }
    }

    // 4. Analyse Volatilité (Entropie)
    const volScore = metrics?.volatility?.score || calculateVolatility(history).score;
    
    if (volScore > 70) {
        bias.chaos = 0.8; // Haute volatilité -> Mode Chaos
        bias.stability = 0.2;
        reasoningParts.push("Haute Volatilité (Mode Chaos)");
    } else if (volScore < 30) {
        bias.chaos = 0.2;
        bias.stability += 0.1;
        bias.harmony += 0.1;
        reasoningParts.push("Flux Laminaire (Stable)");
    }

    // Normalisation finale (Clamping 0.1 - 1.0)
    Object.keys(bias).forEach(key => {
        const k = key as keyof StrategyBias;
        bias[k] = Math.max(0.1, Math.min(1.0, parseFloat(bias[k].toFixed(2))));
    });

    return { 
        bias, 
        reasoning: reasoningParts.length > 0 ? reasoningParts.join(" • ") : "Calibration Standard Optimisée" 
    };
}

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias?: StrategyBias,
    symbioticContext?: SymbioticContext | null
): Promise<PlatinumResult> {
    if (!history || history.length < 15) throw new Error("Historique insuffisant pour la synthèse.");

    // Si aucun biais utilisateur fourni, on calcule le biais optimal
    let activeBias = userBias;
    if (!activeBias) {
        const calc = calculateOptimalUserBias(drawName, history, precomputedMetrics);
        activeBias = calc.bias;
    }

    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    
    // --- FILTRAGE SYMBIOTIQUE (V17 Core) ---
    // On retire les numéros veto du pool de base AVANT la sélection
    let pool = Object.keys(scores).map(Number);
    
    if (symbioticContext) {
        // Exclusion stricte des zones mortes spatiales
        pool = pool.filter(n => !symbioticContext.spatialDeadZones.includes(n));
    }

    // Analyse du dernier tirage pour déterminer la tendance de Somme
    const lastDrawSum = history[0].gagnants.reduce((a,b) => a+b, 0);
    const targetLowSum = lastDrawSum > 280; // Si dernier tirage très haut (ex: 395), on vise bas
    const targetHighSum = lastDrawSum < 160; // Si dernier tirage très bas (ex: 133), on vise haut

    // --- SÉLECTION DES "KING NUMBERS" ---
    
    // 1. Hot Kings (Fréquence pure) + Boost Spatial
    const hotKings = pool
        .map(n => {
            const localFreq = history.slice(0, 12).filter(d => d.gagnants.includes(n)).length;
            let val = scores[n].frequency || 0;
            // Boost symbiotique
            if (symbioticContext?.spatialHotZones.includes(n)) val *= 1.5;
            if (symbioticContext?.orchestrationBoosts[n]) val *= symbioticContext.orchestrationBoosts[n];
            
            return { num: n, freq: localFreq, score: val };
        })
        .filter(item => item.freq >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(k => k.num);

    // 2. Corrective Kings (Basés sur l'équilibre de Somme)
    const correctiveKings = pool
        .map(n => ({ num: n, score: scores[n].spectral || 0 }))
        .filter(item => {
            if (targetLowSum) return item.num <= 45; // On cherche des petits
            if (targetHighSum) return item.num > 45; // On cherche des grands
            return true; // Sinon tout
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(k => k.num);

    const kingNumbers = Array.from(new Set([...hotKings, ...correctiveKings])).slice(0, 8);

    const combinations: PlatinumCombo[] = [];

    // --- GÉNÉRATION TOURNOI ---
    for (let i = 0; i < 5; i++) {
        let bestCombo: number[] = [];
        let maxFitness = -Infinity;

        for (let attempt = 0; attempt < 150; attempt++) {
            const candidate: number[] = [];
            const tempPool = [...pool];
            let kingCount = 0;

            while (candidate.length < 5 && tempPool.length > 0) {
                let bestInTournament = -1;
                let topTournamentScore = -Infinity;

                for (let k = 0; k < 10; k++) { 
                    const idx = Math.floor(Math.random() * tempPool.length);
                    const n = tempPool[idx];
                    const b = scores[n];
                    
                    const score = ((b.spectral || 0) * activeBias.harmony) + 
                                  ((b.momentum || 50) * activeBias.stability) + 
                                  ((b.gap || 0) * activeBias.chaos) +
                                  ((b.orchestration || 0) * activeBias.orchestration);

                    if (score > topTournamentScore) {
                        topTournamentScore = score;
                        bestInTournament = n;
                    }
                }

                if (bestInTournament !== -1) {
                    const isKing = kingNumbers.includes(bestInTournament);
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
            
            // --- VALIDATION STRUCTURELLE ADAPTATIVE ---
            const sum = candidate.reduce((a, b) => a + b, 0);
            const ac = calculateACValue(candidate);
            
            // Filtre Sigma dynamique
            if (targetLowSum && sum > 230) continue; // On force la baisse
            if (targetHighSum && sum < 220) continue; // On force la hausse
            if (!targetLowSum && !targetHighSum && (sum < 130 || sum > 320)) continue;

            if (ac < 6) continue; 

            let fitness = candidate.reduce((acc, n) => acc + (scores[n].spectral || 0), 0);
            if (ac >= 8) fitness += 40; 

            if (fitness > maxFitness) {
                maxFitness = fitness;
                bestCombo = candidate;
            }
        }

        combinations.push({
            numbers: bestCombo,
            score: Math.min(99, Math.round(maxFitness / 6)),
            tags: i === 0 ? ["Alpha Fusion"] : i === 1 ? ["Sigma Correctif"] : ["Vecteur Organique"],
            breakdown: { 
                harmony: Math.round(activeBias.harmony * 100), 
                stability: Math.round(activeBias.stability * 100), 
                chaos: Math.round(activeBias.chaos * 100),
                kings: bestCombo.filter(n => kingNumbers.includes(n)).length
            }
        });
    }

    const machineStatus = activeBias.orchestration < 0.2 ? "OFF" : "ON";
    const sigmaTrend = targetLowSum ? "BAISSIERE" : targetHighSum ? "HAUSSIERE" : "NEUTRE";

    return {
        id: crypto.randomUUID(),
        kingNumbers: kingNumbers.map(n => ({ 
            number: n, 
            count: hotKings.includes(n) ? 2 : 1 
        })), 
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: Math.round(combinations[0].score * 0.95),
        analysis: `Mode Symbiotique (Machine ${machineStatus}). Correction Sigma ${sigmaTrend} et filtrage des Zones Mortes activés.`,
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
