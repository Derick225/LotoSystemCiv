import re

with open('components/tabs/ForensicHub.tsx', 'r') as f:
    content = f.read()

# Remove imports
content = re.sub(r'import \{ UnifiedForensicTimeline \} from "\.\./UnifiedForensicTimeline";\n', '', content)
content = re.sub(r'import \{ ForensicTimeMachine \} from "\.\./ForensicTimeMachine";\n', '', content)

# Remove tabs switching UI
tabs_ui_regex = r'\{/\* NAVIGATION ONGLETS \*/\}.*?\{/\* CONTENU \*/\}'
content = re.sub(tabs_ui_regex, '{/* CONTENU */}', content, flags=re.DOTALL)

# Remove the mode condition wrappers for TimeMachine and Historique
content = re.sub(r'\{mode === "timemachine" && \(.*?<ForensicTimeMachine.*?\).*?\}', '', content, flags=re.DOTALL)

# Let's replace the whole frise and mode condition
content = re.sub(r'\{/\* Frise Post-Mortem Unifiée \([^)]+\) \*/\}.*?<UnifiedForensicTimeline[^>]+/>', '', content, flags=re.DOTALL)

# Make sure only prediction tab content remains, by removing the `{mode === "prediction" && (` and the closing `)}`
content = content.replace('{mode === "prediction" && (', '')
# Find where it ends. It's right before `{selectedReport && (`
content = content.replace('          </div>\n        )}\n\n        {selectedReport && (', '          </div>\n\n        {selectedReport && (')

with open('components/tabs/ForensicHub.tsx', 'w') as f:
    f.write(content)
