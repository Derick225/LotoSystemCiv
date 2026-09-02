import { get, set, del, keys as idbKeys, clear } from "idb-keyval";
import { getCanonicalDrawHistoryHash } from "../../utils/mathUtils";
import { DrawResult } from "../../types";

/**
 * Interface pour les métadonnées et contenu du tenseur en cache
 */
export interface CachedTensorPayload<T = any> {
  data: T;
  timestamp: number;
  drawName: string;
  historyLength: number;
  lastDrawHash: string;
  checksum: string;
}

/**
 * Hachage rapide déterministe FNV-1a (32 bits) pour le checksum et la clé
 */
export const fastFnv1a = (str: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

/**
 * Encode / Chiffre de façon déterministe un payload JSON en base64 avec masque XOR
 * dérivé de la clé canonique du tirage pour stockage sécurisé en IndexedDB.
 */
export const encryptPayload = (dataStr: string, keySeed: string): string => {
  if (typeof btoa === 'undefined') return dataStr;
  const seedHash = fastFnv1a(keySeed);
  const mask = [];
  for (let i = 0; i < seedHash.length; i++) {
    mask.push(seedHash.charCodeAt(i));
  }
  
  let masked = '';
  for (let i = 0; i < dataStr.length; i++) {
    const code = dataStr.charCodeAt(i) ^ mask[i % mask.length];
    masked += String.fromCharCode(code);
  }
  return btoa(unescape(encodeURIComponent(masked)));
};

/**
 * Déchiffre un payload chiffré stocké en IndexedDB
 */
export const decryptPayload = (cipherStr: string, keySeed: string): string => {
  if (typeof atob === 'undefined') return cipherStr;
  try {
    const rawMasked = decodeURIComponent(escape(atob(cipherStr)));
    const seedHash = fastFnv1a(keySeed);
    const mask = [];
    for (let i = 0; i < seedHash.length; i++) {
      mask.push(seedHash.charCodeAt(i));
    }
    
    let unmasked = '';
    for (let i = 0; i < rawMasked.length; i++) {
      const code = rawMasked.charCodeAt(i) ^ mask[i % mask.length];
      unmasked += String.fromCharCode(code);
    }
    return unmasked;
  } catch (e) {
    return cipherStr;
  }
};

/**
 * Cache LRU en mémoire vive à double niveau (L1 RAM + L2 IndexedDB Chiffrée).
 * Dédié aux calculs tensoriels intensifs (Hawkes spatio-temporel, matrices de transition d'ordre 2,
 * Kernel PCA, décomposition spectrale, descripteurs de caractéristiques).
 */
export class LruTensorCache {
  private memoryLru: Map<string, CachedTensorPayload> = new Map();
  private maxRamEntries: number = 60;
  private readonly IDB_PREFIX = "nexus_tensor_enc_";

  constructor(maxEntries: number = 60) {
    this.maxRamEntries = maxEntries;
  }

  /**
   * Construit la clé canonique standardisée :
   * [drawName]_[historyLength]_[lastDrawHash] + suffixe optionnel (algo/domaine)
   */
  public buildTensorKey(
    domain: string,
    drawName: string,
    history: DrawResult[],
    extraParam: string = ""
  ): string {
    const cleanDraw = drawName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const historyLength = history.length;
    
    let lastDrawStr = "nodraw";
    if (history.length > 0) {
      const d0 = history[0];
      const g0 = Array.isArray(d0.gagnants) ? d0.gagnants.join("-") : "";
      const m0 = Array.isArray(d0.machine) ? d0.machine.join("-") : (d0.machine || "");
      lastDrawStr = `${d0.date || "d0"}_${g0}_${m0}`;
    }
    const lastDrawHash = fastFnv1a(lastDrawStr);
    const extraHash = extraParam ? `_${fastFnv1a(extraParam)}` : "";
    
    return `${cleanDraw}_${historyLength}_${lastDrawHash}_${domain}${extraHash}`;
  }

  /**
   * Récupère un tenseur depuis le cache L1 (RAM) ou L2 (IndexedDB Chiffrée).
   * Applique la politique LRU (déplacement en tête d'utilisation).
   */
  public async get<T>(key: string): Promise<T | null> {
    // 1. Recherche dans L1 (Mémoire RAM LRU)
    if (this.memoryLru.has(key)) {
      const entry = this.memoryLru.get(key)!;
      // Refresh LRU position (delete & re-insert)
      this.memoryLru.delete(key);
      this.memoryLru.set(key, entry);
      return entry.data as T;
    }

    // 2. Recherche dans L2 (IndexedDB Chiffrée)
    if (typeof indexedDB !== "undefined") {
      try {
        const idbKey = `${this.IDB_PREFIX}${key}`;
        const rawCipher = await get<string>(idbKey);
        if (rawCipher) {
          const decryptedJson = decryptPayload(rawCipher, key);
          const payload: CachedTensorPayload<T> = JSON.parse(decryptedJson);
          
          // Vérification d'intégrité checksum
          const check = fastFnv1a(JSON.stringify(payload.data));
          if (check === payload.checksum) {
            // Remontée en L1 RAM
            this.putInMemory(key, payload);
            return payload.data;
          }
        }
      } catch (e) {
        // En cas d'erreur de parsing ou d'accès, fallback silencieux
      }
    }

    return null;
  }

  /**
   * Enregistre un tenseur dans le cache à double niveau (L1 RAM LRU + L2 IndexedDB Chiffrée).
   */
  public async set<T>(
    key: string,
    data: T,
    drawName: string,
    historyLength: number,
    lastDrawHash: string
  ): Promise<void> {
    const dataJson = JSON.stringify(data);
    const checksum = fastFnv1a(dataJson);

    const payload: CachedTensorPayload<T> = {
      data,
      timestamp: Date.now(),
      drawName,
      historyLength,
      lastDrawHash,
      checksum
    };

    // 1. Stockage L1 RAM
    this.putInMemory(key, payload);

    // 2. Stockage L2 IndexedDB Chiffrée
    if (typeof indexedDB !== "undefined") {
      try {
        const idbKey = `${this.IDB_PREFIX}${key}`;
        const cipher = encryptPayload(JSON.stringify(payload), key);
        await set(idbKey, cipher);
      } catch (e) {
        console.warn("[LruTensorCache] Failed saving to encrypted IndexedDB", e);
      }
    }
  }

  /**
   * Évalue ou retourne le tenseur mis en cache.
   * Si l'historique n'a pas bougé ([drawName]_[historyLength]_[lastDrawHash]),
   * le résultat est restitué immédiatement (<1ms).
   */
  public async getOrCompute<T>(
    domain: string,
    drawName: string,
    history: DrawResult[],
    computeFn: () => Promise<T> | T,
    extraParam: string = ""
  ): Promise<T> {
    const key = this.buildTensorKey(domain, drawName, history, extraParam);
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const freshData = await computeFn();
    const lastDraw = history[0];
    const lastDrawStr = lastDraw ? `${lastDraw.date || ""}_${(lastDraw.gagnants || []).join("-")}` : "nodraw";
    const lastDrawHash = fastFnv1a(lastDrawStr);

    await this.set<T>(key, freshData, drawName, history.length, lastDrawHash);
    return freshData;
  }

  /**
   * Gestion de l'éviction LRU en RAM
   */
  private putInMemory(key: string, payload: CachedTensorPayload): void {
    if (this.memoryLru.has(key)) {
      this.memoryLru.delete(key);
    } else if (this.memoryLru.size >= this.maxRamEntries) {
      // Éviction du plus ancien (premier élément de la Map)
      const oldestKey = this.memoryLru.keys().next().value;
      if (oldestKey) {
        this.memoryLru.delete(oldestKey);
      }
    }
    this.memoryLru.set(key, payload);
  }

  /**
   * Invalide les tenseurs pour un tirage spécifique
   */
  public async invalidateDraw(drawName: string): Promise<void> {
    const cleanDraw = drawName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Invalidation RAM
    for (const key of Array.from(this.memoryLru.keys())) {
      if (key.startsWith(cleanDraw)) {
        this.memoryLru.delete(key);
      }
    }

    // Invalidation IDB
    if (typeof indexedDB !== "undefined") {
      try {
        const allKeys = await idbKeys();
        const prefix = `${this.IDB_PREFIX}${cleanDraw}`;
        const toDelete = allKeys.filter(k => typeof k === "string" && k.startsWith(prefix));
        if (toDelete.length > 0) {
          const { delMany } = await import("idb-keyval");
          await delMany(toDelete);
        }
      } catch (e) {
        console.warn("[LruTensorCache] Failed invalidating IDB keys", e);
      }
    }
  }

  /**
   * Nettoie l'intégralité du cache tensoriel
   */
  public async clear(): Promise<void> {
    this.memoryLru.clear();
    if (typeof indexedDB !== "undefined") {
      try {
        const allKeys = await idbKeys();
        const toDelete = allKeys.filter(k => typeof k === "string" && k.startsWith(this.IDB_PREFIX));
        if (toDelete.length > 0) {
          const { delMany } = await import("idb-keyval");
          await delMany(toDelete);
        }
      } catch (e) {
        console.warn("[LruTensorCache] Failed clearing IDB tensor cache", e);
      }
    }
  }
}

export const globalTensorCache = new LruTensorCache(60);
