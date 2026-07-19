
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import LZString from 'lz-string';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prioritize fresh data as requested
      staleTime: 1000 * 30, // Data fresh for 30 seconds only
      gcTime: 1000 * 60 * 60 * 24 * 7, // Keep in local memory for 7 days
      
      refetchOnWindowFocus: true, 
      refetchOnMount: true,
      refetchOnReconnect: true, // Re-try sync when regaining network
      
      retry: (failureCount, error: Error | unknown) => {
        // Ne pas réessayer si 404
        const errWithStatus = error as { status?: number } | null | undefined;
        if (errWithStatus?.status === 404) return false;
        return failureCount < 3;
      },
      
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Backoff exponentiel
    },
    mutations: {
        retry: 1, 
    }
  },
});

// Création d'un stockage ultra-sécurisé avec repli mémoire si IndexedDB est bloqué (ex: iframe sandbox)
const memoryStorageMap = new Map<string, string>();

export const idbPersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => {
      try {
        const val = await get(key);
        return val !== undefined ? val : memoryStorageMap.get(key);
      } catch (e) {
        console.warn("IndexedDB getItem bloqué par l'environnement, repli mémoire:", e);
        return memoryStorageMap.get(key);
      }
    },
    setItem: async (key, value) => {
      try {
        await set(key, value);
      } catch (e) {
        console.warn("IndexedDB setItem bloqué par l'environnement, repli mémoire:", e);
        memoryStorageMap.set(key, value);
      }
    },
    removeItem: async (key) => {
      try {
        await del(key);
      } catch (e) {
        console.warn("IndexedDB removeItem bloqué par l'environnement, repli mémoire:", e);
        memoryStorageMap.delete(key);
      }
    },
  },
  // Utilisation de LZ-String (compression LZ4-like) pour économiser l'espace disque
  serialize: (data) => LZString.compressToUTF16(JSON.stringify(data)),
  deserialize: (data) => {
    try {
      if (typeof data !== 'string') return data;
      const decompressed = LZString.decompressFromUTF16(data);
      if (decompressed) return JSON.parse(decompressed);
      return JSON.parse(data); // Fallback si non compressé
    } catch (e) {
      console.warn("Erreur de décompression IndexedDB", e);
      return data;
    }
  },
});
