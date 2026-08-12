import re

with open('services/prediction/monteCarloMcmc.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "import { buildAlgoBundle, extractFeatures, calculateScores } from './predictionFacade';",
    "import { buildAlgoBundle } from './predictionFacade';\\nimport { extractFeatures } from './featureExtractor';\\nimport { calculateScores } from './scoringEngine';"
)

with open('services/prediction/monteCarloMcmc.ts', 'w') as f:
    f.write(content)
