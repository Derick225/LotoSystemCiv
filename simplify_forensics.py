import re

with open('components/PredictionForensics.tsx', 'r') as f:
    content = f.read()

# Let's simplify the tabs declaration
content = content.replace(
    'const [activeTab, setActiveTab] = useState<\n    "spatial" | "ballistic" | "spectral" | "simulation" | "autopsy" | "crypto" | "xap"\n  >("spatial");',
    'const [activeTab, setActiveTab] = useState<"autopsy" | "metrics">("autopsy");'
)

content = content.replace(
    'const [activeTab, setActiveTab] = useState<\n    "spatial" | "ballistic" | "spectral" | "simulation" | "autopsy" | "crypto" | "xap"\n  >("spatial");',
    'const [activeTab, setActiveTab] = useState<"autopsy" | "metrics">("autopsy");'
)
content = content.replace(
    'const [activeTab, setActiveTab] = useState<"spatial" | "ballistic" | "spectral" | "simulation" | "autopsy" | "crypto" | "xap">("spatial");',
    'const [activeTab, setActiveTab] = useState<"autopsy" | "metrics">("autopsy");'
)
# I will just write a simpler navigation logic
with open('components/PredictionForensics.tsx', 'w') as f:
    f.write(content)
