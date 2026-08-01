import { get, set, del, keys as idbKeys, clear } from "idb-keyval";
import { getCanonicalDrawHistoryHash } from "../../utils/mathUtils";

/**
 * Configuration centralisée des durées de vie du cache (TTL) par domaine métier.
 */
export const CACHE_CONFIG = {
  SHORT_TTL: 5 * 60 * 1000,        // 5 minutes : données volatiles temps réel (pings, états actifs)
  MEDIUM_TTL: 60 * 60 * 1000,      // 1 heure : statistiques et scores intermédiaires calculés
  LONG_TTL: 24 * 60 * 60 * 1000,   // 24 heures : poids d'algorithmes et configurations globales stables
  HISTORY_TTL: 24 * 60 * 60 * 1000, // 24 heures : historiques officiels de tirages (stables hors ligne)
};

/**
 * Maintien de l'objet historique CACHE_TTL pour la compatibilité descendante avec l'ensemble du projet.
 */
export const CACHE_TTL = {
  SHORT: CACHE_CONFIG.SHORT_TTL,
  MEDIUM: CACHE_CONFIG.MEDIUM_TTL,
  LONG: CACHE_CONFIG.LONG_TTL,
  HISTORY: CACHE_CONFIG.HISTORY_TTL,
};

/**
 * Retourne dynamiquement la durée de vie (TTL) cohérente basée sur le domaine d'application.
 * JSDOC: La centralisation de la résolution des TTL par domaine garantit une cohérence absolue
 * de l'état du cache et évite les instanciations de durées de vie arbitraires et dispersées.
 */
export const getTTL = (domain: string): number => {
  switch (domain.toLowerCase()) {
    case 'history':
    case 'tirages':
    case 'draws':
      return CACHE_CONFIG.HISTORY_TTL;
    case 'predictions':
    case 'forensic':
    case 'stats':
    case 'metrics':
      return CACHE_CONFIG.MEDIUM_TTL;
    case 'concepts':
    case 'weights':
    case 'config':
      return CACHE_CONFIG.LONG_TTL;
    default:
      return CACHE_CONFIG.SHORT_TTL;
  }
};

/**
 * Calcule dynamiquement la limite de taille du cache en mémoire
 * basée sur la mémoire physique déclarée de l'appareil via navigator.deviceMemory.
 * JSDOC: Utilise une formule logarithmique continue f(m) = round(Base * ln(m + 1)) pour garantir une dégradation
 * douce et sécurisée de l'empreinte mémoire sur les terminaux mobiles de faibles ressources.
 */
export const getDynamicMemoryCacheLimit = (): number => {
  const BASE_LIMIT = 50; // Capacité minimale absolue de protection
  if (typeof navigator === 'undefined' || !('deviceMemory' in navigator)) {
    return BASE_LIMIT * 3; // Environ 150 entrées sur desktop sans API deviceMemory
  }
  const memoryGb = (navigator as any).deviceMemory || 4.0;
  // Calcul logarithmique continu : pour 1GB -> ~69, 2GB -> ~109, 4GB -> ~160, 8GB -> ~219 entrées
  return Math.round(BASE_LIMIT * Math.log(memoryGb + 1.0)) + BASE_LIMIT;
};

export interface CacheEntry<T> {
  data: T;
  expiry: number;
  hash?: string; // Sceau d'intégrité ou version
  drawCountRef?: number; // Permet l'invalidation automatique lors de l'arrivée de nouveaux tirages
}

export const CACHE_FLAGS = {
  ENABLE_MEMORY: true,
  ENABLE_IDB: typeof indexedDB !== 'undefined',
  ENABLE_SUPABASE: false, // Cache partagé désactivé par défaut
};

class CacheService {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private recentDrawCounts: Map<string, number> = new Map();

  /**
   * Génère une clé de cache déterministe et structurée.
   */
  public generateKey(
    domain: string,
    identifier: string,
    subKey?: string,
  ): string {
    return `nexus_${domain}_${identifier}${subKey ? `_${subKey}` : ""}`;
  }

  /**
   * Génère une clé de cache déterministe isolée par la signature canonique de l'historique propre du tirage.
   * Empêche toute pollution ou croisement de données inter-tirages.
   */
  public generateCanonicalDrawKey(
    domain: string,
    drawName: string,
    history: { date?: string; gagnants?: number[] }[],
    subKey?: string,
  ): string {
    const canonicalHash = getCanonicalDrawHistoryHash(drawName, history);
    return `nexus_${domain}_${canonicalHash}${subKey ? `_${subKey}` : ""}`;
  }

  /**
   * Enregistre un élément dans le cache à double niveau (Mémoire + IDB).
   */
  public async set<T>(
    key: string,
    data: T,
    ttlMs: number,
    drawName?: string,
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      expiry: Date.now() + ttlMs,
    };

    if (drawName && this.recentDrawCounts.has(drawName)) {
      entry.drawCountRef = this.recentDrawCounts.get(drawName);
    }

    if (CACHE_FLAGS.ENABLE_MEMORY) {
      const dynamicLimit = getDynamicMemoryCacheLimit();
      if (this.memoryCache.size >= dynamicLimit) {
        const oldestKey = this.memoryCache.keys().next().value;
        if (oldestKey) {
          this.memoryCache.delete(oldestKey);
        }
      }
      this.memoryCache.set(key, entry);
    }

    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        await set(key, entry);
      } catch (e) {
        console.warn(`[CacheService] Failed to set IDB key ${key}`, e);
      }
    }
  }

  /**
   * Récupère un élément depuis les caches hiérarchisés.
   */
  public async get<T>(key: string, drawName?: string): Promise<T | null> {
    // 1. Cache en mémoire vive (L1)
    if (CACHE_FLAGS.ENABLE_MEMORY && this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key)!;
      if (this.isValid(entry, drawName)) {
        return entry.data as T;
      } else {
        this.memoryCache.delete(key);
      }
    }

    // 2. Cache IndexedDB (L2)
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        const idbEntry = await get<CacheEntry<T>>(key);
        if (idbEntry && this.isValid(idbEntry, drawName)) {
          // Remonter l'élément dans le cache L1 pour les accès futurs rapides
          if (CACHE_FLAGS.ENABLE_MEMORY) this.memoryCache.set(key, idbEntry);
          return idbEntry.data;
        } else if (idbEntry) {
          await del(key);
        }
      } catch (e) {
        console.warn(`[CacheService] Failed to fetch IDB key ${key}`, e);
      }
    }

    return null;
  }

  /**
   * Invalide les caches d'un domaine ou d'un préfixe particulier.
   */
  public async invalidateByPrefix(prefix: string): Promise<void> {
    // Invalidation mémoire
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // Invalidation IndexedDB
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        const allKeys = await idbKeys();
        const keysToDelete = allKeys.filter(
          (k) => typeof k === "string" && k.startsWith(prefix),
        ) as string[];
        
        if (keysToDelete.length > 0) {
            import('idb-keyval').then(({ delMany }) => {
                delMany(keysToDelete).catch(e => console.warn(e));
            });
        }
      } catch (e) {
        console.warn(
          `[CacheService] Prefix invalidation failed for ${prefix}`,
          e,
        );
      }
    }
  }

  /**
   * Enregistre l'arrivée d'un nouveau tirage pour invalider à la volée le cache dépendant.
   */
  public async registerNewDraw(
    drawName: string,
    newTotalCount: number,
  ): Promise<void> {
    const oldCount = this.recentDrawCounts.get(drawName) || 0;
    if (newTotalCount > oldCount) {
      this.recentDrawCounts.set(drawName, newTotalCount);
      console.log(
        `[CacheService] New draw registered for ${drawName} (Count: ${newTotalCount}). Dependent caches will auto-invalidate on access.`
      );
    }
  }

  /**
   * Encapsule le calcul d'une fonction avec mise en cache transparente.
   */
  public async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T> | T,
    ttlMs: number = CACHE_TTL.MEDIUM,
    drawName?: string,
  ): Promise<T> {
    const cached = await this.get<T>(key, drawName);
    if (cached !== null) return cached;

    const freshData = await computeFn();
    await this.set(key, freshData, ttlMs, drawName);
    return freshData;
  }

  /**
   * Analyse de validité (Périssabilité temporelle et cohérence du nombre de tirages)
   */
  private isValid(entry: CacheEntry<any>, drawName?: string): boolean {
    if (Date.now() > entry.expiry) return false;

    if (drawName && entry.drawCountRef !== undefined) {
      const currentCount = this.recentDrawCounts.get(drawName);
      if (currentCount !== undefined && entry.drawCountRef < currentCount) {
        return false; // Donnée obsolète car un nouveau tirage a été enregistré
      }
    }
    return true;
  }

  public async clearAll(): Promise<void> {
    this.memoryCache.clear();
    if (CACHE_FLAGS.ENABLE_IDB) {
      await clear();
    }
  }

  public async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        await del(key);
      } catch (e) {
        console.warn(`[CacheService] Failed to delete IDB key ${key}`, e);
      }
    }
  }

  /**
   * Collecteur de déchets du cache (Garbage Collection)
   */
  public async runGarbageCollection(): Promise<number> {
    let clearedCount = 0;

    // 1. Nettoyage mémoire
    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isValid(entry)) {
        this.memoryCache.delete(key);
        clearedCount++;
      }
    }

    // 2. Nettoyage IndexedDB
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        const allKeys = await idbKeys();
        const stringKeys = allKeys.filter(k => typeof k === 'string') as string[];
        
        if (stringKeys.length > 0) {
            const { getMany, delMany } = await import('idb-keyval');
            const values = await getMany(stringKeys);
            const keysToDelete: string[] = [];
            
            for (let i = 0; i < values.length; i++) {
                const entry = values[i];
                if (entry && !this.isValid(entry as CacheEntry<any>)) {
                    keysToDelete.push(stringKeys[i]);
                }
            }
            
            if (keysToDelete.length > 0) {
                await delMany(keysToDelete);
                clearedCount += keysToDelete.length;
            }
        }
      } catch (e) {
        console.warn("[CacheService] GC Error on IDB:", e);
      }
    }

    console.log(
      `[CacheService] Garbage Collection complete. Cleared ${clearedCount} stale entries.`,
    );
    return clearedCount;
  }

  /**
   * Permet la récupération groupée par domaine (comportement de table relationnelle locale)
   */
  public async getByDomain<T>(domain: string): Promise<T[]> {
    const prefix = `nexus_${domain}_`;
    const results: T[] = [];

    // Récupération mémoire L1
    for (const [key, entry] of this.memoryCache.entries()) {
      if (key.startsWith(prefix) && this.isValid(entry)) {
        results.push(entry.data as T);
      } else if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // Récupération IndexedDB L2 pour les clés non résidentes en mémoire vive
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        const allKeys = await idbKeys();
        const domainKeys = allKeys.filter(
          (k) => typeof k === "string" && k.startsWith(prefix),
        ) as string[];

        const keysToFetch = domainKeys.filter(k => !this.memoryCache.has(k));
        if (keysToFetch.length > 0) {
            const { getMany, delMany } = await import('idb-keyval');
            const values = await getMany(keysToFetch);
            const keysToDelete: string[] = [];
            
            for (let i = 0; i < values.length; i++) {
                const entry = values[i] as CacheEntry<T> | undefined;
                if (entry && this.isValid(entry)) {
                    if (CACHE_FLAGS.ENABLE_MEMORY) this.memoryCache.set(keysToFetch[i], entry);
                    results.push(entry.data);
                } else if (entry) {
                    keysToDelete.push(keysToFetch[i]);
                }
            }
            if (keysToDelete.length > 0) {
                await delMany(keysToDelete);
            }
        }
      } catch (e) {
        console.warn(
          `[CacheService] Failed retrieving domain ${domain} from IDB`,
          e,
        );
      }
    }
    return results;
  }
}

export const globalCache = new CacheService();
