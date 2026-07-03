import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { useNexusStore } from '../store/useNexusStore';
import { useAuth } from './useAuth';
import { useToast } from '../components/ui/Toast';
import { audioEngine } from '../utils/audioEngine';

export const useRealtimeSync = () => {
    const { session } = useAuth();
    const { showToast } = useToast();
    const refreshData = useNexusStore((state) => state.refreshData);
    const drawName = useNexusStore((state) => state.drawName);

    useEffect(() => {
        if (!isSupabaseConfigured()) return;

        // --- 1. GLOBALE : Synchronisation des résultats de tirages en temps réel ---
        const drawChannel = supabase
            .channel('global-draw-results-sync')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'draw_results' }, 
                (payload) => {
                    const eventType = payload.eventType;
                    const newRecord = payload.new as Record<string, unknown>;
                    
                    if (eventType === 'INSERT') {
                        audioEngine.play('success');
                        showToast(`Nouveau tirage détecté : ${newRecord.draw_name} (${newRecord.date})`, "success");
                    } else if (eventType === 'UPDATE') {
                        showToast(`Tirage ${newRecord.draw_name} mis à jour dans le cloud.`, "info");
                    }
                    
                    // Si le tirage actuel ouvert est affecté ou modifié, on rafraîchit automatiquement l'interface
                    if (drawName && newRecord && newRecord.draw_name === drawName) {
                        refreshData(drawName, true);
                    }
                }
            )
            .subscribe((status, _err) => {
                if (status === 'SUBSCRIBED') {
                    console.log("📡 Synchro Temps-Réel ACTIF [Public].");
                }
            });

        // 1.2 Événements locaux (Mode Hors-ligne, Backtesting, Simulations locaux)
        const handleLocalUpdated = (e: Event) => {
            const customEvent = e as CustomEvent;
            const targetDraw = customEvent.detail?.drawName || drawName;
            if (targetDraw) {
                console.log(`[Local Sync Event] Refraîchissement des données pour : ${targetDraw}`);
                refreshData(targetDraw, true);
            }
        };

        window.addEventListener('DRAW_RESULTS_UPDATED', handleLocalUpdated);

        return () => {
            supabase.removeChannel(drawChannel);
            window.removeEventListener('DRAW_RESULTS_UPDATED', handleLocalUpdated);
        };
    }, [drawName, refreshData, showToast]);

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
                const oldRecord = payload.old;
                const newRecord = payload.new as Record<string, unknown>;
                
                if (oldRecord.status === 'PENDING' && newRecord.status === 'ANALYZED') {
                    audioEngine.play('success');
                    showToast(`🧬 Autopsie terminée pour le tirage ${newRecord.draw_name}.`, 'success');
                    if (drawName === newRecord.draw_name) refreshData(newRecord.draw_name as string, true);
                }
            })
            // Ecoute des modifications côté serveur des Prédictions pour un Sync multi-devices
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'predictions',
                filter: `user_id=eq.${session.user.id}`
            }, (payload) => {
                 // Notification silencieuse ou rafraîchissement si l'utilisateur a généré sur un autre device
                 console.log("Nouvelle prédiction détectée (Multi-Device).", payload.new);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log("🔐 Synchro Temps-Réel ACTIF [Privé].");
                }
            });

        return () => {
            supabase.removeChannel(privateChannel);
        };
    }, [session?.user, drawName, refreshData, showToast]);
};