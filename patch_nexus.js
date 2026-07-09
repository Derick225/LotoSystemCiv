const fs = require('fs');
const file = './components/NexusEngine.tsx';
let code = fs.readFileSync(file, 'utf8');

const regex = /const storeHistory = useNexusStore\.getState\(\)\.history;\s*const hasDrawNameMismatch[\s\S]*?if \(storeHistory\.length !== history\.length \|\| hasDrawNameMismatch \|\| storeHistory\.length === 0\) \{/m;

if (regex.test(code)) {
    code = code.replace(regex, `const storeHistory = useNexusStore.getState().history;
        // On vérifie de façon robuste si on doit mettre à jour le store
        const needsUpdate = 
            storeHistory.length !== history.length || 
            (history.length > 0 && storeHistory.length > 0 && history[0].id !== storeHistory[0].id) ||
            storeHistory.length === 0 ||
            useNexusStore.getState().drawName !== (history[0]?.drawName || history[0]?.draw_name);

        if (needsUpdate) {`);
    fs.writeFileSync(file, code);
    console.log("Patched NexusEngine.tsx successfully");
} else {
    console.log("Could not find target in NexusEngine.tsx");
}
