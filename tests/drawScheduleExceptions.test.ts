import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDrawExceptionsStoreForTests,
  setAutoPresetHolidaysEnabled,
  isAutoPresetHolidaysEnabled,
  getDrawException,
  isDrawSkippedOnDate,
  upsertDrawException,
  suppressPresetHoliday,
  removeDrawException,
  findNextActiveScheduledSlot,
  analyzeMissingExpectedDraws,
  toCanonicalIsoDate,
} from "../src/services/drawScheduleExceptionService";
import { getPredictionResolutionStatus } from "../src/services/predictionHistoryService";
import { getNextScheduledDraw } from "../src/services/lotteryService";
import type { DrawResult, Prediction, PredictionHistoryItem } from "../src/types";

describe("Registre des Jours Fériés & Tirages Annulés", () => {
  beforeEach(() => {
    resetDrawExceptionsStoreForTests();
  });

  it("reconnaît les jours fériés fixes Côte d'Ivoire par défaut et permet de maintenir un tirage exceptionnel", () => {
    expect(isAutoPresetHolidaysEnabled()).toBe(true);
    const ex = getDrawException("2026-05-01", "Cash");
    expect(ex).not.toBeNull();
    expect(ex?.type).toBe("HOLIDAY");
    expect(ex?.label).toContain("Travail");
    expect(ex?.source).toBe("preset_holiday");

    // Maintenir exceptionnellement un seul tirage (ex: Cash) laisse les autres tirages du 1er Mai fériés
    suppressPresetHoliday("2026-05-01", "Cash");
    expect(getDrawException("2026-05-01", "Cash")).toBeNull();
    expect(isDrawSkippedOnDate("2026-05-01", "Cash")).toBe(false);
    expect(isDrawSkippedOnDate("2026-05-01", "Friday Bonanza")).toBe(true);

    // Désactivation globale des jours fériés automatiques
    setAutoPresetHolidaysEnabled(false);
    expect(isDrawSkippedOnDate("2026-08-07", "Wari")).toBe(false);
  });

  it("gère la priorité exacte : annulation tirage > journée globale > férié auto", () => {
    const cancelled = upsertDrawException({
      date: "16/03/2026",
      drawName: "Monday Special",
      type: "CANCELLED",
      label: "Incident technique LONACI",
    });

    expect(cancelled.date).toBe("2026-03-16");
    expect(isDrawSkippedOnDate("2026-03-16", "Monday Special")).toBe(true);
    expect(isDrawSkippedOnDate("2026-03-16", "Reveil")).toBe(false);

    // Suppression de l'exception manuelle
    removeDrawException(cancelled.id);
    expect(isDrawSkippedOnDate("2026-03-16", "Monday Special")).toBe(false);
  });

  it("saute les créneaux annulés et les journées fériées dans getNextScheduledDraw / findNextActiveScheduledSlot", () => {
    // 2026-05-01 est un Vendredi (Fête du Travail) : les 4 créneaux (10:00, 13:00, 16:00, 19:55) doivent être sautés
    // Samedi 2026-05-02 à 10:00 => 'Soutra' doit être sélectionné, sauf s'il est aussi annulé manuellement !
    const fridayMorning = new Date(2026, 4, 1, 8, 30, 0, 0);
    const nextAfterHoliday = getNextScheduledDraw(fridayMorning);
    expect(nextAfterHoliday).not.toBeNull();
    expect(nextAfterHoliday?.dateIso).toBe("2026-05-02");
    expect(nextAfterHoliday?.name).toBe("Soutra");
    expect(nextAfterHoliday?.time).toBe("10:00");
    expect(nextAfterHoliday?.skippedSlots.length).toBe(4);
    expect(nextAfterHoliday?.skippedSlots.every((s) => s.exception.type === "HOLIDAY")).toBe(true);

    // Annuler Soutra le samedi 2026-05-02 => doit sauter à Diamant 13:00
    upsertDrawException({
      date: "2026-05-02",
      drawName: "Soutra",
      type: "CANCELLED",
      label: "Annulé manuellement",
    });

    const nextAfterBoth = findNextActiveScheduledSlot(undefined, fridayMorning, 14);
    expect(nextAfterBoth?.dateIso).toBe("2026-05-02");
    expect(nextAfterBoth?.name).toBe("Diamant");
    expect(nextAfterBoth?.time).toBe("13:00");
    expect(nextAfterBoth?.skippedSlots.length).toBe(5);
  });

  it("distingue les absences documentées (férié/annulé) des trous inexpliqués sans fabriquer de faux résultats", () => {
    // Friday Bonanza a lieu tous les vendredis à 19:55
    // 2026-04-24 = Vendredi (présent)
    // 2026-05-01 = Vendredi (Fête du Travail -> férié documenté)
    // 2026-05-08 = Vendredi (manquant sans exception)
    // 2026-05-15 = Vendredi (présent)
    const history: DrawResult[] = [
      {
        id: "r1",
        drawName: "Friday Bonanza",
        date: "15/05/2026",
        gagnants: [3, 14, 27, 48, 72],
      },
      {
        id: "r0",
        drawName: "Friday Bonanza",
        date: "24/04/2026",
        gagnants: [5, 11, 33, 56, 88],
      },
    ];

    const historySnapshot = JSON.stringify(history);
    const analysis = analyzeMissingExpectedDraws(
      "Friday Bonanza",
      history,
      90,
      new Date(2026, 4, 16, 12, 0, 0)
    );

    // Zéro mutation ni injection de faux tirage dans l'historique (AGENTS.md)
    expect(JSON.stringify(history)).toBe(historySnapshot);

    expect(analysis.documentedSkips.map((d) => d.dateIso)).toContain("2026-05-01");
    expect(analysis.unexplainedMissingDates.map((d) => d.dateIso)).toEqual(["2026-05-08"]);

    // Maintenant on déclare 2026-05-08 comme annulé et on évalue au 2026-05-09 sans tirage après le 24/04
    const staleHistory: DrawResult[] = [history[1]];
    upsertDrawException({
      date: "2026-05-08",
      drawName: "Friday Bonanza",
      type: "CANCELLED",
      label: "Tirage annulé",
    });

    const adjusted = analyzeMissingExpectedDraws(
      "Friday Bonanza",
      staleHistory,
      90,
      new Date(2026, 4, 9, 12, 0, 0)
    );
    expect(adjusted.rawLastGapDays).toBe(15);
    expect(adjusted.unexplainedMissingDates.length).toBe(0);
    // 2 vendredis documentés sautés (01/05 + 08/05) -> aucune pénalité d'ancienneté inexpliquée
    expect(adjusted.effectiveLastGapDays).toBeLessThan(adjusted.rawLastGapDays!);
  });

  it("identifie le statut holiday/cancelled d'une prédiction dans le Forensic Log si aucun résultat n'est sorti", () => {
    const basePred: Prediction = {
      suggestedNumbers: [4, 12, 29, 55, 78],
      candidates: [4, 12, 29, 55, 78, 81],
      confidence: 65,
      analysis: "Test déterministe",
      breakdown: {},
      timestamp: new Date(2026, 4, 1, 9, 0, 0).getTime(), // 1er Mai 2026 (Fête du Travail) à 09h00
    };

    const item: PredictionHistoryItem = {
      id: "pred_holiday_1",
      timestamp: basePred.timestamp,
      drawName: "Cash", // Vendredi 10:00
      prediction: basePred,
      drawResultId: null,
    };

    const status = getPredictionResolutionStatus(item, []);
    expect(status.status).toBe("holiday");
    expect(status.targetDateIso).toBe(toCanonicalIsoDate(new Date(2026, 4, 1)));
    expect(status.exception?.label).toContain("Travail");
  });
});
