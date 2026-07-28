import re

with open('services/prediction/monteCarloMcmc.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "import { generateDiversityMetrics } from './diversityService';",
    "import { calculateGeneticDiversityIndex } from './diversityService';"
)

content = content.replace(
    "diversityMetrics: generateDiversityMetrics(suggestedNumbers, history, perturbedWeights)",
    "diversityMetrics: calculateGeneticDiversityIndex(suggestedNumbers, breakdown)"
)

with open('services/prediction/monteCarloMcmc.ts', 'w') as f:
    f.write(content)
