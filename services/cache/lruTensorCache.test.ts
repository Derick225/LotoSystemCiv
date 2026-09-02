import { describe, it, expect, beforeEach } from 'vitest';
import { LruTensorCache, globalTensorCache, fastFnv1a, encryptPayload, decryptPayload } from './lruTensorCache';
import { DrawResult } from '../../types';

describe('LruTensorCache (RAM L1 + Encrypted IDB L2)', () => {
  let cache: LruTensorCache;

  const mockDraws: DrawResult[] = [
    { date: '2026-09-01', gagnants: [5, 12, 33, 54, 88], machine: [10, 20] },
    { date: '2026-08-28', gagnants: [1, 2, 3, 4, 5] },
  ];

  beforeEach(() => {
    cache = new LruTensorCache(3);
  });

  it('generates consistent canonical keys based on drawName, history length and lastDrawHash', () => {
    const key1 = cache.buildTensorKey('hawkes', 'Loto 5/90', mockDraws, 'decay_0.15');
    const key2 = cache.buildTensorKey('hawkes', 'Loto 5/90', mockDraws, 'decay_0.15');
    expect(key1).toBe(key2);
    expect(key1).toContain('loto 5/90_2_');
    expect(key1).toContain('_hawkes_');
  });

  it('isolates different draws from each other (TIRAGE ISOLATION RULE)', () => {
    const keyLoto = cache.buildTensorKey('tensor', 'Loto 5/90', mockDraws);
    const keyEuro = cache.buildTensorKey('tensor', 'EuroMillions', mockDraws);
    expect(keyLoto).not.toBe(keyEuro);
  });

  it('encrypts and decrypts payloads accurately with key-derived mask', () => {
    const secret = JSON.stringify({ weights: [0.1, 0.4, 0.9], name: 'test_tensor' });
    const key = 'secret_test_key_123';
    const encrypted = encryptPayload(secret, key);
    expect(encrypted).not.toBe(secret);

    const decrypted = decryptPayload(encrypted, key);
    expect(decrypted).toBe(secret);
    expect(JSON.parse(decrypted)).toEqual({ weights: [0.1, 0.4, 0.9], name: 'test_tensor' });
  });

  it('retrieves cached tensor instantly (<1ms) without re-computing', async () => {
    let computeCalls = 0;
    const computeFn = async () => {
      computeCalls++;
      return { heavyTensorResult: [1, 2, 3, 4, 5] };
    };

    // Premier appel : calcul
    const res1 = await cache.getOrCompute('hawkes', 'Loto 5/90', mockDraws, computeFn);
    expect(computeCalls).toBe(1);
    expect(res1.heavyTensorResult).toEqual([1, 2, 3, 4, 5]);

    // Deuxième appel : retour instantané depuis L1
    const res2 = await cache.getOrCompute('hawkes', 'Loto 5/90', mockDraws, computeFn);
    expect(computeCalls).toBe(1);
    expect(res2.heavyTensorResult).toEqual([1, 2, 3, 4, 5]);
  });

  it('enforces LRU eviction when RAM entry limit is reached', async () => {
    const d1 = [{ date: '2026-09-01', gagnants: [1] }];
    const d2 = [{ date: '2026-09-02', gagnants: [2] }];
    const d3 = [{ date: '2026-09-03', gagnants: [3] }];
    const d4 = [{ date: '2026-09-04', gagnants: [4] }];

    await cache.getOrCompute('t', 'Draw1', d1, () => ({ id: 1 }));
    await cache.getOrCompute('t', 'Draw2', d2, () => ({ id: 2 }));
    await cache.getOrCompute('t', 'Draw3', d3, () => ({ id: 3 }));
    
    // Accéder à Draw1 pour le rafraîchir en tête LRU
    await cache.getOrCompute('t', 'Draw1', d1, () => ({ id: 1 }));

    // Ajouter Draw4 -> Doit évincer Draw2 (le plus ancien non accédé)
    await cache.getOrCompute('t', 'Draw4', d4, () => ({ id: 4 }));

    const key2 = cache.buildTensorKey('t', 'Draw2', d2);
    // Dans un environnement sans IndexedDB natif (node vitest), Draw2 aura été évincé du L1
    const val2 = await cache.get(key2);
    expect(val2).toBeNull();
  });
});
