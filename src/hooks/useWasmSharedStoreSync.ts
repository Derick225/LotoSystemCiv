import { useState, useEffect, useCallback, useRef } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { syncHistoryToRustStore } from '../services/lotteryService';
import {
  getStoreTelemetry,
  isLotoEngineWasmReady,
  getHpcEngineMode,
  StoreTelemetry,
} from '../services/wasm/lotoEngineBridge';

export type SharedStoreSyncState = 'synced' | 'syncing' | 'fallback' | 'error';

export interface WasmSharedStoreSyncResult {
  syncState: SharedStoreSyncState;
  drawName: string;
  drawCount: number;
  isWasmNative: boolean;
  mode: 'RUST_WASM' | 'SIMD_FALLBACK';
  estimatedMemoryBytes: number;
  frequencyCheckSum: number;
  lastSyncTime: Date | null;
  syncLatencyMs: number;
  syncNow: () => void;
}

/**
 * Hook réactif de synchronisation de l'État Partagé (Shared State)
 * 
 * Assure la cohérence continue et zéro-copie entre :
 * 1. Le state store React / Zustand (historique, tirage actif, mutations)
 * 2. La mémoire linéaire continue du store natif Rust / WebAssembly
 * 
 * Notifie l'UI des performances mémoire et du statut de synchronisation en temps réel.
 */
export function useWasmSharedStoreSync(): WasmSharedStoreSyncResult {
  const history = useNexusStore((state) => state.history);
  const drawName = useNexusStore((state) => state.drawName || state.currentDrawName || 'GLOBAL');

  const [syncState, setSyncState] = useState<SharedStoreSyncState>('syncing');
  const [telemetry, setTelemetry] = useState<StoreTelemetry>(() => getStoreTelemetry(drawName));
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncLatencyMs, setSyncLatencyMs] = useState<number>(0);

  const prevFingerprintRef = useRef<string>('');

  const performSync = useCallback((force: boolean = false) => {
    if (!history || history.length === 0) {
      const currentTelem = getStoreTelemetry(drawName);
      setTelemetry(currentTelem);
      setSyncState(currentTelem.isWasmNative ? 'synced' : 'fallback');
      return;
    }

    const currentFingerprint = `${drawName}:${history.length}:${history[0]?.id || ''}:${history[0]?.date || ''}`;
    if (!force && prevFingerprintRef.current === currentFingerprint) {
      // Déjà synchronisé, rafraîchir uniquement les métriques sans coût d'injection
      const currentTelem = getStoreTelemetry(drawName);
      setTelemetry(currentTelem);
      setSyncState(currentTelem.isWasmNative ? 'synced' : 'fallback');
      return;
    }

    setSyncState('syncing');
    const t0 = performance.now();

    try {
      // Synchronisation zéro-copie avec le store natif Rust / WASM
      syncHistoryToRustStore(history, drawName);
      prevFingerprintRef.current = currentFingerprint;

      const latency = Math.max(0.01, parseFloat((performance.now() - t0).toFixed(2)));
      const telem = getStoreTelemetry(drawName);

      setTelemetry(telem);
      setSyncLatencyMs(latency);
      setLastSyncTime(new Date());
      setSyncState(telem.isWasmNative ? 'synced' : 'fallback');
    } catch (err) {
      console.error('[useWasmSharedStoreSync] Échec de synchronisation mémoire partagée :', err);
      setSyncState('error');
    }
  }, [history, drawName]);

  // Synchronisation réactive dès que history ou drawName change
  useEffect(() => {
    performSync(false);
  }, [performSync]);

  // Écouter l'événement d'instanciation du module WASM pour rafraîchir l'état
  useEffect(() => {
    const handleWasmReady = () => {
      performSync(true);
    };

    window.addEventListener('loto-engine-wasm-ready', handleWasmReady);
    return () => {
      window.removeEventListener('loto-engine-wasm-ready', handleWasmReady);
    };
  }, [performSync]);

  return {
    syncState,
    drawName: telemetry.drawName,
    drawCount: telemetry.drawCount,
    isWasmNative: telemetry.isWasmNative,
    mode: telemetry.mode,
    estimatedMemoryBytes: telemetry.estimatedMemoryBytes,
    frequencyCheckSum: telemetry.frequencyCheckSum,
    lastSyncTime,
    syncLatencyMs,
    syncNow: () => performSync(true),
  };
}
