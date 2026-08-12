import re

with open('services/prediction/monteCarloMcmc.ts', 'r') as f:
    content = f.read()

# Add imports for features and scores
imports = """import { buildAlgoBundle, extractFeatures, calculateScores } from './predictionFacade';
import { generateDiversityMetrics } from './diversityService';
"""

content = imports + content

# Replace generateMasterPredictionCore call
loop_start = content.find("const pred = await generateMasterPredictionCore")
loop_end = content.find("let topScores: number[] = [];")

# Add pre-computation outside the loop
pre_compute = """
    onProgress(10, "Pré-calcul des métriques et features (Zéro-copy)...");
    const useSpatioTemporalHawkes = true;
    const baseBundle = await buildAlgoBundle(history, drawName, useSpatioTemporalHawkes);
    const baseFeatures = await extractFeatures(drawName, history);
    
"""

for_loop_index = content.find("for (let i = 0; i < resolvedMcIterations; i++) {")
content = content[:for_loop_index] + pre_compute + content[for_loop_index:]

# Now replace the pred generation inside the loop
new_pred = """
        const scoredNumbers = calculateScores(baseFeatures, perturbedWeights, baseBundle, history);
        const suggestedNumbers = scoredNumbers.slice(0, 5).map(s => s.num).sort((a,b)=>a-b);
        const candidates = scoredNumbers.slice(5, 15).map(s => s.num);
        
        const breakdown: Record<number, Record<string, number>> = {};
        scoredNumbers.forEach(s => { breakdown[s.num] = s.breakdown || {}; });
        
        const pred: Prediction = {
            suggestedNumbers,
            candidates,
            breakdown,
            confidence: 50,
            analysis: "MCMC Iteration",
            timestamp: Date.now(),
            diversityMetrics: generateDiversityMetrics(suggestedNumbers, history, perturbedWeights)
        };
        """

# We need to find loop_start again because indices changed
loop_start = content.find("const pred = await generateMasterPredictionCore")
loop_end = content.find("let topScores: number[] = [];")
content = content[:loop_start] + new_pred + content[loop_end:]

with open('services/prediction/monteCarloMcmc.ts', 'w') as f:
    f.write(content)
