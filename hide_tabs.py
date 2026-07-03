import re

with open('components/PredictionForensics.tsx', 'r') as f:
    content = f.read()

# Replace the tabs definition to only show 2 tabs
tabs_replacement = """
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {[
              { id: "autopsy", label: "Autopsie Globale", icon: <ScanLine size={16} /> },
              { id: "spatial", label: "Cartographie Spatiale", icon: <LayoutGrid size={16} /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white"
                    : "text-slate-500"
                }`}
              >
                <div className="flex items-center gap-2">
                  {tab.icon} {tab.label}
                </div>
              </button>
            ))}
          </div>
"""

content = re.sub(
    r'<div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">.*?</div>',
    tabs_replacement.strip(),
    content,
    flags=re.DOTALL
)

with open('components/PredictionForensics.tsx', 'w') as f:
    f.write(content)
