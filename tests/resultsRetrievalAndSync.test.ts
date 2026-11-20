import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseLotobonheurResponse,
  resolveCanonicalDrawName,
  isValidLotoNumbers,
  buildRecentFrenchMonths,
  normalizeMonthParam,
} from '../src/shared/lotobonheurParser';
import {
  resetDrawExceptionsStoreForTests,
  upsertDrawException,
  getDrawException,
  mergeDbDrawCancellations,
} from '../src/services/drawScheduleExceptionService';

describe('Parseur Officiel Loto Bonheur (src/shared/lotobonheurParser.ts)', () => {
  it('normalise les noms de tirages avec accents, préfixes et tirets', () => {
    expect(resolveCanonicalDrawName('TIRAGE RÉVEIL')).toBe('Reveil');
    expect(resolveCanonicalDrawName('LOTO PREMIÈRE HEURE')).toBe('Premiere Heure');
    expect(resolveCanonicalDrawName('MONDAY-SPECIAL')).toBe('Monday Special');
    expect(resolveCanonicalDrawName('  fortune   thursday ')).toBe('Fortune Thursday');
    expect(resolveCanonicalDrawName('-')).toBeNull();
    expect(resolveCanonicalDrawName('TIRAGE INCONNU')).toBeNull();
  });

  it('valide strictement les combinaisons 5/90 (uniques entre 1 et 90)', () => {
    expect(isValidLotoNumbers([5, 12, 34, 78, 90])).toBe(true);
    expect(isValidLotoNumbers([1, 1, 3, 4, 5])).toBe(false);
    expect(isValidLotoNumbers([0, 12, 34, 56, 78])).toBe(false);
    expect(isValidLotoNumbers([5, 12, 34, 78, 91])).toBe(false);
    expect(isValidLotoNumbers([5, 12, 34, 78])).toBe(false);
  });

  it('parse standardDraws et turboDraws, applique machine:null sur Fortune Thursday et gère le changement d année', () => {
    const payload = {
      drawsResultsWeekly: [
        {
          startDate: '29/12/2025',
          drawResultsDaily: [
            {
              date: 'Mer 31/12',
              drawResults: {
                standardDraws: [
                  {
                    drawName: 'TIRAGE PREMIÈRE HEURE',
                    winningNumbers: '05 - 14 - 23 - 67 - 89',
                    machineNumbers: '01 - 12 - 33 - 44 - 75',
                  },
                ],
                turboDraws: [
                  {
                    drawName: 'MIDWEEK',
                    winningNumbers: '10 20 30 40 50',
                    machineNumbers: '.. - .. - .. - .. - ..',
                  },
                ],
              },
            },
            {
              date: 'Jeu 01/01',
              drawResults: {
                standardDraws: [
                  {
                    drawName: 'Fortune Thursday',
                    winningNumbers: '03 - 17 - 29 - 55 - 88',
                    machineNumbers: '02 - 04 - 06 - 08 - 10', // Doit être ignoré -> machine: null
                  },
                  {
                    drawName: 'Kado',
                    winningNumbers: '.. - .. - .. - .. - ..', // En attente -> ignoré silencieusement
                  },
                  {
                    drawName: 'Privilege',
                    winningNumbers: '01 - 01 - 12 - 15 - 99', // Invalide -> incrémente skippedInvalidCount
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const parsed = parseLotobonheurResponse(payload, { fallbackYear: 2026 });

    expect(parsed.skippedInvalidCount).toBe(1);
    expect(parsed.draws).toHaveLength(3);

    const premiere = parsed.draws.find((d) => d.drawName === 'Premiere Heure');
    expect(premiere).toEqual({
      drawName: 'Premiere Heure',
      date: '2025-12-31',
      gagnants: [5, 14, 23, 67, 89],
      machine: [1, 12, 33, 44, 75],
      version: 1,
    });

    const midweek = parsed.draws.find((d) => d.drawName === 'Midweek');
    expect(midweek?.date).toBe('2025-12-31');
    expect(midweek?.machine).toBeNull();

    const fortuneThursday = parsed.draws.find((d) => d.drawName === 'Fortune Thursday');
    expect(fortuneThursday).toEqual({
      drawName: 'Fortune Thursday',
      date: '2026-01-01',
      gagnants: [3, 17, 29, 55, 88],
      machine: null,
      version: 1,
    });
  });

  it('construit les mois français récents et normalise YYYY-MM', () => {
    const ref = new Date(2026, 0, 15); // Janvier 2026
    expect(buildRecentFrenchMonths(1, ref)).toEqual(['Janvier 2026', 'Décembre 2025']);
    expect(normalizeMonthParam('2026-04')).toBe('Avril 2026');
    expect(normalizeMonthParam('Mars 2026')).toBe('Mars 2026');
  });
});

describe('Synchronisation des annulations DB (mergeDbDrawCancellations)', () => {
  beforeEach(() => {
    resetDrawExceptionsStoreForTests();
  });

  it('importe db_auto/db_manual, respecte la priorité manual_admin et purge les db_auto obsolètes', () => {
    upsertDrawException({
      date: '2026-04-10',
      drawName: 'Cash',
      type: 'CANCELLED',
      label: 'Surcharge locale admin',
    });

    // Premier sync DB
    const res1 = mergeDbDrawCancellations(
      [
        { draw_name: 'Cash', date: '2026-04-10', reason: 'Motif serveur ignoré', source: 'auto' },
        { draw_name: 'Wari', date: '2026-04-10', reason: 'Tirage absent du site officiel', source: 'auto' },
        { draw_name: '*', date: '2026-04-12', reason: 'Jour férié exceptionnel', source: 'manual' },
      ],
      '2026-04-01'
    );

    expect(res1.addedOrUpdated).toBe(2); // Wari (db_auto) + * (db_manual) ; Cash reste manual_admin
    expect(getDrawException('2026-04-10', 'Cash')?.source).toBe('manual_admin');
    expect(getDrawException('2026-04-10', 'Wari')?.source).toBe('db_auto');
    expect(getDrawException('2026-04-12', 'Espoir')?.type).toBe('HOLIDAY');

    // Deuxième sync : Wari a finalement reçu un résultat sur le site officiel (retiré de draw_cancellations)
    const res2 = mergeDbDrawCancellations(
      [{ draw_name: '*', date: '2026-04-12', reason: 'Jour férié exceptionnel', source: 'manual' }],
      '2026-04-01'
    );

    expect(res2.removed).toBe(1);
    expect(getDrawException('2026-04-10', 'Wari')).toBeNull();
    expect(getDrawException('2026-04-10', 'Cash')?.source).toBe('manual_admin');
  });
});

describe('Récupération paginée & Sync API (lotteryService)', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalNavigator !== undefined) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    }
  });

  it('pagine automatiquement au-delà de 1000 lignes dans fetchHistory', async () => {
    const makeBatch = (start: number, count: number) =>
      Array.from({ length: count }, (_, idx) => {
        const n = start + idx;
        const d = new Date(Date.UTC(2020, 0, 1 + n)).toISOString().slice(0, 10);
        return {
          id: `id-${n}`,
          draw_name: 'National',
          date: d,
          gagnants: [1, 2, 3, 4, 5],
          machine: [6, 7, 8, 9, 10],
          version: 1,
        };
      });

    const page1 = makeBatch(0, 1000);
    const page2 = makeBatch(1000, 150);

    const rangeCalls: Array<[number, number]> = [];
    const createQueryBuilder = () => {
      let currentFrom = 0;
      const builder: any = {
        select: () => builder,
        order: () => builder,
        eq: () => builder,
        gte: () => builder,
        lte: () => builder,
        range: (from: number, to: number) => {
          currentFrom = from;
          rangeCalls.push([from, to]);
          return builder;
        },
        then: (resolve: any, reject?: any) =>
          Promise.resolve({
            data: currentFrom === 0 ? page1 : page2,
            error: null,
          }).then(resolve, reject),
      };
      return builder;
    };

    vi.doMock('../src/services/supabaseClient', () => ({
      isSupabaseConfigured: () => true,
      supabase: {
        from: () => createQueryBuilder(),
        rpc: vi.fn(),
      },
    }));

    const { lotteryService } = await import('../src/services/lotteryService');
    const history = await lotteryService.fetchHistory('National', true);

    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(history).toHaveLength(1150);
  });

  it('utilise get_draw_results_summary dans fetchLatestResults et bascule sur requête directe si la RPC échoue', async () => {
    const rpcMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: 'r1',
            draw_name: 'Reveil',
            date: '2026-04-15',
            gagnants: [4, 11, 22, 33, 44],
            machine: [5, 15, 25, 35, 45],
            version: 1,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'function not found' },
      });

    const fallbackRows = [
      {
        id: 'r2',
        draw_name: 'Etoile',
        date: '2026-04-15',
        gagnants: [1, 12, 23, 34, 45],
        machine: [2, 13, 24, 35, 46],
        version: 1,
      },
    ];

    const createFallbackBuilder = () => {
      const b: any = {
        select: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        in: () => b,
        then: (resolve: any, reject?: any) =>
          Promise.resolve({ data: fallbackRows, error: null }).then(resolve, reject),
      };
      return b;
    };

    vi.doMock('../src/services/supabaseClient', () => ({
      isSupabaseConfigured: () => true,
      supabase: {
        rpc: rpcMock,
        from: () => createFallbackBuilder(),
      },
    }));

    const { lotteryService } = await import('../src/services/lotteryService');

    const map1 = await lotteryService.fetchLatestResults(['Reveil'], 30);
    expect(map1.get('Reveil')?.gagnants).toEqual([4, 11, 22, 33, 44]);

    const map2 = await lotteryService.fetchLatestResults(['Etoile'], 30);
    expect(map2.get('Etoile')?.gagnants).toEqual([1, 12, 23, 34, 45]);
  });

  it('bascule de Edge cron-sync vers Express /api/results/sync dans syncDrawExternalDetailed', async () => {
    const invokeMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Edge unreachable', name: 'FunctionsFetchError' },
    });

    const createQueryBuilder = (table: string) => {
      const b: any = {
        select: () => b,
        order: () => b,
        eq: () => b,
        gte: () => b,
        lte: () => b,
        limit: () => b,
        range: () => b,
        then: (resolve: any, reject?: any) =>
          Promise.resolve({
            data:
              table === 'draw_cancellations'
                ? []
                : [
                    {
                      id: 'db-1',
                      draw_name: 'Cash',
                      date: '2026-04-15',
                      gagnants: [5, 10, 15, 20, 25],
                      machine: [6, 11, 16, 21, 26],
                      version: 1,
                    },
                  ],
            error: null,
          }).then(resolve, reject),
      };
      return b;
    };

    vi.doMock('../src/services/supabaseClient', () => ({
      isSupabaseConfigured: () => true,
      supabase: {
        functions: { invoke: invokeMock },
        from: (table: string) => createQueryBuilder(table),
        rpc: vi.fn(),
      },
    }));

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        source: 'lotobonheur-api',
        months: ['Avril 2026'],
        persisted: true,
        upserted: 1,
        draws: [
          {
            drawName: 'Cash',
            date: '2026-04-15',
            gagnants: [5, 10, 15, 20, 25],
            machine: [6, 11, 16, 21, 26],
            version: 1,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('CustomEvent', class {
      type: string;
      detail: any;
      constructor(type: string, init?: { detail?: any }) {
        this.type = type;
        this.detail = init?.detail;
      }
    });

    try {
      const { syncDrawExternalDetailed } = await import('../src/services/lotteryService');
      const result = await syncDrawExternalDetailed('Cash', { monthsBack: 1 });

      expect(invokeMock).toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/results/sync',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.source).toBe('express-api');
      expect(result.fetchedCount).toBe(1);
      expect(result.upsertedCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
