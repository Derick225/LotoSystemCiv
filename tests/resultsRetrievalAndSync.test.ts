import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseLotobonheurResponse,
  resolveCanonicalDrawName,
  isValidLotoNumbers,
  buildRecentFrenchMonths,
  normalizeMonthParam,
  toLotobonheurMonthYearQuery,
  buildLotobonheurApiUrl,
  fetchLotobonheurMonthDraws,
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

  it('construit les mois français récents, normalise YYYY-MM et force monthYear en minuscules', () => {
    const ref = new Date(2026, 0, 15); // Janvier 2026
    expect(buildRecentFrenchMonths(1, ref)).toEqual(['Janvier 2026', 'Décembre 2025']);
    expect(normalizeMonthParam('2026-04')).toBe('Avril 2026');
    expect(normalizeMonthParam('Mars 2026')).toBe('Mars 2026');
    expect(toLotobonheurMonthYearQuery('Novembre 2026')).toBe('novembre 2026');
    expect(toLotobonheurMonthYearQuery('2026-11')).toBe('novembre 2026');
    expect(buildLotobonheurApiUrl('Novembre 2026')).toBe(
      'https://lotobonheur.ci/api/results?monthYear=novembre%202026&drawType=Tous%20les%20tirages'
    );
    expect(buildLotobonheurApiUrl('Novembre 2026', 'National')).toBe(
      'https://lotobonheur.ci/api/results?monthYear=novembre%202026&drawType=National'
    );
  });

  it('supporte les formats nightDraws, tableau plat drawResults et placeholders ". - . - . - . - ." sans machine', () => {
    const payload = {
      drawsResultsWeekly: [
        {
          startDate: '16/11/2026',
          drawResultsDaily: [
            {
              date: 'Lun 16/11',
              drawResults: {
                standardDraws: [
                  {
                    drawName: 'Monday Special',
                    winningNumbers: '04 - 18 - 27 - 44 - 81',
                    machineNumbers: '. - . - . - . - .',
                  },
                ],
                nightDraws: [
                  {
                    drawName: 'Espoir',
                    winningNumbers: '02 - 19 - 35 - 61 - 74',
                    machineNumbers: '09 - 14 - 28 - 52 - 66',
                  },
                ],
              },
            },
            {
              date: 'Sam 21/11',
              drawResults: [
                {
                  drawName: 'National',
                  winningNumbers: '07 - 22 - 39 - 68 - 84',
                  machineNumbers: '. - . - . - . - .',
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = parseLotobonheurResponse(payload, { fallbackYear: 2026 });
    expect(parsed.draws).toHaveLength(3);
    expect(parsed.draws.find((d) => d.drawName === 'Monday Special')).toEqual({
      drawName: 'Monday Special',
      date: '2026-11-16',
      gagnants: [4, 18, 27, 44, 81],
      machine: null,
      version: 1,
    });
    expect(parsed.draws.find((d) => d.drawName === 'Espoir')?.machine).toEqual([9, 14, 28, 52, 66]);
    expect(parsed.draws.find((d) => d.drawName === 'National')).toEqual({
      drawName: 'National',
      date: '2026-11-21',
      gagnants: [7, 22, 39, 68, 84],
      machine: null,
      version: 1,
    });
  });

  it('cible uniquement drawType lors d un appel ciblé et complète les tirages 19h55 omis par Tous les tirages', async () => {
    const requestedUrls: string[] = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      const parsedUrl = new URL(url);
      const drawType = parsedUrl.searchParams.get('drawType');

      if (drawType === 'Tous les tirages') {
        return new Response(
          JSON.stringify({
            drawsResultsWeekly: [
              {
                startDate: '16/11/2026',
                drawResultsDaily: [
                  {
                    date: 'Jeu 19/11',
                    drawResults: {
                      standardDraws: [
                        {
                          drawName: 'Kado',
                          winningNumbers: '01 - 12 - 23 - 34 - 45',
                          machineNumbers: '05 - 15 - 25 - 35 - 45',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (drawType === 'Fortune Thursday') {
        return new Response(
          JSON.stringify({
            drawsResultsWeekly: [
              {
                startDate: '16/11/2026',
                drawResultsDaily: [
                  {
                    date: 'Jeu 19/11',
                    drawResults: {
                      standardDraws: [
                        {
                          drawName: 'Fortune Thursday',
                          winningNumbers: '08 - 17 - 31 - 54 - 79',
                          machineNumbers: '. - . - . - . - .',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (drawType === 'Monni') {
        return new Response('Upstream error', { status: 503 });
      }

      return new Response(JSON.stringify({ drawsResultsWeekly: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const targeted = await fetchLotobonheurMonthDraws({
      monthLabel: 'Novembre 2026',
      targetDrawName: 'Fortune Thursday',
      fallbackYear: 2026,
      fetchImpl: mockFetch,
    });

    expect(requestedUrls).toEqual([
      'https://lotobonheur.ci/api/results?monthYear=novembre%202026&drawType=Fortune%20Thursday',
    ]);
    expect(targeted.draws).toHaveLength(1);
    expect(targeted.draws[0].machine).toBeNull();

    requestedUrls.length = 0;
    const globalRes = await fetchLotobonheurMonthDraws({
      monthLabel: 'Novembre 2026',
      fallbackYear: 2026,
      fetchImpl: mockFetch,
    });

    expect(requestedUrls[0]).toBe(
      'https://lotobonheur.ci/api/results?monthYear=novembre%202026&drawType=Tous%20les%20tirages'
    );
    expect(globalRes.draws.map((d) => d.drawName)).toContain('Kado');
    expect(globalRes.draws.map((d) => d.drawName)).toContain('Fortune Thursday');
    expect(globalRes.failedDrawTypes).toEqual(['Monni']);
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

  it('ne masque pas une erreur DB partielle de cron-sync (upserted:0 + errors) et bascule sur fallback', async () => {
    const invokeMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          success: true,
          status: 'partial',
          fetched: 4,
          upserted: 0,
          errors: ['upsert Novembre 2026: new row violates check constraint "valid_machine"'],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          months: ['Novembre 2026'],
          draws: [
            {
              drawName: 'National',
              date: '2026-11-21',
              gagnants: [7, 22, 39, 68, 84],
              machine: null,
              version: 1,
            },
          ],
        },
        error: null,
      });

    const createQueryBuilder = () => {
      const b: any = {
        select: () => b,
        order: () => b,
        eq: () => b,
        gte: () => b,
        lte: () => b,
        limit: () => b,
        range: () => b,
        then: (resolve: any, reject?: any) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return b;
    };

    vi.doMock('../src/services/supabaseClient', () => ({
      isSupabaseConfigured: () => true,
      supabase: {
        functions: { invoke: invokeMock },
        from: () => createQueryBuilder(),
        rpc: vi.fn(),
      },
    }));

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'text/html' }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    try {
      const { syncDrawExternalDetailed } = await import('../src/services/lotteryService');
      const result = await syncDrawExternalDetailed('National', { monthsBack: 0 });

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(result.source).toBe('edge-proxy');
      expect(result.fetchedCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
