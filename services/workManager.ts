import { ALL_DRAWS } from '../constants';
import { lotteryService } from './lotteryService';
import { syncAllHistory } from './predictionHistoryService';
import { useNexusStore } from '../store/useNexusStore';
import { AppError, logError } from '../utils/AppError';

/**
 * Constantes pour le WorkManager de mise à jour des tirages en arrière-plan.
 */
export const WORK_MANAGER_CONSTANTS = {
  /** Intervalle de planification automatique (15 minutes en ms) */
  DEFAULT_SYNC_INTERVAL_MS: 15 * 60 * 1000,
  /** Seuil minimum d'anti-rebond entre deux synchronisations (2 minutes en ms) */
  MIN_COOLDOWN_MS: 2 * 60 * 1000,
  /** Nombre maximum de tentatives en cas d'erreur de réseau (Backoff déterministe) */
  MAX_RETRY_ATTEMPTS: 3,
  /** Délai de base pour le retry (en ms) */
  RETRY_BASE_DELAY_MS: 3000,
  /** Capacité maximale de l'historique des journaux de tâches */
  MAX_LOG_ENTRIES: 20,
};

export interface WorkTaskLog {
  id: string;
  timestamp: number;
  drawName: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  message: string;
  count?: number;
}

export interface WorkManagerStatus {
  isInitialized: boolean;
  isRunning: boolean;
  isOnline: boolean;
  lastSyncTimestamp: number | null;
  nextScheduledTimestamp: number | null;
  totalSyncCount: number;
  activeDrawName: string;
  logs: WorkTaskLog[];
  lastError: string | null;
}

type WorkManagerListener = (status: WorkManagerStatus) => void;

/**
 * WorkManager : Gestionnaire de tâches planifiées en arrière-plan.
 * Orchestre la mise à jour automatique et continue des résultats de tirages
 * dès que l'appareil est connecté à Internet.
 */
class WorkManagerService {
  private isInitialized = false;
  private isRunning = false;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private lastSyncTimestamp: number | null = null;
  private nextScheduledTimestamp: number | null = null;
  private totalSyncCount = 0;
  private logs: WorkTaskLog[] = [];
  private lastError: string | null = null;

  private intervalTimer: NodeJS.Timeout | null = null;
  private listeners: Set<WorkManagerListener> = new Set();

  /**
   * Initialise le WorkManager, attache les écouteurs de réseau (online/offline)
   * et démarre le temporisateur d'arrière-plan.
   */
  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;

      window.addEventListener('online', this.handleOnlineEvent);
      window.addEventListener('offline', this.handleOfflineEvent);
      
      // Écoute aussi la visibilité de la page pour rafraîchir discrètement au retour sur l'application
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.scheduleNextRun(WORK_MANAGER_CONSTANTS.DEFAULT_SYNC_INTERVAL_MS);

    // Lancer une première vérification si nous sommes en ligne
    if (this.isOnline) {
      this.scheduleDrawsSyncWork({ force: false, triggerSource: 'INITIALIZATION' });
    }

    console.info("⚡ [WorkManager] Initialisé avec succès. Tâches d'arrière-plan prêtes.");
    this.notifyListeners();
  }

  /**
   * Désactive le WorkManager et nettoie les temporisateurs.
   */
  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnlineEvent);
      window.removeEventListener('offline', this.handleOfflineEvent);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.isInitialized = false;
    this.isRunning = false;
    this.notifyListeners();
  }

  /**
   * Planifie ou exécute immédiatement le travail de mise à jour des résultats de tirage.
   */
  public async scheduleDrawsSyncWork(options: {
    force?: boolean;
    drawNames?: string[];
    triggerSource?: string;
  } = {}): Promise<boolean> {
    const { force = false, drawNames, triggerSource = 'SCHEDULED' } = options;

    if (!this.isOnline) {
      this.logTask({
        id: `wm_${Date.now()}`,
        timestamp: Date.now(),
        drawName: drawNames ? drawNames.join(', ') : 'TOUS',
        status: 'SKIPPED',
        message: `Vérification ignorée (Appareil hors-ligne). Source: ${triggerSource}`,
      });
      return false;
    }

    const now = Date.now();
    if (!force && this.lastSyncTimestamp && (now - this.lastSyncTimestamp < WORK_MANAGER_CONSTANTS.MIN_COOLDOWN_MS)) {
      console.log(`[WorkManager] Période de refroidissement active (${Math.round((WORK_MANAGER_CONSTANTS.MIN_COOLDOWN_MS - (now - this.lastSyncTimestamp)) / 1000)}s restantes). Ignoré.`);
      return false;
    }

    if (this.isRunning) {
      console.log('[WorkManager] Une tâche de mise à jour est déjà en cours d\'exécution.');
      return false;
    }

    this.isRunning = true;
    this.lastError = null;
    this.notifyListeners();

    try {
      // Obtenir la liste des tirages à synchroniser (tirage actif + liste des tirages officiels)
      const activeDraw = useNexusStore.getState().drawName || 'Loto 5/90';
      const targets = drawNames && drawNames.length > 0
        ? Array.from(new Set(drawNames))
        : Array.from(new Set([activeDraw, ...ALL_DRAWS.map(d => d.name)]));

      console.log(`⚡ [WorkManager] Exécution du travail d'arrière-plan pour ${targets.length} tirage(s)... Source: ${triggerSource}`);

      let updatedCount = 0;

      // Exécution séquentielle isolée par tirage (TIRAGE ISOLATION RULE)
      for (const drawName of targets) {
        try {
          const results = await this.executeSyncWithRetry(drawName);
          if (results && results.length > 0) {
            updatedCount++;
            
            // Si le tirage est le tirage actuellement ouvert par l'utilisateur, rafraîchir le store Zustand
            if (drawName === activeDraw) {
              await useNexusStore.getState().refreshData(drawName, true);
            }
            
            // Synchroniser les prédictions et snapshots pour ce tirage
            await syncAllHistory(drawName).catch(err => {
              console.warn(`[WorkManager] Synchro prédictions pour ${drawName}:`, err);
            });
          }
        } catch (err) {
          console.warn(`[WorkManager] Échec pour le tirage ${drawName}:`, err);
        }
      }

      this.lastSyncTimestamp = Date.now();
      this.totalSyncCount++;

      this.logTask({
        id: `wm_${Date.now()}`,
        timestamp: this.lastSyncTimestamp,
        drawName: activeDraw,
        status: 'SUCCESS',
        message: `Mise à jour d'arrière-plan terminée avec succès pour ${targets.length} tirages. (${triggerSource})`,
        count: updatedCount,
      });

      // Émettre un événement global pour notifier les composants UI
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('WORKMANAGER_SYNC_COMPLETED', {
          detail: { timestamp: this.lastSyncTimestamp, updatedCount, triggerSource }
        }));
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', {
          detail: { drawName: activeDraw }
        }));
      }

      return true;

    } catch (error: any) {
      const errMsg = error?.message || String(error);
      this.lastError = errMsg;
      logError(new AppError(errMsg, 'WORK_MANAGER_SYNC_ERROR', 'low'), { source: 'WorkManager' });

      this.logTask({
        id: `wm_${Date.now()}`,
        timestamp: Date.now(),
        drawName: 'GLOBAL',
        status: 'FAILED',
        message: `Erreur WorkManager: ${errMsg}`,
      });

      return false;

    } finally {
      this.isRunning = false;
      this.scheduleNextRun(WORK_MANAGER_CONSTANTS.DEFAULT_SYNC_INTERVAL_MS);
      this.notifyListeners();
    }
  }

  /**
   * Exécute la récupération des résultats avec retries déterministes.
   */
  private async executeSyncWithRetry(drawName: string, attempt = 1): Promise<any[]> {
    try {
      return await lotteryService.fetchHistory(drawName, true);
    } catch (err) {
      if (attempt < WORK_MANAGER_CONSTANTS.MAX_RETRY_ATTEMPTS && this.isOnline) {
        // Backoff déterministe (sans Math.random)
        const delay = WORK_MANAGER_CONSTANTS.RETRY_BASE_DELAY_MS * attempt;
        await new Promise(res => setTimeout(res, delay));
        return this.executeSyncWithRetry(drawName, attempt + 1);
      }
      throw err;
    }
  }

  /**
   * Planifie le prochain déclenchement
   */
  private scheduleNextRun(delayMs: number): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }

    this.nextScheduledTimestamp = Date.now() + delayMs;

    this.intervalTimer = setInterval(() => {
      if (this.isOnline) {
        this.scheduleDrawsSyncWork({ force: false, triggerSource: 'PERIODIC_TIMER' });
      }
    }, delayMs);
  }

  /**
   * Gestionnaire d'événement Réseau Connecté (online)
   */
  private handleOnlineEvent = (): void => {
    console.info('🌐 [WorkManager] Connexion Internet rétablie. Lancement automatique du WorkManager...');
    this.isOnline = true;
    this.notifyListeners();

    // Déclenchement automatique immédiat dès la reconnexion Internet
    this.scheduleDrawsSyncWork({ force: true, triggerSource: 'NETWORK_RECONNECTED' });
  };

  /**
   * Gestionnaire d'événement Réseau Déconnecté (offline)
   */
  private handleOfflineEvent = (): void => {
    console.warn('📶 [WorkManager] Connexion Internet perdue. Mode hors-ligne activé.');
    this.isOnline = false;
    this.notifyListeners();
  };

  /**
   * Gestionnaire de retour de visibilité de l'application
   */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.isOnline) {
      this.scheduleDrawsSyncWork({ force: false, triggerSource: 'APP_VISIBILITY' });
    }
  };

  /**
   * Enregistre une entrée dans le journal des tâches
   */
  private logTask(log: WorkTaskLog): void {
    this.logs.unshift(log);
    if (this.logs.length > WORK_MANAGER_CONSTANTS.MAX_LOG_ENTRIES) {
      this.logs.pop();
    }
  }

  /**
   * Retourne l'état actuel du WorkManager
   */
  public getStatus(): WorkManagerStatus {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      isOnline: this.isOnline,
      lastSyncTimestamp: this.lastSyncTimestamp,
      nextScheduledTimestamp: this.nextScheduledTimestamp,
      totalSyncCount: this.totalSyncCount,
      activeDrawName: useNexusStore.getState().drawName || 'Loto 5/90',
      logs: [...this.logs],
      lastError: this.lastError,
    };
  }

  /**
   * Permet aux composants React de s'abonner aux changements d'état du WorkManager
   */
  public subscribe(listener: WorkManagerListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (err) {
        console.error('[WorkManager] Listener error:', err);
      }
    });
  }
}

export const workManager = new WorkManagerService();
