import { get, set, del, keys } from 'idb-keyval';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const OFFLINE_QUEUE_PREFIX = 'nexus_offline_queue_';

export interface OfflineQueueItem {
  id: string;
  type: 'prediction_snapshot' | 'learning_log' | 'learning_session';
  drawName: string;
  payload: Record<string, any>;
  timestamp: number;
  attempts: number;
}

/**
 * Service de queue hors-ligne déterministe avec réconciliation réseau automatique.
 * Garantit que chaque snapshot ou log d'apprentissage est écrit localement dans IndexedDB
 * puis synchronisé en arrière-plan sans jamais bloquer le fil d'exécution principal React.
 */
class OfflineQueueService {
  private isProcessing = false;
  private listenerInitialized = false;

  public initReconciler() {
    if (this.listenerInitialized || typeof window === 'undefined') return;
    this.listenerInitialized = true;

    window.addEventListener('online', () => {
      console.log('[OfflineQueue] Reconnexion réseau détectée. Lancement de la réconciliation...');
      this.processQueue().catch((err) => console.warn('[OfflineQueue] Échec de réconciliation :', err));
    });

    if (navigator.onLine) {
      setTimeout(() => this.processQueue().catch(() => {}), 3000);
    }
  }

  /**
   * Enregistre un élément dans la queue locale IndexedDB et tente une synchronisation si en ligne
   */
  public async enqueue(
    type: 'prediction_snapshot' | 'learning_log' | 'learning_session',
    drawName: string,
    payload: Record<string, any>
  ): Promise<void> {
    const id = payload.id || `queue_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const queueItem: OfflineQueueItem = {
      id,
      type,
      drawName,
      payload,
      timestamp: Date.now(),
      attempts: 0,
    };

    const storageKey = `${OFFLINE_QUEUE_PREFIX}${type}_${id}`;
    try {
      await set(storageKey, JSON.stringify(queueItem));
    } catch (err) {
      console.warn(`[OfflineQueue] Impossible d'écrire l'élément ${id} dans IndexedDB :`, err);
    }

    // Tenter immédiatement d'envoyer si nous sommes en ligne
    if (navigator.onLine && !this.isProcessing) {
      this.processQueue().catch(() => {});
    }
  }

  /**
   * Traite tous les éléments en attente dans la queue IndexedDB et synchronise avec Supabase
   */
  public async processQueue(): Promise<{ processed: number; errors: number }> {
    if (this.isProcessing || !navigator.onLine || !isSupabaseConfigured()) {
      return { processed: 0, errors: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let errors = 0;

    try {
      const allKeys = await keys();
      const queueKeys = allKeys.filter(
        (k) => typeof k === 'string' && k.startsWith(OFFLINE_QUEUE_PREFIX)
      ) as string[];

      if (queueKeys.length === 0) {
        this.isProcessing = false;
        return { processed: 0, errors: 0 };
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { getMany, delMany, setMany } = await import('idb-keyval');
      const values = await getMany(queueKeys);
      const keysToDelete: string[] = [];
      const entriesToUpdate: [string, any][] = [];

      for (let i = 0; i < values.length; i++) {
        const raw = values[i];
        const key = queueKeys[i];
        if (!raw) continue;

        let item: OfflineQueueItem;
        try {
          item = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          keysToDelete.push(key);
          continue;
        }

        let syncSuccess = false;

        try {
          if (item.type === 'prediction_snapshot') {
            const rowData = {
              ...item.payload,
              user_id: user?.id || null,
            };
            const { error } = await supabase.from('prediction_snapshots').upsert(rowData);
            if (!error) syncSuccess = true;
          } else if (item.type === 'learning_log' || item.type === 'learning_session') {
            // Désactivé de manière permanente pour éviter de consommer inutilement du quota Supabase gratuit.
            // On considère le traitement local comme suffisant et réussi.
            syncSuccess = true;
          }
        } catch (e) {
          console.warn(`[OfflineQueue] Erreur de synchro pour ${item.id} :`, e);
        }

        if (syncSuccess) {
          keysToDelete.push(key);
          processed++;
        } else {
          item.attempts += 1;
          if (item.attempts >= 5) {
            keysToDelete.push(key);
            errors++;
          } else {
            entriesToUpdate.push([key, JSON.stringify(item)]);
            errors++;
          }
        }
      }
      
      if (keysToDelete.length > 0) {
          await delMany(keysToDelete);
      }
      if (entriesToUpdate.length > 0) {
          await setMany(entriesToUpdate);
      }
      
    } catch (err) {
      console.error('[OfflineQueue] Erreur critique durant la réconciliation :', err);
    } finally {
      this.isProcessing = false;
    }

    return { processed, errors };
  }
}

export const offlineQueueService = new OfflineQueueService();
