with open('components/tabs/SimulationLab.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'import { useLotoData } from "../../hooks/useLotoData";',
    'import { useNexusStore } from "../../store/useNexusStore";'
)
content = content.replace(
    'const { history } = useLotoData(drawName);',
    'const history = useNexusStore(state => state.history);'
)

with open('components/tabs/SimulationLab.tsx', 'w') as f:
    f.write(content)
