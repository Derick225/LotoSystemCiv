with open('components/tabs/SimulationLab.tsx', 'r') as f:
    content = f.read()

if 'import { useLotoData }' not in content:
    content = 'import { useLotoData } from "../../hooks/useLotoData";\n' + content

with open('components/tabs/SimulationLab.tsx', 'w') as f:
    f.write(content)
