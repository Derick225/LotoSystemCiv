import re

with open('services/prediction/monteCarloMcmc.ts', 'r') as f:
    content = f.read()

# Replace the bad imports
content = content.replace("import { EnhancedMetrics, SymbioticContext } from '../../shared/prediction.types';", 
"import { EnhancedMetrics } from './metrics.types';\\nimport { SymbioticContext } from '../../types';")
content = content.replace("\\n", "\n")

with open('services/prediction/monteCarloMcmc.ts', 'w') as f:
    f.write(content)
