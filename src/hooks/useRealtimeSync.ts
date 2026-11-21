import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { useNexusStore } from '../store/useNexusStore';
import { useSession } from './useAuth';
import { useToast } from '../components/ui/Toast';
import { audioEngine } from '../utils/audioEngine';
import { logger } from '../utils/logger';
import { lotteryKeys } from './useLottery';
import { syncDrawCancellationsFromDb } from '../services/drawScheduleExceptionService';

export interface SnapshotRealtimeTransition {
    kind: 'completed' | 'cancelled' | 'ignored';
    drawName: string;
}

/**
 * Résout une transition realtime sur la table `prediction_snapshots`.
 * Les handlers Supabase/Edge passent le statut de `'PENDING'` à `'COMPLETED'` ou `'CANCELLED'`.
 */
export const resolveSnapshotRealtimeTransition = (
    oldRecord: Record<string, unknown> | null | undefined,
    newRecord: Record<string, unknown> | null | undefined
): SnapshotRealtimeTransition => {
    const newStatus = String(newRecord?.status || '').toUpperCase();
    const oldStatus = String(oldRecord?.status || '').toUpperCase();
    const drawName = String(newRecord?.draw_name || oldRecord?.draw_name || '');

    if (newStatus === 'COMPLETED' && oldStatus !== 'COMPLETED') {
        return { kind: 'completed', drawName };
    }
    if (newStatus === 'CANCELLED' && oldStatus !== 'CANCELLED') {
        return { kind: 'cancelled', drawName };
    }
    return { kind: 'ignored', drawName };
};

export const useRealtimeSync = () => {
    const queryClient = useQueryClient();
    const { session } = useSession();
    const { showToast } = useToast();
    const refreshData = useNexusStore((state) => state.refreshData);
    const drawName = useNexusStore((state) => state.drawName);
    const processedRealtimeDrawsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!navigator.onLine || !drawName) return;

        let lastSyncTime = 0;
        const MIN_SYNC_INTERVAL_MS = 60 * 1000; // 1 minute cool-down window to avoid duplicate triggers

        const triggerBackgroundSync = async () => {
            const now = Date.now();
            if (now - lastSyncTime < MIN_SYNC_INTERVAL_MS) {
                logger.debug("[Background Sync] Cooldown active, skipping sync to optimize battery and network.");
                return;
            }
            lastSyncTime = now;

            logger.debug({ drawName }, `[Background Sync] App focus / visibility detected. Executing progressive background sync`);

            try {
                // 1. Refresh draw results & cancellations silently in the background
                await Promise.all([
                    refreshData(drawName, true),
                    syncDrawCancellationsFromDb(),
                ]);

                // 2. Perform background synchronization of predictions history
                const { syncAllHistory } = await import('../services/predictionHistoryService');
                await syncAllHistory(drawName);

                logger.debug("[Background Sync] Progressive background sync successfully completed.");
            } catch (err) {
                logger.warn({ err }, "[Background Sync] Error during background progressive sync");
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                triggerBackgroundSync();
            }
        };

        const handleFocus = () => {
            triggerBackgroundSync();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [drawName, refreshData]);

    useEffect(() => {
        if (!isSupabaseConfigured()) return;

        // --- 1. GLOBALE : Synchronisation des résultats de tirages & annulations en temps réel ---
        const drawChannel = supabase
            .channel('global-draw-results-sync')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'draw_results' },
                (payload) => {
                    const eventType = payload.eventType;
                    const newRecord = (payload.new || {}) as Record<string, unknown>;
                    const oldRecord = (payload.old || {}) as Record<string, unknown>;
                    const changedDraw = String(newRecord.draw_name || oldRecord.draw_name || '');
                    const changedDate = String(newRecord.date || oldRecord.date || '');
                    const changedId = newRecord.id ? String(newRecord.id) : undefined;

                    if (eventType === 'INSERT') {
                        audioEngine.play('success');
                        showToast(`Nouveau tirage détecté : ${changedDraw} (${changedDate})`, "success");
                    } else if (eventType === 'UPDATE') {
                        showToast(`Tirage ${changedDraw} mis à jour dans le cloud.`, "info");
                    }

                    queryClient.invalidateQueries({ queryKey: lotteryKeys.all });

                    // Si le tirage actuel ouvert est affecté ou modifié, on rafraîchit automatiquement l'interface
                    if (drawName && changedDraw === drawName) {
                        refreshData(drawName, true);
                    }

                    // Liaison directe avec l'autopsie locale et la réconciliation ADN des prédictions en attente
                    if ((eventType === 'INSERT' || eventType === 'UPDATE') && changedDraw && changedDate) {
                        const dedupKey = `${changedDraw}_${changedDate}_${changedId || eventType}`;
                        if (!processedRealtimeDrawsRef.current.has(dedupKey)) {
                            processedRealtimeDrawsRef.current.add(dedupKey);
                            import('../services/lotteryService')
                                .then(({ triggerAutomationForNewResults }) =>
                                    triggerAutomationForNewResults(changedDraw, changedDate, changedId)
                                )
                                .catch((err) => {
                                    logger.warn({ err, changedDraw, changedDate }, "[Realtime] Échec déclenchement automatisation post-tirage");
                                });
                        }
                    }
                }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'draw_cancellations' },
                () => {
                    syncDrawCancellationsFromDb(true)
                        .then(() => {
                            queryClient.invalidateQueries({ queryKey: lotteryKeys.all });
                        })
                        .catch((err) => {
                            logger.warn({ err }, "[Realtime] Échec synchronisation des annulations de tirages");
                        });
                }
            )
            .subscribe((status, _err) => {
                if (status === 'SUBSCRIBED') {
                    logger.info("📡 Synchro Temps-Réel ACTIF [Public].");
                }
            });

        // 1.2 Événements locaux (Mode Hors-ligne, Backtesting, Synchronisation API/Delta)
        const handleLocalUpdated = (e: Event) => {
            const customEvent = e as CustomEvent;
            const targetDraw = customEvent.detail?.drawName || drawName;
            const source = customEvent.detail?.source;
            queryClient.invalidateQueries({ queryKey: lotteryKeys.all });
            if (targetDraw && (targetDraw === drawName || targetDraw === 'ALL') && source !== 'background-delta') {
                logger.debug({ targetDraw }, `[Local Sync Event] Rafraîchissement des données`);
                refreshData(drawName || targetDraw, true);
            }
        };

        window.addEventListener('DRAW_RESULTS_UPDATED', handleLocalUpdated);

        return () => {
            supabase.removeChannel(drawChannel);
            window.removeEventListener('DRAW_RESULTS_UPDATED', handleLocalUpdated);
        };
    }, [drawName, refreshData, showToast, queryClient]);

    useEffect(() => {
        if (!isSupabaseConfigured() || !session?.user) return;

        // --- 2. PRIVÉE : Synchronisation Autopsie & Événements Utilisateur ---
        const privateChannel = supabase
            .channel(`private-user-sync-${session.user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'prediction_snapshots',
                filter: `user_id=eq.${session.user.id}`
            }, (payload) => {
                const oldRecord = payload.old as Record<string, unknown>;
                const newRecord = payload.new as Record<string, unknown>;
                const transition = resolveSnapshotRealtimeTransition(oldRecord, newRecord);

                if (transition.kind === 'completed') {
                    audioEngine.play('success');
                    showToast(`🧬 Autopsie terminée pour le tirage ${transition.drawName}.`, 'success');
                } else if (transition.kind === 'cancelled') {
                    showToast(`⚠️ Tirage annulé / reporté pour ${transition.drawName}.`, 'info');
                }

                if (transition.kind !== 'ignored') {
                    queryClient.invalidateQueries({ queryKey: lotteryKeys.all });
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(
                            new CustomEvent('PREDICTION_SNAPSHOTS_UPDATED', {
                                detail: { drawName: transition.drawName, status: newRecord.status },
                            })
                        );
                    }
                    if (drawName && drawName === transition.drawName) {
                        refreshData(transition.drawName, true);
                    }
                }
            })
            // Ecoute des modifications côté serveur des Prédictions pour un Sync multi-devices
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'predictions',
                filter: `user_id=eq.${session.user.id}`
            }, (payload) => {
                logger.debug({ record: payload.new }, "Nouvelle prédiction détectée (Multi-Device).");
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    logger.info("🔐 Synchro Temps-Réel ACTIF [Privé].");
                }
            });

        return () => {
            supabase.removeChannel(privateChannel);
        };
    }, [session?.user, drawName, refreshData, showToast, queryClient]);
};