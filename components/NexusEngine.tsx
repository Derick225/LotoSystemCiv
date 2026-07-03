import React, { useEffect } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { useDrawHistory, useNexusAnalytics } from '../hooks/useLottery';
import { getAlgoWeights, generateMasterPrediction } from '../services/predictionEngine';
import { generateEmpiricalCalibration } from '../services/prediction/ticketAnalysisService';
import { generateSmartInsights } from '../services/insightService';
import { getPredictionHistoryAsync, calculateHistoricalPerformance, linkPredictionToResult, findMatchingResultForPrediction } from '../services/predictionHistoryService';
import { performForensicAnalysis, saveForensicReport, getForensicReportByPredictionId, syncForensicReportsWithCloud } from '../services/postPredictionAnalysisService';
import { LearningService } from '../services/learningService';
import { AppError, logError } from '../utils/AppError';
import { useAutonomousAgent } from '../hooks/useAutonomousAgent';

export const NexusEngine: React.FC = () => {
    useAutonomousAgent(); // Initialize the autonomous agent daemon
    const drawName = useNexusStore(s => s.drawName);
    const temporalDepth = useNexusStore(s => s.temporalDepth);
    const globalWeights = useNexusStore(s => s.globalWeights);
    const setGlobalWeights = useNexusStore(s => s.setGlobalWeights);
    const setHistoryData = useNexusStore(s => s.setHistoryData);
    const setAnalyticsData = useNexusStore(s => s.setAnalyticsData);
    const setLoading = useNexusStore(s => s.setLoading);
    const setLastPrediction = useNexusStore(s => s.setLastPrediction);
    const setSmartInsights = useNexusStore(s => s.setSmartInsights);
    const setCalibration = useNexusStore(s => s.setCalibration);
    const setEmpiricalCalibration = useNexusStore(s => s.setEmpiricalCalibration);

    // --- DATA FETCHING VIA REACT QUERY ---
    const { 
        data: history, 
        isLoading: historyLoading,
        refetch: refetchHistory 
    } = useDrawHistory(drawName);

    const {
        data: analytics,
        isLoading: analyticsLoading
    } = useNexusAnalytics(drawName, history);

    const loading = historyLoading || analyticsLoading;

    // Sync loading state
    useEffect(() => {
        setLoading(loading);
    }, [loading, setLoading]);

    // 1. Initialisation Configuration (Weights & RL)
    useEffect(() => {
        let mounted = true;
        const initConfig = async () => {
            const weights = await getAlgoWeights(drawName);
            if(mounted) setGlobalWeights(weights);
        };
        initConfig();
        return () => { mounted = false; };
    }, [drawName, setGlobalWeights]);

    // 2. Calcul des Stats basiques (Rapide, synchrone)
    useEffect(() => {
        if (!history || history.length === 0) {
            setHistoryData([], [], []);
            return;
        }
        
        const counts: Record<number, number> = {};
        history.forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n] || 0) + 1));
        const computedStats = Object.entries(counts).map(([n, c]) => ({ number: Number(n), count: c })).sort((a, b) => b.count - a.count);

        const computedGaps: { number: number; gap: number }[] = [];
        for (let i = 1; i <= 90; i++) {
            let gap = 0;
            for (const draw of history) { if (draw.gagnants.includes(i)) break; gap++; }
            computedGaps.push({ number: i, gap });
        }
        
        const empCal = generateEmpiricalCalibration(history);
        setEmpiricalCalibration(empCal);
        
        setHistoryData(history, computedStats, computedGaps);
    }, [history, setHistoryData, setEmpiricalCalibration]);

    // Sync Analytics
    useEffect(() => {
        if (analytics) {
            setAnalyticsData(analytics);
        }
    }, [analytics, setAnalyticsData]);

    // 3. Génération Prédiction & Insights (Dépendant des Analytics)
    useEffect(() => {
        if (!analytics || !history || history.length < 10) return;

        let mounted = true;
        const runEngine = async () => {
            try {
                // Génération de la prédiction Master
                const prediction = await generateMasterPrediction(
                    drawName, 
                    history, 
                    temporalDepth,
                    globalWeights, 
                    {
                        spectral: analytics.spectral, 
                        correlationMatrix: analytics.correlationMatrix, 
                        regularity: analytics.regularity
                    }, 
                    analytics.symbioticContext || undefined
                );
                if (mounted) setLastPrediction(prediction);

                // Insights
                const insights = await generateSmartInsights(
                    drawName, 
                    history, 
                    analytics.spectral, 
                    analytics.regularity.map(r => ({ number: r.number, gap: r.currentGap })), 
                    analytics.regularity
                );
                if (mounted) setSmartInsights(insights);

                // Calibration (Backtesting historique des prédictions)
                const preds = await getPredictionHistoryAsync(drawName);
                if (preds.length > 0 && mounted) {
                    // --- AUTO-LINKER & FORENSIC AUTOMATOR ---
                    let historyChanged = false;
                    let forensicGenerated = false;
                    let hasTriggerableLearning = false;
                    for (const item of preds) {
                        let match = item.drawResultId ? history.find(r => r.id === item.drawResultId) : null;
                        
                        if (!item.drawResultId) {
                            match = findMatchingResultForPrediction(item, history);
                            if (match) {
                                await linkPredictionToResult(item.id, match.id);
                                historyChanged = true;
                            }
                        }

                        // Automate Forensic Analysis if linked and no report exists
                        if (match) {
                            const existingReport = await getForensicReportByPredictionId(item.id);
                            if (!existingReport) {
                                try {
                                    const report = await performForensicAnalysis(
                                        drawName, match.date, 
                                        item.prediction.suggestedNumbers, 
                                        match.gagnants, item.prediction.breakdown,
                                        item.id,
                                        match.id,
                                        true, // skipLLM for automated background analysis
                                        history
                                    );
                                    saveForensicReport(report);
                                    forensicGenerated = true;

                                    // AUTO-TUNING: Self-Learning based on Forensic Reports
                                    // PROTECTION CYGNE NOIR: On ne s'optimise pas sur le bruit statistique pur
                                    if (report.isBlackSwan) {
                                        console.warn(`[Auto-Tuner] Tirage chaotique (Cygne Noir) détecté le ${match.date}. Apprentissage bloqué pour prévenir l'oubli catastrophique (Catastrophic Forgetting).`);
                                    } else {
                                        hasTriggerableLearning = true;
                                    }

                                } catch (error) {
                                    console.error("Failed to automate forensic analysis for prediction", item.id, error);
                                }
                            }
                        }
                    }
                    
                    const bgEnabled = localStorage.getItem("nexus_enable_bg_autolearn") === "true";
                    if (hasTriggerableLearning && bgEnabled) {
                        try {
                            const learningResult = await LearningService.triggerAutoLearning(drawName);
                            if (learningResult && learningResult.improvement && learningResult.weights) {
                                setGlobalWeights(learningResult.weights);
                            }
                        } catch (e) {
                            console.error("Background auto learning block failed", e);
                        }
                    }
                    
                    if (forensicGenerated) {
                        syncForensicReportsWithCloud().catch(e => console.error("Auto-sync forensic failed", e));
                    }
                    
                    // Recalculate performance with updated preds if needed
                    const updatedPreds = historyChanged ? await getPredictionHistoryAsync(drawName) : preds;
                    const perf = calculateHistoricalPerformance(updatedPreds, history);
                    
                    setCalibration({
                        overallScore: 0.25,
                        reliability: Math.min(100, Math.round(perf.accuracy * 5.0)),
                        bias: 'NEUTRAL',
                        sampleSize: perf.analyzedDrawsCount,
                        baseline: 0.2,
                        variance: 0.05,
                        trend: 0,
                        confidence: 0.8
                    });
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                logError(new AppError(msg || "Engine Error", "NEXUS_ENGINE_ERROR", "high", { error: e }), { source: 'NexusEngine' });
            }
        };

        runEngine();
        return () => { mounted = false; };
    }, [drawName, history, analytics, globalWeights, setLastPrediction, setSmartInsights, setCalibration]);

    // Override refresh in store to use React Query refetch
    useEffect(() => {
        useNexusStore.setState({
            refresh: async () => {
                await refetchHistory();
            },
            refreshData: async (name: string, force?: boolean) => {
                useNexusStore.getState().setDrawName(name);
                if (force) {
                    await refetchHistory();
                }
            }
        });
    }, [refetchHistory]);

    return null; // Headless component
};
