import re

with open('components/tabs/SimulationLab.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'Importez un jeu de données personnalisé et lancez l\'entraînement du réseau de neurones en temps réel dans votre navigateur.',
    'Le laboratoire ML permet d\'utiliser l\'historique réel du tirage (features normalisées) ou d\'importer un CSV/JSON pour entraîner un réseau de neurones séquentiel 10x32x16x5 en temps réel dans votre navigateur.'
)
content = content.replace(
    '<h4 className="text-xs font-bold uppercase text-slate-500 mb-4">1. Données d\'entraînement</h4>',
    '<h4 className="text-xs font-bold uppercase text-slate-500 mb-4">1. Données (Auto: Historique)</h4>'
)
with open('components/tabs/SimulationLab.tsx', 'w') as f:
    f.write(content)
