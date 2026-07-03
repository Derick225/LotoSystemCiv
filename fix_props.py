import re

with open('components/tabs/SimulationLab.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'export const SimulationLab: React.FC<{ drawName: string }> = () => {',
    'export const SimulationLab: React.FC<{ drawName: string }> = ({ drawName }) => {'
)

# And make sure useLotoData is imported!
if 'import { useLotoData }' not in content:
    content = content.replace(
        'import { Database, Upload, Play, Square, Activity } from "lucide-react";',
        'import { Database, Upload, Play, Square, Activity } from "lucide-react";\nimport { useLotoData } from "../../hooks/useLotoData";'
    )

with open('components/tabs/SimulationLab.tsx', 'w') as f:
    f.write(content)
