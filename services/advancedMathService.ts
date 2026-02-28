
import { DrawResult } from '../types';

// --- SPATIAL ANALYSIS (Grid 9x10) ---
// Maps numbers 1-90 to a 9x10 grid and finds hot zones.
export const calculateSpatialHotSpots = (history: DrawResult[]): number[] => {
    const gridWidth = 10;
    const gridHeight = 9;
    const grid = new Array(gridHeight).fill(0).map(() => new Array(gridWidth).fill(0));
    const recent = history.slice(0, 20); // Last 20 draws

    // Fill grid with frequency
    recent.forEach(d => {
        d.gagnants.forEach(n => {
            if (n >= 1 && n <= 90) {
                const row = Math.floor((n - 1) / gridWidth);
                const col = (n - 1) % gridWidth;
                grid[row][col]++;
            }
        });
    });

    // Convolve with 3x3 kernel to find hot zones
    const hotScores = new Map<number, number>();
    for (let r = 0; r < gridHeight; r++) {
        for (let c = 0; c < gridWidth; c++) {
            let score = 0;
            // 3x3 neighborhood
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < gridHeight && nc >= 0 && nc < gridWidth) {
                        score += grid[nr][nc];
                    }
                }
            }
            const num = r * gridWidth + c + 1;
            hotScores.set(num, score);
        }
    }

    // Return top 15 numbers in hot zones
    return Array.from(hotScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(e => e[0]);
};

// --- DIGITAL ROOT ANALYSIS ---
// Analyzes the trend of digital roots (sum of digits until single digit).
export const calculateDigitalRootAnalysis = (history: DrawResult[]): Record<number, number> => {
    const rootCounts = new Array(10).fill(0); // Roots 1-9
    const recent = history.slice(0, 50);

    recent.forEach(d => {
        d.gagnants.forEach(n => {
            let root = n;
            while (root > 9) {
                root = Math.floor(root / 10) + (root % 10);
            }
            if (root >= 1 && root <= 9) rootCounts[root]++;
        });
    });

    const scores: Record<number, number> = {};
    const maxCount = Math.max(...rootCounts) || 1;

    for (let n = 1; n <= 90; n++) {
        let root = n;
        while (root > 9) {
            root = Math.floor(root / 10) + (root % 10);
        }
        // Score based on how hot this root is
        scores[n] = (rootCounts[root] / maxCount) * 100;
    }
    return scores;
};

// --- RESISTANCE ANALYSIS ---
// Identifies numbers that are "due" (high gap) but have high probability (Bayes/Freq).
// Resistance = Gap * Frequency (simplified)
export const calculateResistanceScores = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    const recentFreq = new Map<number, number>();
    const gaps = new Map<number, number>();
    const sample = history.slice(0, 100);

    // Calculate Freq
    sample.forEach(d => {
        d.gagnants.forEach(n => recentFreq.set(n, (recentFreq.get(n) || 0) + 1));
    });

    // Calculate Gaps
    for (let n = 1; n <= 90; n++) {
        let gap = 0;
        for (let i = 0; i < sample.length; i++) {
            if (sample[i].gagnants.includes(n)) break;
            gap++;
        }
        gaps.set(n, gap);
    }

    // Calculate Resistance
    for (let n = 1; n <= 90; n++) {
        const f = recentFreq.get(n) || 0;
        const g = gaps.get(n) || 0;
        // High resistance = High Freq (historically) AND High Gap (currently)
        // This implies the number is "supposed" to come out but is resisting.
        scores[n] = Math.min(100, (f * g) / 2); 
    }
    return scores;
};

// --- GAP VELOCITY ---
// Measures the rate of change of gaps. 
// If gaps are getting smaller, velocity is positive (heating up).
export const calculateGapVelocityScores = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    const limit = Math.min(history.length, 100);
    
    for (let n = 1; n <= 90; n++) {
        const gaps: number[] = [];
        let currentGap = 0;
        let count = 0;
        
        for (let i = 0; i < limit; i++) {
            if (history[i].gagnants.includes(n)) {
                if (count > 0) gaps.push(currentGap);
                currentGap = 0;
                count++;
                if (gaps.length >= 5) break;
            } else {
                currentGap++;
            }
        }
        
        if (gaps.length < 2) {
            scores[n] = 50; // Neutral
            continue;
        }

        // Calculate trend of gaps (recent vs older)
        // Recent gaps are at the beginning of the array
        const recentAvg = gaps.slice(0, 2).reduce((a,b)=>a+b,0) / 2;
        const olderAvg = gaps.slice(2).reduce((a,b)=>a+b,0) / (gaps.length - 2);
        
        // If recent gaps are smaller than older gaps, velocity is high (heating up)
        if (olderAvg === 0) scores[n] = 50;
        else {
            const ratio = olderAvg / (recentAvg || 1);
            scores[n] = Math.min(100, Math.max(0, ratio * 50));
        }
    }
    return scores;
};

// --- SELF-ATTENTION (Simplified Transformer) ---
// Calculates how much a number "attends" to other numbers in the history.
// Returns a score based on the current context (last draw).
export const calculateSelfAttentionScores = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    if (history.length < 2) return scores;

    const lastDraw = history[0].gagnants;
    const contextSize = 50;
    const sample = history.slice(1, contextSize + 1);

    // Build Attention Matrix (Co-occurrence)
    const attention = new Map<number, Map<number, number>>();
    
    sample.forEach(d => {
        d.gagnants.forEach(n1 => {
            if (!attention.has(n1)) attention.set(n1, new Map());
            d.gagnants.forEach(n2 => {
                if (n1 !== n2) {
                    const map = attention.get(n1)!;
                    map.set(n2, (map.get(n2) || 0) + 1);
                }
            });
        });
    });

    // Calculate Attention Score for each candidate based on Last Draw
    for (let n = 1; n <= 90; n++) {
        let score = 0;
        lastDraw.forEach(ctxNum => {
            const att = attention.get(ctxNum);
            if (att) {
                score += (att.get(n) || 0);
            }
        });
        // Normalize roughly
        scores[n] = Math.min(100, score * 2);
    }

    return scores;
};

// --- TEMPORAL SCORES (Time Decay) ---
// Weights recent appearances much higher than older ones.
export const calculateTemporalScores = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    const decayFactor = 0.95;
    const limit = Math.min(history.length, 50);

    for (let i = 0; i < limit; i++) {
        const weight = Math.pow(decayFactor, i) * 100;
        history[i].gagnants.forEach(n => {
            scores[n] = (scores[n] || 0) + weight;
        });
    }
    
    // Normalize
    const max = Math.max(...Object.values(scores)) || 1;
    for (let n = 1; n <= 90; n++) {
        scores[n] = ((scores[n] || 0) / max) * 100;
    }
    return scores;
};

// --- POISSON SCORES ---
// Uses the Poisson probability function to score numbers.
export const calculatePoissonScores = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    const limit = Math.min(history.length, 100);
    const sample = history.slice(0, limit);
    
    // Calculate lambda (average frequency) per number
    const freqs = new Map<number, number>();
    sample.forEach(d => d.gagnants.forEach(n => freqs.set(n, (freqs.get(n) || 0) + 1)));
    
    for (let n = 1; n <= 90; n++) {
        const k = freqs.get(n) || 0;
        const lambda = (limit * 5) / 90; // Theoretical average
        
        // Poisson Probability P(k; lambda)
        // We want to know if the current k is "low" compared to lambda (due for correction)
        // or if it fits the distribution.
        // Strategy: Mean Reversion. If k < lambda, score higher.
        
        const diff = lambda - k;
        // Score: 50 + diff * 10. 
        // If k is low (diff positive), score > 50.
        // If k is high (diff negative), score < 50.
        scores[n] = Math.min(100, Math.max(0, 50 + diff * 10));
    }
    return scores;
};

// --- LEADER SUCCESSION ---
// Analyzes which numbers tend to follow the "Leader" (first number) of the previous draw.
export const calculateLeaderSuccession = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    const successionMap = new Map<number, Map<number, number>>();
    const limit = Math.min(history.length, 200);

    // Build the map: Leader(Draw T-1) -> Numbers(Draw T)
    for (let i = 0; i < limit - 1; i++) {
        const currentDraw = history[i].gagnants;
        const prevDraw = history[i+1].gagnants;
        
        if (prevDraw.length > 0) {
            const leader = prevDraw[0]; // Assuming first number is the leader
            if (!successionMap.has(leader)) successionMap.set(leader, new Map());
            
            const followers = successionMap.get(leader)!;
            currentDraw.forEach(n => {
                followers.set(n, (followers.get(n) || 0) + 1);
            });
        }
    }

    // Predict based on the most recent draw's leader
    if (history.length > 0 && history[0].gagnants.length > 0) {
        const lastLeader = history[0].gagnants[0];
        const predictions = successionMap.get(lastLeader);
        
        if (predictions) {
            const maxCount = Math.max(...predictions.values()) || 1;
            for (let n = 1; n <= 90; n++) {
                scores[n] = ((predictions.get(n) || 0) / maxCount) * 100;
            }
        }
    }

    return scores;
};

// --- BAYESIAN ANALYSIS ---
// Calculates the probability of each number based on the previous draw using Bayes' Theorem.
// P(Next=N | Prev=D) = P(Prev=D | Next=N) * P(Next=N) / P(Prev=D)
export const calculateBayesianScore = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    if (history.length < 2) return scores;

    const lastDraw = history[0].gagnants;
    const totalDraws = history.length;
    
    // P(N): Prior probability of N (Frequency)
    const priors = new Map<number, number>();
    history.forEach(d => d.gagnants.forEach(n => priors.set(n, (priors.get(n) || 0) + 1)));

    // P(Prev=D | Next=N): Likelihood
    // How often did the numbers in 'lastDraw' appear in the draw *immediately preceding* a draw containing N?
    const likelihoods = new Map<number, number>();
    
    for (let i = 0; i < totalDraws - 1; i++) {
        const currentDraw = history[i].gagnants; // Draw T (Next)
        const prevDraw = history[i+1].gagnants;  // Draw T-1 (Prev)
        
        // Count matches between prevDraw and lastDraw
        const matches = prevDraw.filter(n => lastDraw.includes(n)).length;
        
        // If there's a significant similarity (e.g., >= 2 numbers match), we consider it a similar context
        if (matches >= 2) {
            currentDraw.forEach(n => {
                likelihoods.set(n, (likelihoods.get(n) || 0) + 1);
            });
        }
    }

    // Calculate Posterior
    let maxPosterior = 0;
    for (let n = 1; n <= 90; n++) {
        const prior = (priors.get(n) || 0) / totalDraws;
        const likelihood = (likelihoods.get(n) || 0) / totalDraws; // Simplified normalization
        const posterior = prior * likelihood;
        scores[n] = posterior;
        if (posterior > maxPosterior) maxPosterior = posterior;
    }

    // Normalize to 0-100
    if (maxPosterior > 0) {
        for (let n = 1; n <= 90; n++) {
            scores[n] = (scores[n] / maxPosterior) * 100;
        }
    }

    return scores;
};

// --- AI INTUITION (Heuristic Ensemble) ---
// Combines pattern recognition and anomaly detection to simulate "intuition".
export const calculateAiIntuition = (history: DrawResult[], metrics: any): Record<number, number> => {
    const scores: Record<number, number> = {};
    
    // 1. Pattern Recognition: Detect arithmetic sequences in recent history
    const recent = history.slice(0, 10);
    const sequenceBoost = new Set<number>();
    
    recent.forEach(d => {
        const nums = d.gagnants.sort((a,b)=>a-b);
        for(let i=0; i<nums.length-1; i++) {
            const diff = nums[i+1] - nums[i];
            if (diff > 0 && diff < 10) {
                // Predict next in sequence
                const next = nums[i+1] + diff;
                if (next <= 90) sequenceBoost.add(next);
            }
        }
    });

    // 2. Anomaly Detection: High Spectral Energy but Low Frequency (Hidden Resonance)
    const hiddenResonance = new Set<number>();
    if (metrics?.spectral) {
        metrics.spectral.forEach((s: any) => {
            if (s.energy > 80 && s.frequency < 20) { // High energy, low freq
                hiddenResonance.add(s.number);
            }
        });
    }

    for (let n = 1; n <= 90; n++) {
        let score = 50; // Base intuition
        if (sequenceBoost.has(n)) score += 20;
        if (hiddenResonance.has(n)) score += 30;
        
        // Random "Gut Feeling" noise (simulating non-linear intuition)
        // In a real AI, this would be the output of a black-box neural net
        const noise = (Math.sin(n * Date.now()) + 1) * 5; 
        score += noise;

        scores[n] = Math.min(100, Math.max(0, score));
    }

    return scores;
};
