import React, { useMemo, useState, useEffect } from "react";
import type { DrawResult } from "../types";
import {
  DRAW_EXCEPTIONS_UPDATED_EVENT,
  getDrawException,
  toCanonicalIsoDate,
  type DrawException,
} from "../services/drawScheduleExceptionService";

interface HeatmapCalendarProps {
  history: DrawResult[];
  drawName?: string;
}

export const HeatmapCalendar: React.FC<HeatmapCalendarProps> = ({
  history = [],
  drawName,
}) => {
  const [exceptionsVersion, setExceptionsVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setExceptionsVersion((v) => v + 1);
    window.addEventListener(DRAW_EXCEPTIONS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(DRAW_EXCEPTIONS_UPDATED_EVENT, handler);
  }, []);

  const data = useMemo(() => {
    const today = new Date();
    const yearAgo = new Date();
    yearAgo.setFullYear(today.getFullYear() - 1);

    // Map: Date String (YYYY-MM-DD) -> Count/Sum
    const map = new Map<
      string,
      { count: number; sum: number; draws: number[] }
    >();

    const safeHistory = Array.isArray(history) ? history : [];
    safeHistory.forEach((h) => {
      if (!h || !h.date) return;
      const isoDate = toCanonicalIsoDate(h.date);
      const gagnants = Array.isArray(h.gagnants) ? h.gagnants : [];
      const current = map.get(isoDate) || { count: 0, sum: 0, draws: [] };
      map.set(isoDate, {
        count: current.count + 1,
        sum: current.sum + gagnants.reduce((a, b) => a + b, 0),
        draws: gagnants,
      });
    });

    // Génération de la grille (52 semaines x 7 jours)
    const days: Array<{
      date: Date;
      iso: string;
      value: number;
      hasDraw: boolean;
      exception: DrawException | null;
    }> = [];
    const cursor = new Date(yearAgo);
    // Alignement au Dimanche précédent
    cursor.setDate(cursor.getDate() - cursor.getDay());

    while (cursor <= today) {
      const iso = toCanonicalIsoDate(cursor);
      const match = map.get(iso);
      const exception = !match ? getDrawException(iso, drawName || "*") : null;

      days.push({
        date: new Date(cursor),
        iso,
        value: match ? match.sum : 0,
        hasDraw: !!match,
        exception,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [history, drawName, exceptionsVersion]);

  const getColor = (
    val: number,
    hasDraw: boolean,
    exception: DrawException | null
  ) => {
    if (!hasDraw) {
      if (exception?.type === "HOLIDAY") {
        return "bg-amber-400/80 dark:bg-amber-500/60 border border-amber-500";
      }
      if (exception?.type === "CANCELLED" || exception?.type === "POSTPONED") {
        return "bg-rose-400/70 dark:bg-rose-500/50 border border-rose-500";
      }
      return "bg-slate-100 dark:bg-slate-800";
    }
    if (val > 250) return "bg-rose-500";
    if (val > 200) return "bg-indigo-500";
    if (val > 150) return "bg-emerald-500";
    return "bg-slate-400";
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="flex justify-between items-end mb-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Densité Annuelle (Somme Σ)
          </h4>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-slate-400">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-amber-400 rounded-sm border border-amber-500"></div>
              <span>Férié</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-rose-400 rounded-sm border border-rose-500"></div>
              <span>Annulé</span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span>Faible</span>
            <div className="w-2 h-2 bg-emerald-500 rounded-sm"></div>
            <div className="w-2 h-2 bg-indigo-500 rounded-sm"></div>
            <div className="w-2 h-2 bg-rose-500 rounded-sm"></div>
            <span>Élevée</span>
          </div>
        </div>

        <div className="grid grid-rows-7 grid-flow-col gap-1 w-fit">
          {data.map((day, i) => {
            const titleSuffix = day.hasDraw
              ? `Somme ${day.value}`
              : day.exception
              ? `${day.exception.type === "HOLIDAY" ? "Jour férié" : "Tirage annulé"} : ${day.exception.label}`
              : "Aucun tirage";

            return (
              <div
                key={i}
                className={`w-3 h-3 rounded-sm ${getColor(day.value, day.hasDraw, day.exception)} transition-all hover:scale-125 cursor-help relative group`}
                title={`${day.date.toLocaleDateString("fr-FR")} : ${titleSuffix}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
