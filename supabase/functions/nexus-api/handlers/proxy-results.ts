import { z } from "zod";
import { corsHeaders } from "../../_shared/cors.ts";
import {
  fetchLotobonheurMonthDraws,
  formatFrenchMonthParam,
  normalizeMonthParam,
  type ParsedOfficialDraw,
} from "../../_shared/lotobonheur-parser.ts";

const ProxyRequestSchema = z.object({
  month: z.string().optional(), // Ex: "Avril 2026" ou "2026-04"
  months: z.array(z.string()).max(6).optional(),
  monthsBack: z.number().int().min(0).max(6).optional(),
  drawName: z.string().optional(),
  includeRaw: z.boolean().optional(),
});

export async function handleProxyResults(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = reqBody || (await req.json().catch(() => ({})));
    const validation = ProxyRequestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({ success: false, error: "Payload invalide pour proxy-results" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { month, months, monthsBack, drawName, includeRaw } = validation.data;
    const now = new Date();

    let targetMonths: string[];
    if (months && months.length > 0) {
      targetMonths = [...new Set(months.map((m) => normalizeMonthParam(m, now)))];
    } else if (month) {
      targetMonths = [normalizeMonthParam(month, now)];
    } else {
      const backCount = typeof monthsBack === "number" ? monthsBack : 0;
      targetMonths = [];
      for (let i = 0; i <= backCount; i++) {
        targetMonths.push(formatFrenchMonthParam(new Date(now.getFullYear(), now.getMonth() - i, 1)));
      }
    }

    const drawsByKey = new Map<string, ParsedOfficialDraw>();
    const allDays = new Set<string>();
    const allUnknown = new Set<string>();
    const httpErrors: Array<{ month: string; drawType?: string; status: number | string }> = [];
    const rawByMonth: Record<string, unknown> = {};
    let skippedInvalidCount = 0;

    for (const monthParam of targetMonths) {
      const parsed = await fetchLotobonheurMonthDraws({
        monthLabel: monthParam,
        targetDrawName: drawName,
        fallbackYear: now.getFullYear(),
        timeoutMs: 20000,
        captureRaw: Boolean(includeRaw),
      });

      for (const r of parsed.rows) {
        const key = `${r.draw_name}|${r.date}`;
        const prev = drawsByKey.get(key);
        if (!prev || (!prev.machine && r.machine)) {
          drawsByKey.set(key, r);
        }
      }
      parsed.dayBlocks.forEach((d) => allDays.add(d));
      parsed.unknown.forEach((u) => allUnknown.add(u));
      skippedInvalidCount += parsed.skippedInvalidCount;
      httpErrors.push(...parsed.httpErrors);
      if (includeRaw && parsed.rawPayloads) {
        rawByMonth[monthParam] = parsed.rawPayloads;
      }
    }

    const allDraws = Array.from(drawsByKey.values()).sort((a, b) => b.date.localeCompare(a.date));

    return new Response(
      JSON.stringify({
        success: allDraws.length > 0 || httpErrors.length === 0,
        source: "lotobonheur-api",
        months: targetMonths,
        count: allDraws.length,
        draws: allDraws.map((d) => ({
          drawName: d.draw_name,
          date: d.date,
          gagnants: d.gagnants,
          machine: d.machine || [],
          version: d.version,
        })),
        dayBlocks: Array.from(allDays).sort(),
        unknownDrawNames: Array.from(allUnknown),
        skippedInvalidCount,
        httpErrors,
        ...(includeRaw ? { raw: rawByMonth } : {}),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: allDraws.length === 0 && httpErrors.length > 0 ? 502 : 200,
      }
    );
  } catch (error: any) {
    console.error("Proxy Results Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Erreur inconnue proxy-results",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
