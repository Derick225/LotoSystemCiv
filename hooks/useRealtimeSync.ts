import { useEffect } from 'react';
import { db, isFirebaseConfigured } from '../services/firebaseClient';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useNexusStore } from '../store/useNexusStore';
import { useAuth } from './useAuth';
import { useToast } from '../components/ui/Toast';
import { audioEngine } from '../utils/audioEngine';
import { workManager } from '../services/workManager';

export const useRealtimeSync = () => {
    const { session } = useAuth();
    const { showToast } = useToast();
    const refreshData = useNexusStore((state) => state.refreshData);
    const drawName = useNexusStore((state) => state.drawName);

    // Initialisation et démarrage du WorkManager d'arrière-plan
    useEffect(() => {
        workManager.initialize();
    }, []);

    useEffect(() => {
        if (!navigator.onLine || !drawName) return;

        let lastSyncTime = 0;
        const MIN_SYNC_INTERVAL_MS = 60 * 1000;

        const triggerBackgroundSync = async () => {
            const now = Date.now();
            if (now - lastSyncTime < MIN_SYNC_INTERVAL_MS) {
                return;
            }
            lastSyncTime = now;

            try {
                await workManager.scheduleDrawsSyncWork({
                    force: false,
                    drawNames: [drawName],
                    triggerSource: 'REALTIME_SYNC_HOOK'
                });
            } catch (err) {
                console.warn("[Background Sync] Error during background progressive sync:", err);
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

        if (document.visibilityState === 'visible') {
            triggerBackgroundSync();
        }

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [drawName, refreshData]);

    useEffect(() => {
        if (!isFirebaseConfigured()) return;

        const unsub = onSnapshot(collection(db, 'draw_results'), (snap) => {
            snap.docChanges().forEach((change) => {
                const newRecord = change.doc.data();
                if (change.type === 'added') {
                    audioEngine.play('success');
                    showToast(`Nouveau tirage détecté : ${newRecord.draw_name} (${newRecord.date})`, "success");
                } else if (change.type === 'modified') {
                    showToast(`Tirage ${newRecord.draw_name} mis à jour dans le cloud.`, "info");
                }

                if (drawName && newRecord && newRecord.draw_name === drawName) {
                    refreshData(drawName, true);
                }
            });
        });

        const handleLocalUpdated = (e: Event) => {
            const customEvent = e as CustomEvent;
            const targetDraw = customEvent.detail?.drawName || drawName;
            if (targetDraw && targetDraw === drawName) {
                refreshData(targetDraw, true);
            }
        };

        window.addEventListener('DRAW_RESULTS_UPDATED', handleLocalUpdated);

        return () => {
            unsub();
            window.removeEventListener('DRAW_RESULTS_UPDATED', handleLocalUpdated);
        };
    }, [drawName, refreshData, showToast]);

    useEffect(() => {
        if (!isFirebaseConfigured() || !session?.user) return;

        const q = query(
            collection(db, 'prediction_snapshots'),
            where('user_id', '==', session.user.id)
        );

        const unsub = onSnapshot(q, (snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type === 'modified') {
                    const newRecord = change.doc.data();
                    if (newRecord.status === 'ANALYZED') {
                        audioEngine.play('success');
                        showToast(`🧬 Autopsie terminée pour le tirage ${newRecord.draw_name}.`, 'success');
                        if (drawName === newRecord.draw_name) refreshData(newRecord.draw_name as string, true);
                    }
                }
            });
        });

        return () => {
            unsub();
        };
    }, [session?.user, drawName, refreshData, showToast]);
};