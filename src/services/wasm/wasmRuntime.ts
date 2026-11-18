/**
 * Cycle de vie du module Rust/WASM Loto-Engine, télémétrie de fallback et lecture ABI sécurisée.
 */

let wasmModuleInstance: any = null;
let isWasmLoaded = false;
let wasmLoadPromise: Promise<boolean> | null = null;
let wasmFallbackCount = 0;

export function getWasmModuleInstance(): any {
  return wasmModuleInstance;
}

/**
 * Initialise le module WebAssembly généré par wasm-pack.
 * Compatible avec le chargement dynamique asynchrone Vite / PWA.
 */
export async function initializeLotoEngineWasm(): Promise<boolean> {
  if (isWasmLoaded) return true;
  if (wasmLoadPromise) return wasmLoadPromise;

  wasmLoadPromise = (async () => {
    try {
      // @ts-ignore - Le module compilé réside dans le dossier pkg après `wasm-pack build --target web`
      const wasm = await import('../../../crates/loto-engine/pkg/loto_engine.js').catch(() => null);

      if (wasm && typeof wasm.default === 'function') {
        if (typeof window !== 'undefined') {
          try {
            await wasm.default('/loto_engine_bg.wasm');
          } catch {
            await wasm.default();
          }
        } else {
          try {
            const fs = await import('fs');
            const path = await import('path');
            const wasmPath = path.resolve(process.cwd(), 'crates/loto-engine/pkg/loto_engine_bg.wasm');
            if (fs.existsSync(wasmPath)) {
              const buffer = fs.readFileSync(wasmPath);
              if (typeof wasm.initSync === 'function') {
                wasm.initSync({ module: buffer });
              } else {
                await wasm.default({ module: buffer });
              }
            } else {
              await wasm.default();
            }
          } catch {
            await wasm.default();
          }
        }
        wasmModuleInstance = wasm;
        isWasmLoaded = true;
        console.info('[LOTO-ENGINE] Module Rust/WASM initialisé avec succès (Accélération HPC active).');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('loto-engine-wasm-ready', { detail: { mode: 'RUST_WASM' } }));
        }
        return true;
      }
    } catch (err) {
      console.warn('[LOTO-ENGINE] Module WASM non encore compilé ou inaccessible, fallback déterministe actif :', err);
    }
    isWasmLoaded = false;
    return false;
  })();

  return wasmLoadPromise;
}

export function isLotoEngineWasmReady(): boolean {
  return isWasmLoaded;
}

export function getHpcEngineMode(): 'RUST_WASM' | 'SIMD_FALLBACK' {
  return isWasmLoaded ? 'RUST_WASM' : 'SIMD_FALLBACK';
}

export const initLotoEngineWasm = initializeLotoEngineWasm;

export function getWasmFallbackCount(): number {
  return wasmFallbackCount;
}

export function resetWasmFallbackCount(): void {
  wasmFallbackCount = 0;
}

export function recordWasmFallback(context?: string, error?: unknown): void {
  wasmFallbackCount++;
  if (context) {
    console.warn(`[LOTO-ENGINE FALLBACK #${wasmFallbackCount}] ${context}`, error);
  }
}

export function getEngineVersion(): string {
  if (isWasmLoaded && typeof wasmModuleInstance?.engine_version === 'function') {
    try {
      return wasmModuleInstance.engine_version();
    } catch {
      // fallback
    }
  }
  return '12.0.0-source';
}

export function getAbiHash(): string {
  if (isWasmLoaded && typeof wasmModuleInstance?.abi_hash === 'function') {
    try {
      return wasmModuleInstance.abi_hash();
    } catch {
      // fallback
    }
  }
  return 'e3b0c44298fc1c14';
}

export interface WasmDisposable {
  free?: () => void;
}

/**
 * Accesseur polymorphe sécurisé pour les propriétés / getters WebAssembly.
 * Prévient les erreurs de type TypeError si wasm-bindgen expose un getter sous forme de propriété JS.
 */
export function readWasmField<T>(target: unknown, prop: string, fallback: T): T {
  if (!target || typeof target !== 'object') return fallback;
  try {
    const record = target as Record<string, unknown>;
    const val = record[prop];
    if (typeof val === 'function') {
      const fn = val as () => T | undefined | null;
      const called = fn.call(target);
      return called !== undefined && called !== null ? called : fallback;
    }
    return val !== undefined && val !== null ? (val as T) : fallback;
  } catch {
    return fallback;
  }
}
