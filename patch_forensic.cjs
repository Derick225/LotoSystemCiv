const fs = require('fs');
const file = './hooks/usePredictionGenerator.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    useEffect(() => {
        let active = true;
        const fetchReports = async () => {
            try {
                const rawReports = await getLocalForensicReports();
                if (!rawReports) return;
                const reports = rawReports.filter(r => r.drawName === drawName);
                if (reports.length > 0 && active) {
                    const windowSize = Math.min(10, reports.length);
                    const swans = reports.slice(0, windowSize).filter(r => r.isBlackSwan).length;
                    const chaoticRatio = swans / windowSize;
                    setIsChaotic(chaoticRatio >= 0.25 || (volatility?.score ?? 0) > 85);
                }
            } catch (err) {
                console.warn("[Oracle Base] Reports validation bypassed (local fallback mode active):", err);
            }
        };
        fetchReports();
        return () => { active = false; };
    }, [drawName, volatility]);`;

const replacement = `    const [chaoticRatio, setChaoticRatio] = useState(0);
    useEffect(() => {
        let active = true;
        const fetchReports = async () => {
            try {
                const rawReports = await getLocalForensicReports();
                if (!rawReports || !active) return;
                const reports = rawReports.filter(r => r.drawName === drawName);
                if (reports.length > 0) {
                    const windowSize = Math.min(10, reports.length);
                    const swans = reports.slice(0, windowSize).filter(r => r.isBlackSwan).length;
                    setChaoticRatio(swans / windowSize);
                } else {
                    setChaoticRatio(0);
                }
            } catch (err) {
                console.warn("[Oracle Base] Reports validation bypassed (local fallback mode active):", err);
            }
        };
        fetchReports();
        return () => { active = false; };
    }, [drawName]);

    useEffect(() => {
        setIsChaotic(chaoticRatio >= 0.25 || (volatility?.score ?? 0) > 85);
    }, [chaoticRatio, volatility]);`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Done");
