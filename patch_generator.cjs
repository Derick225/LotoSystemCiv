const fs = require('fs');
const file = './hooks/usePredictionGenerator.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    const currentEntropy = useMemo(() => {
        if (history.length === 0) return 0;
        return calculateShannonEntropy(history.slice(0, 10)).normalized;
    }, [history]);`;

const replacement = `    const regime = useNexusStore(state => state.regime);
    const currentEntropy = useMemo(() => {
        return regime?.entropy || (history.length > 0 ? calculateShannonEntropy(history.slice(0, 10)).normalized : 0);
    }, [regime, history]);`;

const target2 = `    const gameRegimeInfo = useMemo(() => {
        if (!history || history.length < 5) return null;
        try {
            return detectGameRegime(history);
        } catch (e) {
            console.warn("[Oracle Base] Failed to detect game regime:", e);
            return null;
        }
    }, [history]);`;

const replacement2 = `    const gameRegimeInfo = regime;`;

content = content.replace(target, replacement);
content = content.replace(target2, replacement2);
fs.writeFileSync(file, content);
console.log("Done");
