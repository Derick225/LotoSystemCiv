import { useState, useEffect, useCallback } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { getPredictionHistoryAsync, linkPredictionToResult, findMatchingResultForPrediction } from '../services/predictionHistoryService';
import { 
    getLocalForensicReports, 
    performForensicAnalysis, 
    saveForensicReport, 
    healForensicReport, 
    getDismissedAutopsyPredictionIds,
    deleteForensicReportLocal,
    deleteMultipleForensicReportsLocal
} from '../services/postPredictionAnalysisService';
import { getPlatinumHistory, performPlatinumAudit } from '../services/metaAnalystService';
import { PredictionHistoryItem, ForensicReport, PlatinumAudit } from '../types';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';
import { useToast } from '../components/ui/Toast';
import { syncForensicReports, deleteForensicReportCloud, deleteMultipleForensicReportsCloud } from '../services/syncService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { parseDateSafely } from '../utils/dateUtils';

const normalizeDrawStr = (s?: string): string => {
    return (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^(loto|ghana)\s+/i, "");
};

export const useForensicData = (drawName: string) => {
    const history = useNexusStore((state) => state.history);
    const storeDrawName = useNexusStore((state) => state.drawName);
    const { showToast } = useToast();
    const [reports, setReports] = useState<ForensicReport[]>([]);
    const [pendingPredictions, setPendingPredictions] = useState<PredictionHistoryItem[]>([]);
    const [platinumAudits, setPlatinumAudits] = useState<PlatinumAudit[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const loadData = useCallback(async () => {
        if (!drawName) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const cleanHistory = purifyHistoryForDraw(drawName, history);
        try {
            // 1. Charger les rapports locaux
            let currentReports = await getLocalForensicReports();
            currentReports = currentReports.filter((r) => normalizeDrawStr(r.drawName) === normalizeDrawStr(drawName));

            // Charger depuis Cloud si possible
            if (isSupabaseConfigured() && navigator.onLine) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        const { data: cloudReports } = await supabase
                            .from('forensic_reports')
                            .select('*')
                            .eq('draw_name', drawName)
                            .order('created_at', { ascending: false });

                        if (cloudReports && cloudReports.length > 0) {
                            cloudReports.forEach((cr: any) => {
                                const existingIdx = currentReports.findIndex((r) => r.id === cr.id || r.predictionId === cr.prediction_id);
                                const mappedReport = { ...cr.report_data, id: cr.id, date: cr.draw_date };
                                if (existingIdx >= 0) {
                                    currentReports[existingIdx] = { ...currentReports[existingIdx], ...mappedReport };
                                } else {
                                    currentReports.push(mappedReport);
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch cloud forensic reports", e);
                }
            }

            const existingReportIds = new Set(currentReports.map((r) => r.predictionId));
            const dismissedPredictionIds = await getDismissedAutopsyPredictionIds();

            // 2. Identifier les prédictions sans rapport (et non expressément supprimées par l'utilisateur)
            const preds = await getPredictionHistoryAsync(drawName);
            const pending: PredictionHistoryItem[] = [];
            const analysisPromises: Promise<ForensicReport | null>[] = [];

            // O(1) Lookups
            const historyById = new Map();
            const historyByDate = new Map();
            cleanHistory.forEach((h) => {
                historyById.set(h.id, h);
                historyByDate.set(h.date, h);
            });

            for (const pred of preds.slice(0, 30)) {
                if (existingReportIds.has(pred.id) || dismissedPredictionIds.has(pred.id)) continue;

                let actual = null;
                if (pred.drawResultId) {
                    actual = historyById.get(pred.drawResultId);
                }
                if (!actual) {
                    const d = parseDateSafely(pred.timestamp);
                    const predDateLocale = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
                    actual = historyByDate.get(predDateLocale);

                    // Centralized robust matching helper
                    if (!actual) {
                        actual = findMatchingResultForPrediction(pred, cleanHistory);
                    }

                    // Fallback date approximative
                    if (!actual) {
                        const predTime = pred.timestamp;
                        const sortedHistory = [...cleanHistory].sort(
                            (a, b) => parseDateSafely(a.date).getTime() - parseDateSafely(b.date).getTime()
                        );
                        actual = sortedHistory.find((d) => {
                            const dTime = parseDateSafely(d.date).getTime();
                            const actualDrawTime = dTime + 21 * 3600 * 1000;
                            return actualDrawTime >= predTime && actualDrawTime - predTime < 7 * 24 * 3600 * 1000;
                        }) || null;
                    }
                }

                if (actual) {
                    analysisPromises.push(
                        performForensicAnalysis(
                            drawName,
                            actual.date,
                            pred.prediction.suggestedNumbers,
                            actual.gagnants,
                            pred.prediction.breakdown,
                            pred.id,
                            actual.id,
                            true, // Skip LLM for bulk syncs
                            cleanHistory
                        ).then(async (rep) => {
                            saveForensicReport(rep);
                            if (!pred.drawResultId) {
                                await linkPredictionToResult(pred.id, actual.id);
                            }
                            return rep;
                        }).catch((e) => {
                            console.error("Failed to perform forensic analysis for", pred.id, e);
                            return null;
                        })
                    );
                } else {
                    pending.push(pred);
                }
            }

            if (analysisPromises.length > 0) {
                const newReports = await Promise.all(analysisPromises);
                const validNewReports = newReports.filter((r): r is ForensicReport => r !== null);
                if (validNewReports.length > 0) {
                    currentReports = [...currentReports, ...validNewReports];
                }
            }

            // 3. Charger le Platinum Audit
            const platHistory = await getPlatinumHistory(drawName);
            const audits: PlatinumAudit[] = [];
            
            platHistory.forEach(pred => {
                const actualResult = history.find(h => {
                    if (h.id === pred.id) return true;
                    const dParts = h.date.split("/");
                    if (dParts.length === 3) {
                        const hTime = new Date(`${dParts[2]}-${dParts[1]}-${dParts[0]}`).getTime();
                        return Math.abs(hTime - pred.timestamp) < 24 * 3600 * 1000 * 2;
                    }
                    return false;
                });
                
                if (actualResult) {
                    audits.push(performPlatinumAudit(pred, actualResult));
                }
            });

            const sortedReports = [...currentReports].sort((a, b) => {
                const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return tB - tA;
            });

            // Safeguard against duplicate forensic report IDs in React render key
            const uniqueSortedMap = new Map<string, ForensicReport>();
            sortedReports.forEach((r) => {
                if (r && r.id) {
                    uniqueSortedMap.set(r.id, r);
                }
            });
            const uniqueSortedList = Array.from(uniqueSortedMap.values()).map(healForensicReport);

            setReports(uniqueSortedList);
            setPendingPredictions(pending);
            setPlatinumAudits(audits);
        } catch (error) {
            console.error("Erreur chargement forensic", error);
            showToast("Erreur lors du chargement des données Forensic", "error");
        } finally {
            setLoading(false);
        }
    }, [drawName, storeDrawName, history, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData, refreshKey]);

    const refreshData = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    const syncReports = useCallback(async () => {
        if (!navigator.onLine) {
            showToast("Mode hors-ligne : Synchronisation suspendue.", "info");
            return;
        }
        const synced = await syncForensicReports(reports);
        setReports(synced);
        return synced;
    }, [reports, showToast]);

    const deleteReport = useCallback(async (id: string, predictionId?: string) => {
        // Optimistic UI update
        setReports(prev => prev.filter(r => r.id !== id));
        try {
            await deleteForensicReportLocal(id, predictionId);
            if (isSupabaseConfigured()) {
                await deleteForensicReportCloud(id);
            }
        } catch (e) {
            console.error("Erreur suppression rapport:", e);
            showToast("Erreur lors de la suppression du rapport", "error");
            refreshData();
        }
    }, [refreshData, showToast]);

    const deleteReports = useCallback(async (items: { id: string; predictionId?: string }[]) => {
        if (!items || items.length === 0) return;
        const idSet = new Set(items.map(i => i.id));
        // Optimistic UI update
        setReports(prev => prev.filter(r => !idSet.has(r.id)));
        try {
            await deleteMultipleForensicReportsLocal(items);
            if (isSupabaseConfigured()) {
                await deleteMultipleForensicReportsCloud(items.map(i => i.id));
            }
        } catch (e) {
            console.error("Erreur suppression multiple rapports:", e);
            showToast("Erreur lors de la suppression multiple", "error");
            refreshData();
        }
    }, [refreshData, showToast]);

    return {
        reports,
        pendingPredictions,
        setPendingPredictions,
        platinumAudits,
        loading,
        refreshData,
        refreshLocal: refreshData,
        setReports,
        syncReports,
        deleteReport,
        deleteReports
    };
};
