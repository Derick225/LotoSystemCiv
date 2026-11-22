/**
 * Parseur et validateur officiel de l'API Loto Bonheur pour les Edge Functions Deno.
 * Maintenu synchronisé avec src/shared/lotobonheurParser.ts.
 */

export const LOTOBONHEUR_API_URL = 'https://lotobonheur.ci/api/results';

export const DRAW_NAMES_MAP: Record<string, string> = {
  REVEIL: 'Reveil',
  ETOILE: 'Etoile',
  AKWABA: 'Akwaba',
  'MONDAY SPECIAL': 'Monday Special',
  'LA MATINALE': 'La Matinale',
  EMERGENCE: 'Emergence',
  SIKA: 'Sika',
  'LUCKY TUESDAY': 'Lucky Tuesday',
  'PREMIERE HEURE': 'Premiere Heure',
  FORTUNE: 'Fortune',
  BARAKA: 'Baraka',
  MIDWEEK: 'Midweek',
  KADO: 'Kado',
  PRIVILEGE: 'Privilege',
  MONNI: 'Monni',
  'FORTUNE THURSDAY': 'Fortune Thursday',
  CASH: 'Cash',
  SOLUTION: 'Solution',
  WARI: 'Wari',
  'FRIDAY BONANZA': 'Friday Bonanza',
  SOUTRA: 'Soutra',
  DIAMANT: 'Diamant',
  MOAYE: 'Moaye',
  NATIONAL: 'National',
  BENEDICTION: 'Benediction',
  PRESTIGE: 'Prestige',
  AWALE: 'Awale',
  ESPOIR: 'Espoir',
};

export const FRENCH_MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const;

// Planning hebdomadaire attendu (getUTCDay : 0 = dimanche), aligné sur src/config/networks.ts
export const DRAW_SCHEDULE_UTC_DAY: Record<number, string[]> = {
  1: ['Reveil', 'Etoile', 'Akwaba', 'Monday Special'],
  2: ['La Matinale', 'Emergence', 'Sika', 'Lucky Tuesday'],
  3: ['Premiere Heure', 'Fortune', 'Baraka', 'Midweek'],
  4: ['Kado', 'Privilege', 'Monni', 'Fortune Thursday'],
  5: ['Cash', 'Solution', 'Wari', 'Friday Bonanza'],
  6: ['Soutra', 'Diamant', 'Moaye', 'National'],
  0: ['Benediction', 'Prestige', 'Awale', 'Espoir'],
};

export interface ParsedOfficialDraw {
  draw_name: string;
  date: string;
  gagnants: number[];
  machine: number[] | null;
  version: number;
}

export interface ParsedLotobonheurMonthResult {
  rows: ParsedOfficialDraw[];
  dayBlocks: Set<string>;
  foundKeys: Set<string>;
  unknown: Set<string>;
  skippedInvalidCount: number;
}

export const formatFrenchMonthParam = (date: Date): string => {
  return `${FRENCH_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
};

export const normalizeMonthParam = (input?: string | null, fallbackDate: Date = new Date()): string => {
  const raw = String(input || '').trim();
  if (!raw) return formatFrenchMonthParam(fallbackDate);

  const isoYm = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (isoYm) {
    const year = parseInt(isoYm[1], 10);
    const monthIdx = parseInt(isoYm[2], 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${FRENCH_MONTH_NAMES[monthIdx]} ${year}`;
    }
  }
  return raw;
};

export const ALL_OFFICIAL_DRAW_NAMES: readonly string[] = Object.values(DRAW_NAMES_MAP);

export const toLotobonheurMonthYearQuery = (
  input?: string | null,
  fallbackDate: Date = new Date()
): string => {
  return normalizeMonthParam(input, fallbackDate).toLowerCase();
};

export const buildLotobonheurApiUrl = (
  monthInput?: string | null,
  drawType?: string | null,
  fallbackDate: Date = new Date()
): string => {
  const monthYear = toLotobonheurMonthYearQuery(monthInput, fallbackDate);
  const canonicalType = drawType && drawType !== 'ALL'
    ? resolveCanonicalDrawName(drawType) || drawType
    : 'Tous les tirages';
  return `${LOTOBONHEUR_API_URL}?monthYear=${encodeURIComponent(monthYear)}&drawType=${encodeURIComponent(canonicalType)}`;
};

export const normalizeOfficialDrawKey = (rawName: string): string => {
  return String(rawName || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(LOTO|TIRAGE)\s+/i, '')
    .replace(/[\s\-_/]+/g, ' ')
    .trim();
};

export const resolveCanonicalDrawName = (rawName: string): string | null => {
  const key = normalizeOfficialDrawKey(rawName);
  if (!key || key === '-') return null;
  return DRAW_NAMES_MAP[key] || null;
};

export const isOfficialDrawWithoutMachine = (canonicalName: string): boolean => {
  return normalizeOfficialDrawKey(canonicalName) === 'FORTUNE THURSDAY';
};

export const isValidLotoNumbers = (nums: number[]): boolean => {
  if (!Array.isArray(nums) || nums.length !== 5) return false;
  const seen = new Set<number>();
  for (const n of nums) {
    if (!Number.isInteger(n) || n < 1 || n > 90 || seen.has(n)) {
      return false;
    }
    seen.add(n);
  }
  return true;
};

const extractStartYear = (startDateStr: unknown, fallbackYear: number): { year: number; monthHint: number | null } => {
  const s = String(startDateStr || '').trim();
  if (!s) return { year: fallbackYear, monthHint: null };

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return { year: parseInt(iso[1], 10), monthHint: parseInt(iso[2], 10) };
  }

  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    return { year: parseInt(dmy[3], 10), monthHint: parseInt(dmy[2], 10) };
  }

  const trailingYear = s.match(/(\d{4})$/);
  if (trailingYear) {
    return { year: parseInt(trailingYear[1], 10), monthHint: null };
  }
  return { year: fallbackYear, monthHint: null };
};

const isValidCalendarIso = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
};

const extractApiDrawsFromDaily = (daily: any): any[] => {
  const drawResults = daily?.drawResults;
  if (!drawResults) return [];
  if (Array.isArray(drawResults)) return drawResults;
  if (typeof drawResults !== 'object') return [];

  const collected: any[] = [];
  for (const bucket of Object.values(drawResults)) {
    if (Array.isArray(bucket)) {
      collected.push(...bucket);
    }
  }
  return collected;
};

export const parseLotobonheurResponse = (
  payload: unknown,
  options: { targetDrawName?: string; fallbackYear?: number } = {}
): ParsedLotobonheurMonthResult => {
  const fallbackYear = options.fallbackYear ?? new Date().getFullYear();
  const targetNormalized =
    options.targetDrawName && options.targetDrawName !== 'ALL'
      ? normalizeOfficialDrawKey(options.targetDrawName)
      : null;

  const rows: ParsedOfficialDraw[] = [];
  const dayBlocks = new Set<string>();
  const foundKeys = new Set<string>();
  const unknown = new Set<string>();
  let skippedInvalidCount = 0;

  if (!payload || typeof payload !== 'object') {
    return { rows, dayBlocks, foundKeys, unknown, skippedInvalidCount: 0 };
  }

  const weeks = Array.isArray((payload as { drawsResultsWeekly?: unknown[] }).drawsResultsWeekly)
    ? (payload as { drawsResultsWeekly: any[] }).drawsResultsWeekly
    : [];

  for (const week of weeks) {
    const { year: startYear, monthHint } = extractStartYear(week?.startDate, fallbackYear);
    const dailyList = Array.isArray(week?.drawResultsDaily) ? week.drawResultsDaily : [];

    for (const daily of dailyList) {
      const dateStr = String(daily?.date || '').trim();
      const dateMatch = dateStr.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/);
      if (!dateMatch) continue;

      const day = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10);
      let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : startYear;

      if (!dateMatch[3]) {
        if (month === 1 && monthHint === 12) year += 1;
        else if (month === 12 && monthHint === 1) year -= 1;
      }

      if (!isValidCalendarIso(year, month, day)) continue;

      const dbDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dayBlocks.add(dbDate);

      const apiDraws = extractApiDrawsFromDaily(daily);

      for (const draw of apiDraws) {
        const rawLabel = String(draw?.drawName || '').trim();
        const canonicalName = resolveCanonicalDrawName(rawLabel);

        if (!canonicalName) {
          const cleaned = normalizeOfficialDrawKey(rawLabel);
          if (cleaned && cleaned !== '-') unknown.add(rawLabel);
          continue;
        }

        if (targetNormalized && normalizeOfficialDrawKey(canonicalName) !== targetNormalized) {
          continue;
        }

        const winRaw = String(draw?.winningNumbers || '');
        if (!winRaw || winRaw.includes('..') || !/\d/.test(winRaw)) continue;

        const win = (winRaw.match(/\d+/g) || []).map(Number).slice(0, 5);
        if (!isValidLotoNumbers(win)) {
          skippedInvalidCount++;
          continue;
        }

        const withoutMachine = isOfficialDrawWithoutMachine(canonicalName);
        const macRaw = withoutMachine ? '' : String(draw?.machineNumbers ?? '');
        const mac = macRaw && !macRaw.includes('..') && /\d/.test(macRaw)
          ? (macRaw.match(/\d+/g) || []).map(Number).slice(0, 5)
          : [];
        const validMachine = !withoutMachine && isValidLotoNumbers(mac) ? mac : null;

        rows.push({
          draw_name: canonicalName,
          date: dbDate,
          gagnants: win,
          machine: validMachine,
          version: 1,
        });
        foundKeys.add(`${canonicalName}|${dbDate}`);
      }
    }
  }

  return { rows, dayBlocks, foundKeys, unknown, skippedInvalidCount };
};

export interface FetchLotobonheurMonthResult extends ParsedLotobonheurMonthResult {
  httpErrors: Array<{ month: string; drawType?: string; status: number | string }>;
  failedDrawTypes: Set<string>;
  rawPayloads?: Array<{ drawType: string; data: unknown }>;
}

export const fetchLotobonheurMonthDraws = async (options: {
  monthLabel: string;
  targetDrawName?: string;
  fallbackYear?: number;
  timeoutMs?: number;
  concurrency?: number;
  captureRaw?: boolean;
}): Promise<FetchLotobonheurMonthResult> => {
  const timeoutMs = options.timeoutMs ?? 15000;
  const fallbackYear = options.fallbackYear ?? new Date().getFullYear();
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4));
  const hasSpecificTarget = Boolean(
    options.targetDrawName && options.targetDrawName !== 'ALL'
  );
  const canonicalTarget = hasSpecificTarget
    ? resolveCanonicalDrawName(options.targetDrawName!) || options.targetDrawName!
    : undefined;

  const rowsByKey = new Map<string, ParsedOfficialDraw>();
  const dayBlocks = new Set<string>();
  const foundKeys = new Set<string>();
  const unknown = new Set<string>();
  const httpErrors: Array<{ month: string; drawType?: string; status: number | string }> = [];
  const failedDrawTypes = new Set<string>();
  const rawPayloads: Array<{ drawType: string; data: unknown }> = [];
  let skippedInvalidCount = 0;

  const fetchSingleType = async (drawType: string, filterTarget?: string) => {
    const url = buildLotobonheurApiUrl(options.monthLabel, drawType);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (NexusEngine/12.0)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        httpErrors.push({ month: options.monthLabel, drawType, status: response.status });
        if (drawType !== 'Tous les tirages') failedDrawTypes.add(drawType);
        return null;
      }
      const remoteData = await response.json().catch(() => null);
      if (!remoteData) {
        httpErrors.push({ month: options.monthLabel, drawType, status: 'INVALID_JSON' });
        if (drawType !== 'Tous les tirages') failedDrawTypes.add(drawType);
        return null;
      }
      if (options.captureRaw) {
        rawPayloads.push({ drawType, data: remoteData });
      }
      const parsed = parseLotobonheurResponse(remoteData, {
        targetDrawName: filterTarget,
        fallbackYear,
      });
      for (const r of parsed.rows) {
        const key = `${r.draw_name}|${r.date}`;
        const prev = rowsByKey.get(key);
        if (!prev || (!prev.machine && r.machine)) {
          rowsByKey.set(key, r);
        }
      }
      parsed.dayBlocks.forEach((d) => dayBlocks.add(d));
      parsed.foundKeys.forEach((k) => foundKeys.add(k));
      parsed.unknown.forEach((u) => unknown.add(u));
      skippedInvalidCount += parsed.skippedInvalidCount;
      return parsed;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      httpErrors.push({ month: options.monthLabel, drawType, status: msg });
      if (drawType !== 'Tous les tirages') failedDrawTypes.add(drawType);
      return null;
    }
  };

  if (canonicalTarget) {
    await fetchSingleType(canonicalTarget, canonicalTarget);
  } else {
    const globalParsed = await fetchSingleType('Tous les tirages', undefined);
    const foundNames = new Set(Array.from(rowsByKey.values()).map((r) => r.draw_name));

    const missingDrawSet = new Set<string>();
    const activeDays = globalParsed ? Array.from(globalParsed.dayBlocks) : [];
    for (const dayIso of activeDays) {
      const utcDay = new Date(`${dayIso}T00:00:00Z`).getUTCDay();
      const expected = DRAW_SCHEDULE_UTC_DAY[utcDay] || [];
      for (const name of expected) {
        if (!foundNames.has(name)) {
          missingDrawSet.add(name);
        }
      }
    }

    const missingDraws = Array.from(missingDrawSet);
    for (let i = 0; i < missingDraws.length; i += concurrency) {
      const batch = missingDraws.slice(i, i + concurrency);
      await Promise.all(batch.map((name) => fetchSingleType(name, name)));
    }
  }

  return {
    rows: Array.from(rowsByKey.values()),
    dayBlocks,
    foundKeys,
    unknown,
    skippedInvalidCount,
    httpErrors,
    failedDrawTypes,
    ...(options.captureRaw ? { rawPayloads } : {}),
  };
};
