import re

with open('components/tabs/SimulationLab.tsx', 'r') as f:
    content = f.read()

# Add useLotoData import
content = content.replace(
    'import * as tf from "@tensorflow/tfjs";', 
    'import * as tf from "@tensorflow/tfjs";\nimport { useLotoData } from "../../hooks/useLotoData";'
)

# Call useLotoData
content = content.replace(
    'const [trainingState, setTrainingState] = useState<\'idle\' | \'training\' | \'finished\'>(\'idle\');',
    'const [trainingState, setTrainingState] = useState<\'idle\' | \'training\' | \'finished\'>(\'idle\');\n  const { history } = useLotoData(drawName);'
)

with open('components/tabs/SimulationLab.tsx', 'w') as f:
    f.write(content)
