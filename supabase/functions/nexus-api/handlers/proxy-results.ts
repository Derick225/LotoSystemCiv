import { z } from "zod";
import { corsHeaders } from "../../_shared/cors.ts";
import {
  LOTOBONHEUR_API_URL,
  formatFrenchMonthParam,
  normalizeMonthParam,
  parseLotobonheurResponse,
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

    const allDraws: ParsedOfficialDraw[] = [];
    const allDays = new Set<string>();
    const allUnknown = new Set<string>();
    const httpErrors: Array<{ month: string; status: number | string }> = [];
    const rawByMonth: Record<string, unknown> = {};
    let skippedInvalidCount = 0;

    for (const monthParam of targetMonths) {
      const targetUrl = `${LOTOBONHEUR_API_URL}?month=${encodeURIComponent(monthParam)}`;
      const fetchResponse = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (NexusEngine/12.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!fetchResponse.ok) {
        httpErrors.push({ month: monthParam, status: fetchResponse.status });
        continue;
      }

      const remoteData = await fetchResponse.json().catch(() => null);
      if (!remoteData) {
        httpErrors.push({ month: monthParam, status: "INVALID_JSON" });
        continue;
      }

      if (includeRaw) {
        rawByMonth[monthParam] = remoteData;
      }

      const parsed = parseLotobonheurResponse(remoteData, {
        targetDrawName: drawName,
        fallbackYear: now.getFullYear(),
      });

      allDraws.push(...parsed.rows);
      parsed.dayBlocks.forEach((d) => allDays.add(d));
      parsed.unknown.forEach((u) => allUnknown.add(u));
      skippedInvalidCount += parsed.skippedInvalidCount;
    }

    allDraws.sort((a, b) => b.date.localeCompare(a.date));

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
