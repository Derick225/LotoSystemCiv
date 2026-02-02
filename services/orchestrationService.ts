
import { DrawResult, DetectedPattern, PatternType, OrchestrationMetrics, MimicryMetric } from '../types';
import { calculateSuccessionMatrixAsync, calculateACValue } from './mathService';

export interface OrchestrationConfig {
    lambdaDecay: number; 
    echoDecay: number;   
    machineBoost: number; 
    mirrorBoost: number;  
}

const DEFAULT_CONFIG: OrchestrationConfig = {
    lambdaDecay: 0.1,
    echoDecay: 0.1,
    machineBoost: 30,
    mirrorBoost: 20
};

const getMirror = (n: number): number | null => {
    if (n < 1 || n > 90) return null;
    const mirror = 91 - n;
    return (mirror !== n && mirror >= 1 && mirror <= 90) ? mirror : null;
};

export interface ImmediateLesson {
    pattern: PatternType;
    description: string;
    impactScore: number;
}

export const analyzePredictionError = (drawName: string, actualDraw: DrawResult, history: DrawResult[]): { auditLessons: ImmediateLesson[] } => {
    const lessons: ImmediateLesson[] = [];
    
    // 1. Analyse Machine -> Gagnant
    if (actualDraw.machine) {
        const transfers = actualDraw.gagnants.filter(n => actualDraw.machine?.includes(n));
        if (transfers.length > 0) {
            lessons.push({
                pattern: 'Transfert Machine',
                description: `Ré-injection directe détectée (${transfers.length} unités translatées).`,
                impactScore: transfers.length * 20
            });
        }
    }

    // 2. Analyse Répétition (T vs T-1)
    const actualIndex = history.findIndex(h => h.id === actualDraw.id);
    const prevDraw = (actualIndex !== -1 && actualIndex < history.length - 1) ? history[actualIndex + 1] : null;

    if (prevDraw) {
        const repeats = actualDraw.gagnants.filter(n => prevDraw.gagnants.includes(n));
        if (repeats.length > 0) {
            lessons.push({
                pattern: 'Répétition',
                description: `Inertie temporelle forte : ${repeats.length} numéros conservés du tirage précédent (${repeats.join(', ')}).`,
                impactScore: repeats.length * 30 
            });
        }

        const neighbors = actualDraw.gagnants.filter(n => 
            prevDraw.gagnants.includes(n - 1) || prevDraw.gagnants.includes(n + 1)
        );
        if (neighbors.length >= 2) {
            lessons.push({
                pattern: 'Voisin',
                description: `Glissement de voisinage sur ${neighbors.length} vecteurs.`,
                impactScore: neighbors.length * 15
            });
        }
    }
    
    return { auditLessons: lessons };
};

/**
 * Analyse le mimétisme séquentiel sur les 3 derniers tirages (T vs T-1, T vs T-2).
 * Détecte les répétitions exactes et les effets de voisinage immédiat.
 */
export const analyzeShortTermMimicry = (history: DrawResult[]): MimicryMetric[] => {
    if (history.length < 3) return [];
    
    // T = Dernier tirage (history[0])
    // T-1 = Avant-dernier (history[1])
    // T-2 = Ante-pénultième (history[2])
    const t0 = history[0];
    const t1 = history[1];
    const t2 = history[2];
    
    const metrics: MimicryMetric[] = [];

    // On analyse chaque numéro du dernier tirage pour voir d'où il vient
    t0.gagnants.forEach(n => {
        let score = 0;
        let type: MimicryMetric['type'] = 'Complexe';
        let sourceSet = new Set<string>();

        // Check T-1 (Impact Fort)
        if (t1.gagnants.includes(n)) { 
            score += 50; 
            type = 'Direct'; 
            sourceSet.add('T-1'); 
        } else if (t1.gagnants.includes(n-1) || t1.gagnants.includes(n+1)) { 
            score += 15; 
            if(score < 30) type = 'Voisin'; 
            sourceSet.add('T-1'); 
        }

        // Check T-2 (Impact Latent)
        if (t2.gagnants.includes(n)) { 
            score += 30; 
            if(type === 'Complexe') type = 'Lag'; 
            sourceSet.add('T-2'); 
        } else if (t2.gagnants.includes(n-1) || t2.gagnants.includes(n+1)) { 
            score += 10; 
            if(type === 'Complexe') type = 'Voisin'; 
            sourceSet.add('T-2'); 
        }

        if (score > 0) {
            metrics.push({ 
                number: n, 
                score, 
                type, 
                sourceDraw: Array.from(sourceSet).join(' & ') || 'Mixte' 
            });
        }
    });

    return metrics.sort((a,b) => b.score - a.score);
};

export const calculateOrchestrationScores = (history: DrawResult[], config: OrchestrationConfig = DEFAULT_CONFIG): Record<number, number> => {
    const scores: Record<number, number> = {};
    if (history.length < 3) return scores;

    // Pondération temporelle : T-1 a plus d'impact que T-2
    const weights = [1.0, 0.6, 0.3];

    for(let i=0; i<3; i++) {
        const draw = history[i];
        const w = weights[i];
        
        const winners = draw.gagnants;
        const machine = draw.machine || [];

        // Machine Leakage (La machine annonce souvent les gagnants futurs)
        machine.forEach(m => scores[m] = (scores[m] || 0) + (config.machineBoost * w)); 
        
        winners.forEach(winner => {
            // Miroirs
            const mirror = getMirror(winner);
            if (mirror) scores[mirror] = (scores[mirror] || 0) + (config.mirrorBoost * w);
            
            // Voisins
            const nLeft = winner > 1 ? winner - 1 : 90;
            const nRight = winner < 90 ? winner + 1 : 1;
            scores[nLeft] = (scores[nLeft] || 0) + (15 * w);
            scores[nRight] = (scores[nRight] || 0) + (15 * w);

            // Répétition (Inertie)
            scores[winner] = (scores[winner] || 0) + (10 * w);
        });
    }

    return scores;
};

export const analyzeImmediateTrend = (history: DrawResult[]): { lessons: ImmediateLesson[] } => {
    const lessons: ImmediateLesson[] = [];
    if (history.length < 2) return { lessons };
    
    const depth = Math.min(history.length - 1, 100); 
    
    // Analyse des répétitions sur le long terme
    const counts: Record<number, number> = {};
    history.slice(0, 50).forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n]||0)+1));
    
    const sortedReps = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 5);
    if (sortedReps.length > 0 && sortedReps[0][1] >= 4) {
        lessons.push({
            pattern: 'Répétition',
            description: `Vecteurs persistants (Loop) : ${sortedReps.slice(0,3).map(r=>r[0]).join(', ')}.`,
            impactScore: 45
        });
    }

    // Analyse Machine -> Winner
    let machineTransferCount = 0;
    for(let i=0; i<depth; i++) {
        const draw = history[i];
        const prev = history[i+1];
        if (prev?.machine) {
            const hits = draw.gagnants.filter(n => prev.machine?.includes(n));
            machineTransferCount += hits.length;
        }
    }
    
    const transferRate = machineTransferCount/depth;
    if (transferRate > 0.4) {
        lessons.push({ 
            pattern: 'Transfert Machine', 
            description: `Canal Machine instable : Taux de fuite élevé (${(transferRate*100).toFixed(0)}%). Surveillez la Machine T-1.`, 
            impactScore: Math.min(80, machineTransferCount * 2)
        });
    }

    return { lessons: lessons.sort((a,b) => b.impactScore - a.impactScore) };
};

// Calcule si un ensemble de numéros est "harmonieux" (bon AC, bon écart type, pas trop de dizaines communes)
const calculateCoherence = (numbers: number[]): number => {
    if (numbers.length < 2) return 0;
    const ac = calculateACValue(numbers);
    // On veut un AC entre 6 et 10 (idéal 8-9)
    let acScore = 0;
    if (ac >= 7 && ac <= 9) acScore = 100;
    else if (ac === 6 || ac === 10) acScore = 60;
    else acScore = 20;

    // Pas plus de 3 numéros dans la même dizaine
    const decades = numbers.map(n => Math.floor((n-1)/10));
    const maxDecade = Math.max(...Object.values(decades.reduce((acc, d) => { acc[d] = (acc[d]||0)+1; return acc; }, {} as Record<number, number>)));
    const spreadScore = maxDecade <= 2 ? 100 : maxDecade === 3 ? 50 : 0;

    return Math.round((acScore * 0.6) + (spreadScore * 0.4));
};

export const getFullOrchestrationAnalysis = async (drawName: string, history: DrawResult[]): Promise<OrchestrationMetrics> => {
    // 1. Scores basés sur la structure (Machine, Miroirs, Voisins)
    const baseScores = calculateOrchestrationScores(history);
    
    // 2. Scores basés sur les chaînes de Markov (Successions)
    const { matrix, totals } = await calculateSuccessionMatrixAsync(history); 
    
    const lastWinners = history[0].gagnants;
    const finalScores = { ...baseScores };

    // Injection Markovienne
    lastWinners.forEach(leader => {
        const followersMap = matrix[leader] || {};
        const total = totals[leader] || 1;
        
        Object.entries(followersMap).forEach(([fStr, count]) => {
            const follower = parseInt(fStr);
            const prob = (count as number) / total;
            // Si la proba de suite est forte (>10%), on booste le score
            if (prob > 0.10) { 
                finalScores[follower] = (finalScores[follower] || 0) + (prob * 150);
            }
        });
    });

    const trend = analyzeImmediateTrend(history);
    const activePatterns: DetectedPattern[] = trend.lessons.map(l => ({ 
        type: l.pattern, 
        count: 1, 
        impact: l.impactScore / 10 
    }));

    const topCandidates = Object.entries(finalScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 18)
        .map(([numStr, score]) => {
            const num = Number(numStr);
            const reasons: string[] = [];
            
            // Raisonnement explicite pour l'utilisateur
            if (history[0].machine?.includes(num)) reasons.push("Sortie Machine T-1");
            if (history[0].gagnants.some(w => getMirror(w) === num)) reasons.push("Miroir de T-1");
            if (history[0].gagnants.some(w => Math.abs(w-num) === 1)) reasons.push("Voisin T-1");
            
            const isMarkov = lastWinners.some(l => {
                const prob = (matrix[l]?.[num] || 0) / (totals[l] || 1);
                return prob > 0.12;
            });
            if(isMarkov) reasons.push("Suite Logique (Markov)");

            if (reasons.length === 0) reasons.push("Résonance Profonde");

            return { number: num, score: Math.round(score), reasons };
        });

    // 4. Backtest "Live" (Derniers 10 tirages)
    let hits = 0;
    let totalChecks = 0;
    const testSample = history.slice(1, 11); 
    
    testSample.forEach((targetDraw, idx) => {
        const contextStart = idx + 2; 
        const subHistory = history.slice(contextStart);
        
        if (subHistory.length > 5) {
            const subScores = calculateOrchestrationScores(subHistory);
            const candidates = Object.entries(subScores)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10) 
                .map(e => Number(e[0]));
            
            const matches = targetDraw.gagnants.filter(n => candidates.includes(n)).length;
            hits += matches;
            totalChecks += 5; 
        }
    });
    
    const rawCoverage = totalChecks > 0 ? hits / totalChecks : 0;
    const accuracyScore = Math.min(100, Math.round(rawCoverage * 350)); // Scaling pour affichage (0-100)

    // Calcul de la cohérence du TOP 5 proposé
    const top5 = topCandidates.slice(0, 5).map(c => c.number);
    const coherence = calculateCoherence(top5);

    // Ajustement du score global avec la cohérence
    const globalScore = Math.round((accuracyScore * 0.4) + (coherence * 0.4) + (Math.min(100, topCandidates[0].score / 2) * 0.2));

    return { 
        globalScore, 
        activePatterns, 
        topCandidates, 
        backtestAccuracy: accuracyScore, 
        narrativeLesson: trend.lessons[0]?.description || `Cohérence harmonique du Top 5 : ${coherence}%.` 
    };
};
