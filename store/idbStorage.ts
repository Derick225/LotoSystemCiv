import { StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import LZString from 'lz-string';

// --- Advanced Structural Compression ---
// Converts large array of objects into arrays of arrays to save structural JSON overhead.
const compressStructure = (stateString: string): string => {
  try {
    const state = JSON.parse(stateString);
    if (state && state.state) {
      if (Array.isArray(state.state.history)) {
        state.state.history = state.state.history.map((h: any) => [
          h.id, h.drawName, h.date, h.gagnants, h.machine || []
        ]);
        state.state._isStructurallyCompressed = true;
      }
      if (Array.isArray(state.state.stats)) {
          state.state.stats = state.state.stats.map((s: any) => [s.number, s.count]);
      }
      if (Array.isArray(state.state.gaps)) {
          state.state.gaps = state.state.gaps.map((g: any) => [g.number, g.gap]);
      }
    }
    return JSON.stringify(state);
  } catch (e) {
    return stateString;
  }
};

const decompressStructure = (stateString: string): string => {
  try {
    const state = JSON.parse(stateString);
    if (state && state.state && state.state._isStructurallyCompressed) {
      if (Array.isArray(state.state.history)) {
        state.state.history = state.state.history.map((h: any) => ({
          id: h[0], drawName: h[1], date: h[2], gagnants: h[3], machine: h[4]?.length ? h[4] : undefined
        }));
      }
      if (Array.isArray(state.state.stats)) {
          state.state.stats = state.state.stats.map((s: any) => ({ number: s[0], count: s[1] }));
      }
      if (Array.isArray(state.state.gaps)) {
          state.state.gaps = state.state.gaps.map((g: any) => ({ number: g[0], gap: g[1] }));
      }
      delete state.state._isStructurallyCompressed;
    }
    return JSON.stringify(state);
  } catch (e) {
    return stateString;
  }
};
// ---------------------------------------

export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const data = await get(name);
    if (!data) return null;
    try {
      const decompressed = LZString.decompressFromUTF16(data);
      if (decompressed) return decompressStructure(decompressed);
      return decompressStructure(data); // Fallback
    } catch {
      return data;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const structurallyCompressed = compressStructure(value);
    const compressed = LZString.compressToUTF16(structurallyCompressed);
    await set(name, compressed);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('PREFERENCES_TRIGGER_SYNC'));
    }
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};
