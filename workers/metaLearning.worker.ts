import { AlgoWeights, DrawResult } from '../types';
import {  LCG } from '../utils/mathUtils';


// Helper function to normalize weights (copied from weightsManager to keep worker isolated)
const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
  const sum = Object.values(weights).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  if (sum === 0) return weights;

  const normalized: Partial<AlgoWeights> = {};
  for (const [key, value] of Object.entries(weights)) {
      if (typeof value === 'number') {
          normalized[key as keyof AlgoWeights] = value / sum;
      }
  }
  return normalized as AlgoWeights;
};

self.onmessage = (event: MessageEvent) => {
    try {
        const { dynamicWeights, history } = event.data as { dynamicWeights: AlgoWeights, history: DrawResult[] };
        
        // MICRO-BACKTEST INTRA-DRAW (Simulated Annealing Amélioré)
        const recentDraws = history.slice(0, 5);
        
        const lcg = new LCG(`meta_${history.length}_${history[0]?.date || Date.now()}`);

        let bestConfig = { ...dynamicWeights };
        let bestFitness = -Infinity;

        // Compute Shannon entropy of recent draws to scale mutations
        const counts: Record<number, number> = {};
        let totalCount = 0;
        recentDraws.forEach(d => d.gagnants.forEach(n => {
            counts[n] = (counts[n] || 0) + 1;
            totalCount++;
        }));
        let entropy = 0;
        Object.values(counts).forEach(c => {
            const p = c / totalCount;
            if(p > 0) entropy -= p * Math.log2(p);
        });
        const maxEntropy = Math.log2(90);
        const chaosLevel = Math.max(Number.EPSILON, entropy / maxEntropy);

        // Profils de mutations génétiques
        const variations: AlgoWeights[] = [
            dynamicWeights
        ];

        // Ajout de mutations stochastiques déterministes autour des poids actuels (Jittering par LCG)
        const numMutations = Math.floor(chaosLevel * 10) + 3;
        for (let i = 0; i < numMutations; i++) {
            const jittered = { ...dynamicWeights };
            Object.keys(jittered).forEach(k => {
                const key = k as keyof AlgoWeights;
                // Mutation modulée par l'entropie (plus d'entropie = plus d'exploration)
                const drift = 1.0 + (lcg.next() * 2.0 - 1.0) * chaosLevel; 
                jittered[key] = (jittered[key] || 0) * Math.max(0, drift);
            });
            variations.push(normalizeWeights(jittered));
        }

        variations.forEach(testWeights => {
            let fitnessScore = 0;
            
            recentDraws.forEach((actualDraw, idx) => {
                const histSlice = history.slice(idx + 1, idx + 40); // Fenêtre plus large pour l'heuristique
                if (histSlice.length < 15) return;
                
                const testScores: Record<number, number> = {};
                for(let i=1; i<=90; i++) testScores[i] = 0;
                
                const targetDraw = histSlice[0].gagnants;
                
                histSlice.forEach((h, j) => {
                    const decay = Math.pow(0.9, j); // Oubli temporel dans l'heuristique
                    
                    h.gagnants.forEach(n => { 
                        testScores[n] += (testWeights.frequency || 0) * 10 * decay; 
                        testScores[n] += (testWeights.temporal || 0) * 5 * (j < 5 ? 1 : 0);
                    });

                    if (j > 0) {
                        const currentInTime = h.gagnants;
                        const nextInTime = histSlice[j-1].gagnants;
                        
                        // Modélisation de Markov avancée (Transitions)
                        currentInTime.forEach(c => {
                            if (targetDraw.includes(c)) {
                                nextInTime.forEach(nx => testScores[nx] += (testWeights.markov || 0) * 8 * decay);
                            }
                        });
                        
                        // Modélisation d'Affinité (Co-occurrences)
                        if (j < 10) {
                            currentInTime.forEach(c => {
                                currentInTime.forEach(co => {
                                    if (c !== co && targetDraw.includes(c)) {
                                        testScores[co] += (testWeights.affinity || 0) * 4 * decay;
                                    }
                                });
                            });
                        }
                    }
                });

                // Évaluation des résultats par rapport au tirage réel
                const topScoreArr = Object.entries(testScores).sort(([, a], [, b]) => b - a);
                const top5 = topScoreArr.slice(0, 5).map(([n]) => Number(n));
                const top10 = topScoreArr.slice(0, 10).map(([n]) => Number(n));
                
                const exactHits = top5.filter(n => actualDraw.gagnants.includes(n)).length;
                const proximityHits = top10.filter(n => actualDraw.gagnants.includes(n)).length - exactHits;
                
                // Fonction de Fitness composite
                fitnessScore += (exactHits * 10) + (proximityHits * 2.5);
            });

            if (fitnessScore > bestFitness) {
                bestFitness = fitnessScore;
                // Descente de gradient modérée (Learning Rate dynamique basé sur le chaos de la série)
                const lr = chaosLevel; // Learning rate continu
                Object.keys(testWeights).forEach(k => {
                    const key = k as keyof AlgoWeights;
                    bestConfig[key] = (dynamicWeights[key] || 0) * (1 - lr) + (testWeights[key] || 0) * lr;
                });
            }
        });
        
        self.postMessage({ type: 'SUCCESS', bestConfig: normalizeWeights(bestConfig) });
    } catch (error) {
        self.postMessage({ type: 'ERROR', error: error instanceof Error ? error.message : 'Unknown Worker Error' });
    }
};
