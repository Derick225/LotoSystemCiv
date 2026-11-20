import { DRAW_SCHEDULE, normalizeDrawName } from "../config/networks";
import type { DrawResult } from "../types";
import { parseDateSafely } from "../utils/dateUtils";
import { supabase, isSupabaseConfigured } from "./supabaseClient";

export type DrawExceptionType = "HOLIDAY" | "CANCELLED" | "POSTPONED";
export type DrawExceptionSource = "preset_holiday" | "manual_admin" | "db_auto" | "db_manual";

export interface DrawException {
  id: string;
  /** Format canonique local YYYY-MM-DD */
  date: string;
  /** '*' pour tous les tirages de la journée, sinon nom du tirage ciblé */
  drawName: string;
  type: DrawExceptionType;
  label: string;
  source: DrawExceptionSource;
  /** Permet de neutraliser un jour férié préconfiguré si un tirage exceptionnel a bien eu lieu */
  suppressed?: boolean;
  createdAt: number;
}

export interface SkippedDrawSlot {
  day: string;
  time: string;
  name: string;
  dateIso: string;
  exception: DrawException;
}

export interface NextActiveScheduledSlot {
  day: string;
  time: string;
  name: string;
  dateIso: string;
  targetTimestamp: number;
  skippedSlots: SkippedDrawSlot[];
}

export interface DocumentedSkipItem {
  dateIso: string;
  frDate: string;
  label: string;
  type: DrawExceptionType;
  source: DrawExceptionSource;
}

export interface UnexplainedMissingDateItem {
  dateIso: string;
  frDate: string;
}

export interface MissingDrawAnalysis {
  documentedSkips: DocumentedSkipItem[];
  unexplainedMissingDates: UnexplainedMissingDateItem[];
  /** Écart calendaire brut depuis le dernier résultat enregistré */
  rawLastGapDays: number | null;
  /** Écart ajusté excluant les jours fériés / tirages annulés documentés depuis le dernier résultat */
  effectiveLastGapDays: number | null;
}

export const DRAW_EXCEPTIONS_UPDATED_EVENT = "DRAW_EXCEPTIONS_UPDATED";

const STORAGE_KEY_EXCEPTIONS = "lotopro_draw_exceptions_v1";
const STORAGE_KEY_PRESETS_ENABLED = "lotopro_preset_holidays_enabled_v1";

export const DAYS_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

/** Jours fériés civils fixes officiels en Côte d'Ivoire (format MM-DD) */
export const CI_FIXED_HOLIDAYS: ReadonlyArray<{ mmdd: string; label: string }> = [
  { mmdd: "01-01", label: "Jour de l'An" },
  { mmdd: "05-01", label: "Fête du Travail" },
  { mmdd: "08-07", label: "Fête Nationale (Indépendance)" },
  { mmdd: "08-15", label: "Assomption" },
  { mmdd: "11-01", label: "Toussaint" },
  { mmdd: "11-15", label: "Journée Nationale de la Paix" },
  { mmdd: "12-25", label: "Noël" },
];

/** Modèles rapides pour les jours fériés mobiles et annulations administratives */
export const QUICK_EXCEPTION_TEMPLATES: ReadonlyArray<{
  label: string;
  type: DrawExceptionType;
}> = [
  { label: "Lundi de Pâques", type: "HOLIDAY" },
  { label: "Ascension", type: "HOLIDAY" },
  { label: "Lundi de Pentecôte", type: "HOLIDAY" },
  { label: "Aïd el-Fitr (Korité)", type: "HOLIDAY" },
  { label: "Aïd el-Kebir (Tabaski)", type: "HOLIDAY" },
  { label: "Maouloud (Naissance du Prophète)", type: "HOLIDAY" },
  { label: "Lailatoul Qadr (Nuit du Destin)", type: "HOLIDAY" },
  { label: "Tirage annulé (Communiqué LONACI)", type: "CANCELLED" },
  { label: "Incident technique / Maintenance", type: "CANCELLED" },
  { label: "Tirage reporté", type: "POSTPONED" },
];

// Stockage en mémoire sûr pour environnement Node/SSR/Vitest lorsque localStorage est absent
let memoryExceptionsFallback: DrawException[] = [];
let memoryPresetsEnabledFallback = true;

const hasLocalStorage = (): boolean => {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
};

const emitExceptionsUpdated = (): void => {
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent(DRAW_EXCEPTIONS_UPDATED_EVENT));
    }
  } catch {
    // Silencieux en environnement non-DOM
  }
};

/**
 * Réinitialise le cache mémoire interne (utile uniquement pour l'isolation des tests unitaires).
 */
export const resetDrawExceptionsStoreForTests = (): void => {
  memoryExceptionsFallback = [];
  memoryPresetsEnabledFallback = true;
  if (hasLocalStorage()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY_EXCEPTIONS);
      window.localStorage.removeItem(STORAGE_KEY_PRESETS_ENABLED);
    } catch {
      // Ignorer
    }
  }
};

/**
 * Normalise toute entrée de date vers le format canonique local YYYY-MM-DD
 * sans dérive de fuseau horaire UTC.
 */
export const toCanonicalIsoDate = (input: Date | string | number): string => {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return toCanonicalIsoDate(new Date());
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const raw = String(input ?? "").trim();
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  }

  const parsed = parseDateSafely(input);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const toFrenchDate = (isoDate: string): string => {
  const iso = toCanonicalIsoDate(isoDate);
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const parseIsoDateLocalNoon = (isoDate: string): Date => {
  const [y, m, d] = toCanonicalIsoDate(isoDate).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
};

export const isAutoPresetHolidaysEnabled = (): boolean => {
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_PRESETS_ENABLED);
      if (raw === null) return true;
      return raw === "true";
    } catch {
      return memoryPresetsEnabledFallback;
    }
  }
  return memoryPresetsEnabledFallback;
};

export const setAutoPresetHolidaysEnabled = (enabled: boolean): void => {
  memoryPresetsEnabledFallback = enabled;
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY_PRESETS_ENABLED, enabled ? "true" : "false");
    } catch {
      // Ignorer
    }
  }
  emitExceptionsUpdated();
};

const readStoredManualExceptions = (): DrawException[] => {
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_EXCEPTIONS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return memoryExceptionsFallback;
    }
  }
  return memoryExceptionsFallback;
};

const writeStoredManualExceptions = (items: DrawException[]): void => {
  memoryExceptionsFallback = items;
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY_EXCEPTIONS, JSON.stringify(items));
    } catch {
      // Ignorer si quota dépassé
    }
  }
  emitExceptionsUpdated();
};

const buildDeterministicExceptionId = (dateIso: string, scope: string): string => {
  const safeScope = scope === "*" ? "all" : normalizeDrawName(scope).replace(/\s+/g, "_");
  return `exc_${dateIso}_${safeScope}`;
};

export const listManualDrawExceptions = (): DrawException[] => {
  return [...readStoredManualExceptions()].sort((a, b) => b.date.localeCompare(a.date));
};

export const getPresetHolidayForDate = (dateInput: Date | string | number): { mmdd: string; label: string } | null => {
  const iso = toCanonicalIsoDate(dateInput);
  const mmdd = iso.slice(5, 10);
  const found = CI_FIXED_HOLIDAYS.find((h) => h.mmdd === mmdd);
  return found || null;
};

/**
 * Retourne l'exception calendaire active (jour férié ou tirage annulé/reporté) pour une date et un tirage donnés.
 * Ordre de priorité déterministe :
 *   1. Surcharge manuelle exacte (date + tirage)
 *   2. Surcharge manuelle globale journée entière (date + '*')
 *   3. Jour férié fixe officiel CI (si activé et non annulé par une entrée `suppressed: true`)
 */
export const getDrawException = (
  dateInput: Date | string | number,
  drawName?: string | null
): DrawException | null => {
  const dateIso = toCanonicalIsoDate(dateInput);
  const targetNorm = drawName && drawName.trim() !== "*" ? normalizeDrawName(drawName) : "*";
  const manuals = readStoredManualExceptions();

  if (targetNorm !== "*") {
    const exactMatch = manuals.find(
      (e) => e.date === dateIso && e.drawName !== "*" && normalizeDrawName(e.drawName) === targetNorm
    );
    if (exactMatch) {
      return exactMatch.suppressed ? null : exactMatch;
    }
  }

  const globalMatch = manuals.find((e) => e.date === dateIso && e.drawName === "*");
  if (globalMatch) {
    return globalMatch.suppressed ? null : globalMatch;
  }

  if (isAutoPresetHolidaysEnabled()) {
    const preset = getPresetHolidayForDate(dateIso);
    if (preset) {
      return {
        id: `preset_${dateIso}`,
        date: dateIso,
        drawName: "*",
        type: "HOLIDAY",
        label: preset.label,
        source: "preset_holiday",
        createdAt: 0,
      };
    }
  }

  return null;
};

export const isDrawSkippedOnDate = (
  dateInput: Date | string | number,
  drawName?: string | null
): boolean => {
  return getDrawException(dateInput, drawName) !== null;
};

export const upsertDrawException = (params: {
  date: Date | string | number;
  drawName: string;
  type: DrawExceptionType;
  label: string;
}): DrawException => {
  const dateIso = toCanonicalIsoDate(params.date);
  const cleanScope =
    !params.drawName || params.drawName.trim() === "*" || params.drawName.trim().toUpperCase() === "ALL"
      ? "*"
      : params.drawName.trim();
  const normScope = cleanScope === "*" ? "*" : normalizeDrawName(cleanScope);

  const items = readStoredManualExceptions().filter((e) => {
    const eNorm = e.drawName === "*" ? "*" : normalizeDrawName(e.drawName);
    return !(e.date === dateIso && eNorm === normScope);
  });

  const record: DrawException = {
    id: buildDeterministicExceptionId(dateIso, cleanScope),
    date: dateIso,
    drawName: cleanScope,
    type: params.type,
    label: params.label.trim() || (params.type === "HOLIDAY" ? "Jour férié" : "Tirage annulé"),
    source: "manual_admin",
    suppressed: false,
    createdAt: Date.now(),
  };

  items.push(record);
  writeStoredManualExceptions(items);
  return record;
};

/**
 * Désactive un jour férié fixe automatique pour une date (et optionnellement un tirage) si le tirage a bien eu lieu.
 */
export const suppressPresetHoliday = (
  dateInput: Date | string | number,
  drawName: string = "*"
): DrawException => {
  const dateIso = toCanonicalIsoDate(dateInput);
  const cleanScope =
    !drawName || drawName.trim() === "*" || drawName.trim().toUpperCase() === "ALL"
      ? "*"
      : drawName.trim();
  const normScope = cleanScope === "*" ? "*" : normalizeDrawName(cleanScope);

  const items = readStoredManualExceptions().filter((e) => {
    const eNorm = e.drawName === "*" ? "*" : normalizeDrawName(e.drawName);
    return !(e.date === dateIso && eNorm === normScope);
  });

  const preset = getPresetHolidayForDate(dateIso);
  const record: DrawException = {
    id: buildDeterministicExceptionId(dateIso, cleanScope),
    date: dateIso,
    drawName: cleanScope,
    type: "HOLIDAY",
    label: preset ? `${preset.label} (maintenu exceptionnellement)` : "Jour maintenu",
    source: "manual_admin",
    suppressed: true,
    createdAt: Date.now(),
  };

  items.push(record);
  writeStoredManualExceptions(items);
  return record;
};

export const removeDrawException = (id: string): void => {
  const items = readStoredManualExceptions().filter((e) => e.id !== id);
  writeStoredManualExceptions(items);
};

/**
 * Liste consolidée (prédéfinis actifs + déclarations manuelles non supprimées) pour une année donnée.
 */
export const listEffectiveExceptionsForYear = (
  year: number,
  drawNameFilter?: string | null
): DrawException[] => {
  const manuals = readStoredManualExceptions();
  const filterNorm =
    drawNameFilter && drawNameFilter !== "ALL" && drawNameFilter !== "*"
      ? normalizeDrawName(drawNameFilter)
      : null;

  const result: DrawException[] = [];

  if (isAutoPresetHolidaysEnabled()) {
    for (const h of CI_FIXED_HOLIDAYS) {
      const dateIso = `${year}-${h.mmdd}`;
      const globalOverride = manuals.find((e) => e.date === dateIso && e.drawName === "*");
      if (globalOverride) continue;
      if (filterNorm) {
        const specificOverride = manuals.find(
          (e) => e.date === dateIso && e.drawName !== "*" && normalizeDrawName(e.drawName) === filterNorm
        );
        if (specificOverride) continue;
      }
      result.push({
        id: `preset_${dateIso}`,
        date: dateIso,
        drawName: "*",
        type: "HOLIDAY",
        label: h.label,
        source: "preset_holiday",
        createdAt: 0,
      });
    }
  }

  for (const m of manuals) {
    if (!m.date.startsWith(`${year}-`) || m.suppressed) continue;
    if (filterNorm && m.drawName !== "*" && normalizeDrawName(m.drawName) !== filterNorm) {
      continue;
    }
    result.push(m);
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Détermine la date ISO de référence pour un jour de semaine ('Lundi'...'Dimanche') :
 * - Aujourd'hui si `dayName` correspond au jour courant
 * - Sinon la prochaine occurrence à venir (dans les 1..6 jours suivants)
 */
export const getWeekdayReferenceDateIso = (
  dayName: string,
  now: Date = new Date()
): string => {
  const currentDayIdx = now.getDay();
  const targetDayIdx = DAYS_FR.findIndex(
    (d) => d.toLowerCase() === dayName.trim().toLowerCase()
  );
  if (targetDayIdx === -1) return toCanonicalIsoDate(now);
  const deltaDays = (targetDayIdx - currentDayIdx + 7) % 7;
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + deltaDays, 12, 0, 0, 0);
  return toCanonicalIsoDate(target);
};

/**
 * Recherche le prochain créneau de tirage actif en sautant automatiquement
 * tout créneau marqué comme jour férié ou tirage annulé.
 */
export const findNextActiveScheduledSlot = (
  schedule: Record<string, Record<string, string>> = DRAW_SCHEDULE,
  fromDate: Date = new Date(),
  maxLookaheadDays: number = 14
): NextActiveScheduledSlot | null => {
  const skippedSlots: SkippedDrawSlot[] = [];
  const nowMs = fromDate.getTime();

  for (let dayOffset = 0; dayOffset <= maxLookaheadDays; dayOffset++) {
    const candidateDate = new Date(
      fromDate.getFullYear(),
      fromDate.getMonth(),
      fromDate.getDate() + dayOffset,
      0,
      0,
      0,
      0
    );
    const dayName = DAYS_FR[candidateDate.getDay()];
    const daySchedule = schedule[dayName];
    if (!daySchedule) continue;

    const dateIso = toCanonicalIsoDate(candidateDate);
    const times = Object.keys(daySchedule).sort((a, b) => {
      const [h1, m1] = a.split(":").map(Number);
      const [h2, m2] = b.split(":").map(Number);
      return h1 * 60 + m1 - (h2 * 60 + m2);
    });

    for (const time of times) {
      const [h, m] = time.split(":").map(Number);
      const slotDt = new Date(
        candidateDate.getFullYear(),
        candidateDate.getMonth(),
        candidateDate.getDate(),
        h,
        m,
        0,
        0
      );
      if (slotDt.getTime() <= nowMs) continue;

      const drawName = daySchedule[time];
      const exception = getDrawException(dateIso, drawName);
      if (exception) {
        skippedSlots.push({
          day: dayName,
          time,
          name: drawName,
          dateIso,
          exception,
        });
        continue;
      }

      return {
        day: dayName,
        time,
        name: drawName,
        dateIso,
        targetTimestamp: slotDt.getTime(),
        skippedSlots,
      };
    }
  }

  return null;
};

/**
 * Retourne les occurrences planifiées (jour de semaine + heure) pour un nom de tirage.
 */
export const getScheduledWeekdaysForDraw = (
  drawName: string
): Array<{ dayIndex: number; dayName: string; time: string }> => {
  const norm = normalizeDrawName(drawName);
  const matches: Array<{ dayIndex: number; dayName: string; time: string }> = [];
  Object.entries(DRAW_SCHEDULE).forEach(([dayName, slots]) => {
    const dayIndex = DAYS_FR.findIndex((d) => d === dayName);
    if (dayIndex === -1) return;
    Object.entries(slots).forEach(([time, name]) => {
      if (normalizeDrawName(name) === norm) {
        matches.push({ dayIndex, dayName, time });
      }
    });
  });
  return matches;
};

/**
 * Audite les occurrences attendues d'un tirage sur une fenêtre glissante
 * en distinguant les absences documentées (jour férié / annulé) des trous inexpliqués,
 * SANS jamais injecter de faux résultat dans l'historique statistique (AGENTS.md).
 */
export const analyzeMissingExpectedDraws = (
  drawName: string,
  history: DrawResult[],
  lookbackDays: number = 90,
  now: Date = new Date()
): MissingDrawAnalysis => {
  const documentedSkips: DocumentedSkipItem[] = [];
  const unexplainedMissingDates: UnexplainedMissingDateItem[] = [];

  const scheduledSlots = getScheduledWeekdaysForDraw(drawName);
  const recordedIsos = new Set<string>();
  const parsedTimestamps: number[] = [];

  for (const r of history) {
    if (!r?.date) continue;
    const d = parseDateSafely(r.date);
    if (!isNaN(d.getTime())) {
      const iso = toCanonicalIsoDate(d);
      recordedIsos.add(iso);
      parsedTimestamps.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime());
    }
  }

  const maxTs = parsedTimestamps.length > 0 ? Math.max(...parsedTimestamps) : null;
  const minTs = parsedTimestamps.length > 0 ? Math.min(...parsedTimestamps) : null;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const todayNoonTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).getTime();

  const rawLastGapDays =
    maxTs !== null ? Math.max(0, Math.floor((todayNoonTs - maxTs) / DAY_MS)) : null;

  if (scheduledSlots.length === 0 || minTs === null) {
    return {
      documentedSkips,
      unexplainedMissingDates,
      rawLastGapDays,
      effectiveLastGapDays: rawLastGapDays,
    };
  }

  const lookbackStartTs = todayNoonTs - Math.max(1, lookbackDays) * DAY_MS;
  const effectiveStartTs = Math.max(minTs, lookbackStartTs);

  for (let ts = effectiveStartTs; ts <= todayNoonTs; ts += DAY_MS) {
    const cursor = new Date(ts);
    const slot = scheduledSlots.find((s) => s.dayIndex === cursor.getDay());
    if (!slot) continue;

    // Pour aujourd'hui, attendre la publication (+45 min après l'heure du tirage)
    if (ts === todayNoonTs) {
      const [h, m] = slot.time.split(":").map(Number);
      const publishCutoff = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        h,
        m + 45,
        0,
        0
      ).getTime();
      if (now.getTime() < publishCutoff) continue;
    }

    const dateIso = toCanonicalIsoDate(cursor);
    if (recordedIsos.has(dateIso)) continue;

    const ex = getDrawException(dateIso, drawName);
    if (ex) {
      documentedSkips.push({
        dateIso,
        frDate: toFrenchDate(dateIso),
        label: ex.label,
        type: ex.type,
        source: ex.source,
      });
    } else {
      unexplainedMissingDates.push({
        dateIso,
        frDate: toFrenchDate(dateIso),
      });
    }
  }

  // Calcul de l'écart effectif depuis le dernier tirage réel en excluant les jours couverts
  // par une exception documentée depuis maxTs
  let effectiveLastGapDays = rawLastGapDays;
  if (rawLastGapDays !== null && maxTs !== null) {
    const lastIso = toCanonicalIsoDate(new Date(maxTs));
    const recentSkipsAfterLast = documentedSkips.filter((s) => s.dateIso > lastIso);
    if (recentSkipsAfterLast.length > 0 && unexplainedMissingDates.filter((u) => u.dateIso > lastIso).length === 0) {
      // Aucun tirage manquant inexpliqué depuis le dernier résultat : tout retard apparent vient d'un jour férié/annulé
      effectiveLastGapDays = Math.min(rawLastGapDays, Math.max(0, rawLastGapDays - recentSkipsAfterLast.length * 7));
    }
  }

  return {
    documentedSkips: documentedSkips.sort((a, b) => b.dateIso.localeCompare(a.dateIso)),
    unexplainedMissingDates: unexplainedMissingDates.sort((a, b) => b.dateIso.localeCompare(a.dateIso)),
    rawLastGapDays,
    effectiveLastGapDays,
  };
};

export interface DbDrawCancellationRow {
  draw_name: string;
  date: string;
  reason?: string | null;
  source?: string | null;
  created_at?: string | null;
}

const DB_CANCELLATIONS_COOLDOWN_MS = 5 * 60 * 1000;
let lastDbCancellationsSyncTs = 0;

/**
 * Fusionne de manière déterministe et idempotente les annulations/fériés stockés en base (`draw_cancellations`)
 * avec le registre local, en donnant toujours la priorité aux surcharges locales `manual_admin`.
 */
export const mergeDbDrawCancellations = (
  rows: DbDrawCancellationRow[],
  cutoffIso?: string
): { addedOrUpdated: number; removed: number } => {
  const existing = readStoredManualExceptions();

  // Conserver toutes les surcharges locales `manual_admin` + les entrées DB antérieures à la fenêtre rafraîchie
  const preserved: DrawException[] = [];
  const manualKeys = new Set<string>();
  const oldDbMap = new Map<string, DrawException>();

  for (const item of existing) {
    const isDbSynced = item.source === "db_auto" || item.source === "db_manual";
    const normScope = item.drawName === "*" ? "*" : normalizeDrawName(item.drawName);
    const key = `${item.date}|${normScope}`;

    if (!isDbSynced) {
      preserved.push(item);
      manualKeys.add(key);
    } else if (cutoffIso && item.date < cutoffIso) {
      preserved.push(item);
    } else {
      oldDbMap.set(key, item);
    }
  }

  const nextDbItems: DrawException[] = [];
  const seenNextKeys = new Set<string>();
  let addedOrUpdated = 0;

  for (const row of rows) {
    if (!row?.date || !row?.draw_name) continue;
    const dateIso = toCanonicalIsoDate(row.date);
    const cleanScope =
      row.draw_name.trim() === "*" || row.draw_name.trim().toUpperCase() === "ALL"
        ? "*"
        : row.draw_name.trim();
    const normScope = cleanScope === "*" ? "*" : normalizeDrawName(cleanScope);
    const key = `${dateIso}|${normScope}`;

    if (manualKeys.has(key) || seenNextKeys.has(key)) continue;
    seenNextKeys.add(key);

    const dbSource: DrawExceptionSource = row.source === "manual" ? "db_manual" : "db_auto";
    const reason = (row.reason || "").trim();
    const inferredType: DrawExceptionType = /f[eé]ri[eé]|holiday/i.test(reason) ? "HOLIDAY" : "CANCELLED";
    const label =
      reason ||
      (dbSource === "db_auto"
        ? "Tirage absent du site officiel (annulation détectée)"
        : "Tirage annulé (Serveur)");

    const createdMs = row.created_at ? Date.parse(row.created_at) : NaN;
    const nextItem: DrawException = {
      id: buildDeterministicExceptionId(dateIso, cleanScope),
      date: dateIso,
      drawName: cleanScope,
      type: inferredType,
      label,
      source: dbSource,
      suppressed: false,
      createdAt: Number.isFinite(createdMs) ? createdMs : 0,
    };

    const prev = oldDbMap.get(key);
    if (!prev || prev.label !== nextItem.label || prev.source !== nextItem.source || prev.type !== nextItem.type) {
      addedOrUpdated++;
    }
    nextDbItems.push(nextItem);
  }

  let removed = 0;
  for (const oldKey of oldDbMap.keys()) {
    if (!seenNextKeys.has(oldKey)) removed++;
  }

  if (addedOrUpdated > 0 || removed > 0) {
    writeStoredManualExceptions([...preserved, ...nextDbItems]);
  }

  return { addedOrUpdated, removed };
};

/**
 * Synchronise le registre local des jours fériés / tirages annulés depuis la table Supabase `draw_cancellations`.
 */
export const syncDrawCancellationsFromDb = async (
  force: boolean = false,
  lookbackDays: number = 180
): Promise<{ synced: number; removed: number }> => {
  if (!isSupabaseConfigured()) return { synced: 0, removed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, removed: 0 };

  const now = Date.now();
  if (!force && now - lastDbCancellationsSyncTs < DB_CANCELLATIONS_COOLDOWN_MS) {
    return { synced: 0, removed: 0 };
  }
  lastDbCancellationsSyncTs = now;

  try {
    const cutoffIso = toCanonicalIsoDate(new Date(now - Math.max(7, lookbackDays) * 86400000));
    const { data, error } = await supabase
      .from("draw_cancellations")
      .select("draw_name,date,reason,source,created_at")
      .gte("date", cutoffIso)
      .order("date", { ascending: false })
      .limit(500);

    if (error || !Array.isArray(data)) {
      return { synced: 0, removed: 0 };
    }

    const res = mergeDbDrawCancellations(data as DbDrawCancellationRow[], cutoffIso);
    return { synced: res.addedOrUpdated, removed: res.removed };
  } catch {
    return { synced: 0, removed: 0 };
  }
};

