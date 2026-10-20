import { useState, useEffect } from 'react';
import { isLotoEngineWasmReady, getHpcEngineMode } from '../services/wasm/lotoEngineBridge';

export interface HpcEngineStatus {
  isReady: boolean;
  mode: 'RUST_WASM' | 'SIMD_FALLBACK';
}

/**
 * Hook réactif fournissant l'état d'activation du moteur HPC Rust WebAssembly.
 * Se met à jour instantanément dès que le bytecode WASM est compilé et instancié.
 */
export function useHpcEngineStatus(): HpcEngineStatus {
  const [status, setStatus] = useState<HpcEngineStatus>(() => ({
    isReady: isLotoEngineWasmReady(),
    mode: getHpcEngineMode(),
  }));

  useEffect(() => {
    // Si déjà prêt, assurer la synchronisation de l'état
    if (isLotoEngineWasmReady()) {
      setStatus({ isReady: true, mode: 'RUST_WASM' });
      return;
    }

    const handleWasmReady = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode: 'RUST_WASM' }>;
      setStatus({
        isReady: true,
        mode: customEvent.detail?.mode || 'RUST_WASM',
      });
    };

    window.addEventListener('loto-engine-wasm-ready', handleWasmReady);
    return () => {
      window.removeEventListener('loto-engine-wasm-ready', handleWasmReady);
    };
  }, []);

  return status;
}
