/**
 * Parseur et validateur officiel de l'API Loto Bonheur (lotobonheur.ci/api/results)
 * Partagé entre le serveur Express (`server.ts`), le client et les tests unitaires.
 * Garantit l'application stricte des règles 5/90 et la gestion des tirages sans machine.
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
  drawName: string;
  date: string; // ISO YYYY-MM-DD
  gagnants: number[];
  machine: number[] | null;
  version: number;
}

export interface ParsedLotobonheurMonthResult {
  draws: ParsedOfficialDraw[];
  dayBlocks: string[];
  foundKeys: string[];
  unknownDrawNames: string[];
  skippedInvalidCount: number;
}

export const formatFrenchMonthParam = (date: Date): string => {
  return `${FRENCH_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
};

export const buildRecentFrenchMonths = (monthsBack: number = 1, now: Date = new Date()): string[] => {
  const safeBack = Math.max(0, Math.min(12, Math.floor(monthsBack)));
  const months: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= safeBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = formatFrenchMonthParam(d);
    if (!seen.has(label)) {
      seen.add(label);
      months.push(label);
    }
  }
  return months;
};

/**
 * Normalise le libellé d'un mois (accepte "Avril 2026", "avril 2026" ou "2026-04").
 */
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

  // ISO: YYYY-MM-DD
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return { year: parseInt(iso[1], 10), monthHint: parseInt(iso[2], 10) };
  }

  // DMY: DD/MM/YYYY or DD-MM-YYYY
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

/**
 * Parse la réponse JSON brute de `https://lotobonheur.ci/api/results?month=...`.
 */
export const parseLotobonheurResponse = (
  payload: unknown,
  options: { targetDrawName?: string; fallbackYear?: number } = {}
): ParsedLotobonheurMonthResult => {
  const fallbackYear = options.fallbackYear ?? new Date().getFullYear();
  const targetNormalized =
    options.targetDrawName && options.targetDrawName !== 'ALL'
      ? normalizeOfficialDrawKey(options.targetDrawName)
      : null;

  const draws: ParsedOfficialDraw[] = [];
  const dayBlocksSet = new Set<string>();
  const foundKeysSet = new Set<string>();
  const unknownSet = new Set<string>();
  let skippedInvalidCount = 0;

  if (!payload || typeof payload !== 'object') {
    return {
      draws,
      dayBlocks: [],
      foundKeys: [],
      unknownDrawNames: [],
      skippedInvalidCount: 0,
    };
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
      dayBlocksSet.add(dbDate);

      const apiDraws = [
        ...(Array.isArray(daily?.drawResults?.standardDraws) ? daily.drawResults.standardDraws : []),
        ...(Array.isArray(daily?.drawResults?.turboDraws) ? daily.drawResults.turboDraws : []),
      ];

      for (const draw of apiDraws) {
        const rawLabel = String(draw?.drawName || '').trim();
        const canonicalName = resolveCanonicalDrawName(rawLabel);

        if (!canonicalName) {
          const cleaned = normalizeOfficialDrawKey(rawLabel);
          if (cleaned && cleaned !== '-') unknownSet.add(rawLabel);
          continue;
        }

        if (targetNormalized && normalizeOfficialDrawKey(canonicalName) !== targetNormalized) {
          continue;
        }

        const winRaw = String(draw?.winningNumbers || '');
        if (!winRaw || winRaw.includes('..')) continue;

        const win = (winRaw.match(/\d+/g) || []).map(Number).slice(0, 5);
        if (!isValidLotoNumbers(win)) {
          skippedInvalidCount++;
          continue;
        }

        const withoutMachine = isOfficialDrawWithoutMachine(canonicalName);
        const macRaw = withoutMachine ? '' : String(draw?.machineNumbers || '');
        const mac = macRaw && !macRaw.includes('..')
          ? (macRaw.match(/\d+/g) || []).map(Number).slice(0, 5)
          : [];
        const validMachine = !withoutMachine && isValidLotoNumbers(mac) ? mac : null;

        draws.push({
          drawName: canonicalName,
          date: dbDate,
          gagnants: win,
          machine: validMachine,
          version: 1,
        });
        foundKeysSet.add(`${canonicalName}|${dbDate}`);
      }
    }
  }

  return {
    draws,
    dayBlocks: Array.from(dayBlocksSet).sort(),
    foundKeys: Array.from(foundKeysSet),
    unknownDrawNames: Array.from(unknownSet),
    skippedInvalidCount,
  };
};
