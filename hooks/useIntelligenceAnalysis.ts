import { useState, useRef, useEffect } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { analyzeDrawLogic } from '../services/geminiService';
import { generateNarrativeReport } from '../services/narrativeService';
import { calculateVolatility, calculateShannonEntropy, calculateChiSquare, calculateFractalIndex } from '../services/mathService';
import type { GeminiReasoning, NarrativeReport } from '../types';
import { useToast } from '../components/ui/Toast';
import { audioEngine } from '../utils/audioEngine';

interface IntelligenceContextMetrics {
    volatility: number;
    entropy: number;
    hurst: number;
}

export const useIntelligenceAnalysis = (drawName: string) => {
    const { showToast } = useToast();
    const history = useNexusStore(state => state.history);
    const stats = useNexusStore(state => state.stats);

    const [analysis, setAnalysis] = useState<GeminiReasoning | null>(null);
    const [narrative, setNarrative] = useState<NarrativeReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [contextMetrics, setContextMetrics] = useState<IntelligenceContextMetrics | null>(null);

    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const runAnalysis = async () => {
        audioEngine.play('click');
        if (isMounted.current) setLoading(true);

        try {
            if (history.length < 15) {
                if (isMounted.current) {
                    audioEngine.play('error');
                    showToast("Pas assez d'historique (Min 15 requis).", "error");
                    setLoading(false);
                }
                return;
            }

            audioEngine.play('loading');
            
            // 1. Calculs Mathématiques Préalables (Le "Grounding")
            const freqMap: Record<number, number> = {};
            stats.forEach(s => freqMap[s.number] = s.count);

            // These could potentially be moved to Web Workers if needed
            const vol = calculateVolatility(history);
            const ent = calculateShannonEntropy(history);
            const chi = calculateChiSquare(freqMap, history.length * 5);
            const hurst = calculateFractalIndex(history);

            // Protection NaN
            const safeVolatility = isNaN(vol.score) ? 50 : vol.score;
            const safeEntropy = isNaN(ent.normalized) ? 0.95 : ent.normalized;
            const safeHurst = isNaN(hurst) ? 0.5 : hurst;

            const metrics = { volatility: safeVolatility, entropy: safeEntropy, hurst: safeHurst };
            
            if (isMounted.current) {
                setContextMetrics(metrics);
            }

            // 2. Lancement parallèle : Analyse Logique + Rapport Narratif
            const [reasoning, story] = await Promise.all([
                analyzeDrawLogic(drawName, history, metrics),
                generateNarrativeReport(drawName, history, ent, chi, safeHurst),
                new Promise(r => setTimeout(r, 1500)) // delay for visual feedback
            ]);

            if (isMounted.current) {
                if (reasoning) {
                    const safeReasoning = {
                        ...reasoning,
                        suggestedFocus: Array.isArray(reasoning.suggestedFocus) ? reasoning.suggestedFocus : []
                    };
                    setAnalysis(safeReasoning);
                }
                if (story) setNarrative(story);
                
                audioEngine.play('success');
                showToast("Inférence Nexus terminée.", "success");
            }
        } catch (e: unknown) {
            console.error("Inference Tab Error:", e);
            if (isMounted.current) {
                audioEngine.play('error');
                showToast(`Anomalie : ${(e instanceof Error ? e.message : String(e)) || "Échec de l'inférence"}`, "error");
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const copyReport = (text: string) => {
        audioEngine.play('click');
        navigator.clipboard.writeText(text);
        audioEngine.play('success');
        showToast("Rapport copié.", "success");
    };

    return {
        analysis,
        narrative,
        loading,
        contextMetrics,
        runAnalysis,
        copyReport
    };
};
