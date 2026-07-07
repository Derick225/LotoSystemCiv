import { get, set, del, keys as idbKeys, clear } from "idb-keyval";
import { isSupabaseConfigured } from "../supabaseClient";

export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000, // 5 minutes
  MEDIUM: 60 * 60 * 1000, // 1 hour
  LONG: 24 * 60 * 60 * 1000, // 24 hours
  HISTORY: 24 * 60 * 60 * 1000, // 24 hours (Ensures offline mode works. Network fetch is prioritized in lotteryService and React Query staleTime is 0)
};

export interface CacheEntry<T> {
  data: T;
  expiry: number;
  hash?: string; // Optional integrity hash or version
  drawCountRef?: number; // Helps invalidating automatically when new draws arrive
}

export const CACHE_FLAGS = {
  ENABLE_MEMORY: true,
  ENABLE_IDB: true,
  ENABLE_SUPABASE: false, // Feature flag for shared cache on Supabase. Keep disabled by default unless needed.
};

class CacheService {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private recentDrawCounts: Map<string, number> = new Map();

  /**
   * Generates a deterministic cache key.
   */
  public generateKey(
    domain: string,
    identifier: string,
    subKey?: string,
  ): string {
    return `nexus_${domain}_${identifier}${subKey ? `_${subKey}` : ""}`;
  }

  /**
   * Warms up memory cache with a specific dataset.
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
      if (this.memoryCache.size >= 150) {
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
   * Retrieves data from Cache (Memory -> IDB -> Supabase)
   */
  public async get<T>(key: string, drawName?: string): Promise<T | null> {
    // 1. Memory Cache
    if (CACHE_FLAGS.ENABLE_MEMORY && this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key)!;
      if (this.isValid(entry, drawName)) {
        return entry.data as T;
      } else {
        this.memoryCache.delete(key);
      }
    }

    // 2. IndexedDB Cache
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        const idbEntry = await get<CacheEntry<T>>(key);
        if (idbEntry && this.isValid(idbEntry, drawName)) {
          // Promote back to memory
          if (CACHE_FLAGS.ENABLE_MEMORY) this.memoryCache.set(key, idbEntry);
          return idbEntry.data;
        } else if (idbEntry) {
          await del(key);
        }
      } catch (e) {
        console.warn(`[CacheService] Failed to fetch IDB key ${key}`, e);
      }
    }

    // 3. (Optional) Supabase Remote Cache. Implemented conditionally
    if (CACHE_FLAGS.ENABLE_SUPABASE && isSupabaseConfigured()) {
      // Could fetch from a 'system_cache' table if needed
    }

    return null;
  }

  /**
   * Cleans specific domain or all caches.
   */
  public async invalidateByPrefix(prefix: string): Promise<void> {
    // Memory
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // IndexedDB
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        const allKeys = await idbKeys();
        const keysToDelete = allKeys.filter(
          (k) => typeof k === "string" && k.startsWith(prefix),
        ) as string[];
        await Promise.all(keysToDelete.map((k) => del(k)));
      } catch (e) {
        console.warn(
          `[CacheService] Prefix invalidation failed for ${prefix}`,
          e,
        );
      }
    }
  }

  /**
   * Inform CacheService that a new draw arrived.
   * Invalidates caches tied to an older draw count.
   */
  public async registerNewDraw(
    drawName: string,
    newTotalCount: number,
  ): Promise<void> {
    const oldCount = this.recentDrawCounts.get(drawName) || 0;
    if (newTotalCount > oldCount) {
      this.recentDrawCounts.set(drawName, newTotalCount);
      console.log(
        `[CacheService] New draw registered for ${drawName} (Count: ${newTotalCount}). Invalidating dependent caches...`,
      );
      // We could actively delete OR simply let get() reject stale drawCountRef.
      // Lazy invalidation is achieved via isValid(). We optionally purge IDB for space.
    }
  }

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
   * Validation logic (TTL + Draw Count Sync)
   */
  private isValid(entry: CacheEntry<any>, drawName?: string): boolean {
    if (Date.now() > entry.expiry) return false;

    if (drawName && entry.drawCountRef !== undefined) {
      const currentCount = this.recentDrawCounts.get(drawName);
      if (currentCount !== undefined && entry.drawCountRef < currentCount) {
        return false; // Stale data due to new draw
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

  public async runGarbageCollection(): Promise<number> {
    let clearedCount = 0;

    // 1. Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isValid(entry)) {
        this.memoryCache.delete(key);
        clearedCount++;
      }
    }

    // 2. Clean IDB
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        const allKeys = await idbKeys();
        for (const key of allKeys) {
          if (typeof key === "string") {
            const entry = await get<CacheEntry<any>>(key);
            if (entry && !this.isValid(entry)) {
              await del(key);
              clearedCount++;
            }
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
   * Enumerates keys by domain. Useful for datasets that behave like local tables (e.g., forensic reports).
   */
  public async getByDomain<T>(domain: string): Promise<T[]> {
    const prefix = `nexus_${domain}_`;
    const results: T[] = [];

    // Memory fetch
    for (const [key, entry] of this.memoryCache.entries()) {
      if (key.startsWith(prefix) && this.isValid(entry)) {
        results.push(entry.data as T);
      } else if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // IDB fetch for keys not in memory
    if (CACHE_FLAGS.ENABLE_IDB) {
      try {
        const allKeys = await idbKeys();
        const domainKeys = allKeys.filter(
          (k) => typeof k === "string" && k.startsWith(prefix),
        ) as string[];

        for (const key of domainKeys) {
          if (!this.memoryCache.has(key)) {
            const entry = await get<CacheEntry<T>>(key);
            if (entry && this.isValid(entry)) {
              if (CACHE_FLAGS.ENABLE_MEMORY) this.memoryCache.set(key, entry);
              results.push(entry.data);
            } else if (entry) {
              await del(key);
            }
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
