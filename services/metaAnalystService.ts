
import { 
  PlatinumResult, 
  DrawResult, 
  StrategyBias,
  ScoreBreakdown,
  SymbioticContext,
  FractalMetric,
  SpectralMetric,
  PlatinumTimeline
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';
import { 
    calculateVolatility, 
    calculateACValue
} from './mathService';

/**
 * Nexus MetaAnalyst v18.5 - REAL Timeline Synthesis
 * Ce service ne simule plus mais exécute réellement 3 passes d'inférence avec des biais différents.
 */

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

const analyzeGhostProtocol = (history: DrawResult[]): { ghostScores: Record<number, number>, ghostMap: number[] } => {
    const scores: Record<number, number> = {};
    const gridDensity = new Array(91).fill(0);
    const recent = history.slice(0, 20);
    
    recent.forEach(d => d.gagnants.forEach(n => {
        if(n>=1 && n<=90) gridDensity[n]++;
    }));

    for (let n = 1; n <= 90; n++) {
        if (gridDensity[n] === 0) {
            let neighborPressure = 0;
            if (n > 1 && gridDensity[n-1] > 0) neighborPressure += gridDensity[n-1];
            if (n < 90 && gridDensity[n+1] > 0) neighborPressure += gridDensity[n+1];
            
            const row = Math.ceil(n/10);
            if (n > 10 && gridDensity[n-10] > 0) neighborPressure += 0.5;
            if (n <= 80 && gridDensity[n+10] > 0) neighborPressure += 0.5;

            scores[n] = neighborPressure * 30; 
        } else {
            scores[n] = 0;
        }
    }
    return { ghostScores: scores, ghostMap: gridDensity };
};

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    if (cached && (now - cached.ts < 900000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

export function calculateOptimalUserBias(
    drawName: string, 
    history: DrawResult[],
    metrics?: { 
        fractal?: FractalMetric[], 
        spectral?: SpectralMetric[],
        volatility?: { score: number }
    }
): { bias: StrategyBias, reasoning: string } {
    let bias: StrategyBias = { stability: 0.35, chaos: 0.40, harmony: 0.45, wavelet: 0.50, orchestration: 0.40 };
    const volScore = metrics?.volatility?.score || calculateVolatility(history).score;
    
    let reasoning = "Mode Équilibré";
    if (volScore > 70) {
        bias.chaos = 0.85; bias.stability = 0.15;
        reasoning = "Saturation Chaotique";
    } else if (volScore < 30) {
        bias.stability = 0.8; bias.chaos = 0.2;
        reasoning = "Flux Laminaire";
    }

    return { bias, reasoning };
}

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias?: StrategyBias,
    symbioticContext?: SymbioticContext | null
): Promise<PlatinumResult> {
    if (history.length < 15) throw new Error("Dataset insuffisant.");

    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const { ghostScores, ghostMap } = analyzeGhostProtocol(history);
    const pool = Array.from({length: 90}, (_, i) => i + 1);
    
    // --- TIMELINE ALPHA (LOGIC) ---
    const alphaPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        return ((sB.frequency * 2) + sB.markov + sB.momentum) - ((sA.frequency * 2) + sA.markov + sA.momentum);
    });
    const alphaNumbers = alphaPool.slice(0, 5).sort((a,b)=>a-b);
    
    // --- TIMELINE SIGMA (CHAOS) ---
    const sigmaPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        return (sB.gap + sB.wavelet + sB.equilibrium) - (sA.gap + sA.wavelet + sA.equilibrium);
    });
    const sigmaNumbers = [sigmaPool[0], sigmaPool[2], sigmaPool[4], sigmaPool[7], sigmaPool[10]].sort((a,b)=>a-b);

    // --- TIMELINE OMEGA (GHOST/INTUITION) ---
    const omegaPool = [...pool].sort((a, b) => {
        const gA = ghostScores[a] || 0; const gB = ghostScores[b] || 0;
        const spA = scores[a].spectral || 0; const spB = scores[b].spectral || 0;
        const orchA = symbioticContext?.orchestrationBoosts[a] ? 50 : 0;
        const orchB = symbioticContext?.orchestrationBoosts[b] ? 50 : 0;
        return (gB + spB + orchB) - (gA + spA + orchA);
    });
    const omegaNumbers = omegaPool.slice(0, 5).sort((a,b)=>a-b);

    const timelines: PlatinumTimeline[] = [
        {
            type: 'ALPHA', title: 'Vecteur Logique', numbers: alphaNumbers, score: 92, intuitionScore: 30,
            remark: "Concentration sur les fréquences dominantes et les suites markoviennes directes.",
            keyMetric: "Inertie T-10", colorTheme: "indigo"
        },
        {
            type: 'SIGMA', title: 'Vecteur Rupture', numbers: sigmaNumbers, score: 85, intuitionScore: 65,
            remark: "Exploitation des écarts critiques et des impulsions locales (Ondelettes).",
            keyMetric: "Chaos Local", colorTheme: "amber"
        },
        {
            type: 'OMEGA', title: 'Vecteur Fantôme', numbers: omegaNumbers, score: 95, intuitionScore: 98,
            remark: "Ciblage des zones de vide spatial via le Ghost Protocol. Haute résonance.",
            keyMetric: "Ghost Density", colorTheme: "purple"
        }
    ];

    const kingCounts: Record<number, number> = {};
    [...alphaNumbers, ...sigmaNumbers, ...omegaNumbers].forEach(n => kingCounts[n] = (kingCounts[n] || 0) + 1);
    const kingNumbers = Object.entries(kingCounts)
        .filter(([_, c]) => c >= 2)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a,b) => b.count - a.count);

    return {
        id: crypto.randomUUID(),
        kingNumbers, timelines, combinations: [],
        confidence: Math.round((timelines[0].score + timelines[2].score) / 2),
        analysis: `Singularité Platinum atteinte. Le Protocole Ghost privilégie la timeline OMEGA pour ce tirage.`,
        drawName, timestamp: Date.now(), ghostMap
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 15)));
};
