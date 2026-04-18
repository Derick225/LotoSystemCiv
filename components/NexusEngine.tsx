import React, { useEffect, useMemo, useCallback } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { useDrawHistory, useNexusAnalytics } from '../hooks/useLottery';
import { getAlgoWeights, saveAlgoWeights, generateMasterPrediction } from '../services/predictionEngine';
import { generateSmartInsights } from '../services/insightService';
import { getPredictionHistoryAsync, calculateHistoricalPerformance, linkPredictionToResult } from '../services/predictionHistoryService';
import { performForensicAnalysis, saveForensicReport, getForensicReportByPredictionId, syncForensicReportsWithCloud } from '../services/postPredictionAnalysisService';
import { LearningService } from '../services/learningService';
import { getSettings, saveSettings } from '../services/userPreferencesService';
import { AppError, logError } from '../utils/AppError';

export const NexusEngine: React.FC = () => {
    const drawName = useNexusStore(s => s.drawName);
    const globalWeights = useNexusStore(s => s.globalWeights);
    const setGlobalWeights = useNexusStore(s => s.setGlobalWeights);
    const setHistoryData = useNexusStore(s => s.setHistoryData);
    const setAnalyticsData = useNexusStore(s => s.setAnalyticsData);
    const setLoading = useNexusStore(s => s.setLoading);
    const setLastPrediction = useNexusStore(s => s.setLastPrediction);
    const setSmartInsights = useNexusStore(s => s.setSmartInsights);
    const setCalibration = useNexusStore(s => s.setCalibration);

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
        
        setHistoryData(history, computedStats, computedGaps);
    }, [history, setHistoryData]);

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
                    globalWeights, 
                    {
                        spectral: analytics.spectral, 
                        wavelet: analytics.wavelet, 
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
                    for (const item of preds) {
                        let match = item.drawResultId ? history.find(r => r.id === item.drawResultId) : null;
                        
                        if (!item.drawResultId) {
                            const dateStr = new Date(item.timestamp).toLocaleDateString('fr-FR');
                            match = history.find(r => r.date === dateStr);
                            if (match) {
                                await linkPredictionToResult(item.id, match.id);
                                historyChanged = true;
                            }
                        }

                        // Automate Forensic Analysis if linked and no report exists
                        if (match) {
                            const existingReport = getForensicReportByPredictionId(item.id);
                            if (!existingReport) {
                                try {
                                    const report = await performForensicAnalysis(
                                        drawName, match.date, 
                                        item.prediction.suggestedNumbers, 
                                        match.gagnants, item.prediction.breakdown,
                                        item.id
                                    );
                                    saveForensicReport(report);
                                    forensicGenerated = true;

                                    // AUTO-TUNING: Self-Learning based on Forensic Reports
                                    const learningResult = await LearningService.triggerAutoLearning(drawName);
                                    if (learningResult && learningResult.improvement) {
                                        // console.log(`[Auto-Tuner] Weights adjusted for ${drawName}:`, learningResult.message);
                                    }

                                } catch (error) {
                                    console.error("Failed to automate forensic analysis for prediction", item.id, error);
                                }
                            }
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
            } catch (e: any) {
                logError(new AppError(e.message || "Engine Error", "NEXUS_ENGINE_ERROR", "high", { error: e }), { source: 'NexusEngine' });
            }
        };

        runEngine();
        return () => { mounted = false; };
    }, [drawName, history, analytics, globalWeights, setLastPrediction, setSmartInsights, setCalibration]);

    // Override refresh and updateGlobalWeights in store to use React Query refetch
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
            },
            updateGlobalWeights: async (weights) => {
                useNexusStore.getState().setGlobalWeights(weights);
                await saveAlgoWeights(useNexusStore.getState().drawName, weights);
            }
        });
    }, [refetchHistory]);

    return null; // Headless component
};
