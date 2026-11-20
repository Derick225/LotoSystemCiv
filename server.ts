
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import {
  LOTOBONHEUR_API_URL,
  buildRecentFrenchMonths,
  normalizeMonthParam,
  parseLotobonheurResponse,
  type ParsedOfficialDraw,
} from "./src/shared/lotobonheurParser";

dotenv.config();

interface ResultsCacheEntry {
  expiresAt: number;
  payload: unknown;
}

const RESULTS_CACHE_TTL_MS = 60 * 1000;
const resultsApiCache = new Map<string, ResultsCacheEntry>();

async function fetchOfficialLotobonheurResults(options: {
  months: string[];
  drawName?: string;
  bypassCache?: boolean;
}) {
  const { months, drawName, bypassCache } = options;
  const cacheKey = `${months.join(',')}|${drawName || 'ALL'}`;

  if (!bypassCache) {
    const cached = resultsApiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload as {
        success: boolean;
        source: string;
        months: string[];
        count: number;
        draws: ParsedOfficialDraw[];
        dayBlocks: string[];
        unknownDrawNames: string[];
        skippedInvalidCount: number;
        httpErrors: Array<{ month: string; status: number | string }>;
        fetchedAt: string;
      };
    }
  }

  const allDraws: ParsedOfficialDraw[] = [];
  const allDays = new Set<string>();
  const allUnknown = new Set<string>();
  const httpErrors: Array<{ month: string; status: number | string }> = [];
  let skippedInvalidCount = 0;
  const nowYear = new Date().getFullYear();

  for (const monthParam of months) {
    try {
      const targetUrl = `${LOTOBONHEUR_API_URL}?month=${encodeURIComponent(monthParam)}`;
      const resp = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (NexusEngine/12.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        httpErrors.push({ month: monthParam, status: resp.status });
        continue;
      }
      const rawJson = await resp.json().catch(() => null);
      if (!rawJson) {
        httpErrors.push({ month: monthParam, status: "INVALID_JSON" });
        continue;
      }
      const parsed = parseLotobonheurResponse(rawJson, {
        targetDrawName: drawName,
        fallbackYear: nowYear,
      });
      allDraws.push(...parsed.draws);
      parsed.dayBlocks.forEach((d) => allDays.add(d));
      parsed.unknownDrawNames.forEach((u) => allUnknown.add(u));
      skippedInvalidCount += parsed.skippedInvalidCount;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      httpErrors.push({ month: monthParam, status: msg });
    }
  }

  allDraws.sort((a, b) => b.date.localeCompare(a.date));

  const payload = {
    success: allDraws.length > 0 || httpErrors.length === 0,
    source: "lotobonheur-api",
    months,
    count: allDraws.length,
    draws: allDraws,
    dayBlocks: Array.from(allDays).sort(),
    unknownDrawNames: Array.from(allUnknown),
    skippedInvalidCount,
    httpErrors,
    fetchedAt: new Date().toISOString(),
  };

  if (allDraws.length > 0 || httpErrors.length === 0) {
    resultsApiCache.set(cacheKey, {
      expiresAt: Date.now() + RESULTS_CACHE_TTL_MS,
      payload,
    });
  }

  return payload;
}

async function persistDrawsToSupabaseRest(draws: ParsedOfficialDraw[]): Promise<{ persisted: boolean; upserted: number; error?: string }> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/["']/g, "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/["']/g, "").trim();
  if (!supabaseUrl || !serviceKey || draws.length === 0) {
    return { persisted: false, upserted: 0 };
  }

  let upserted = 0;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < draws.length; i += 200) {
    const chunk = draws.slice(i, i + 200).map((d) => ({
      draw_name: d.drawName,
      date: d.date,
      gagnants: d.gagnants,
      machine: d.machine && d.machine.length === 5 ? d.machine : null,
      version: d.version || 1,
      updated_at: nowIso,
    }));

    const resp = await fetch(`${supabaseUrl}/rest/v1/draw_results?on_conflict=draw_name,date`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      return { persisted: false, upserted, error: errText };
    }
    const inserted = (await resp.json().catch(() => [])) as unknown[];
    upserted += Array.isArray(inserted) ? inserted.length : chunk.length;
  }

  return { persisted: true, upserted };
}

// Résolution universelle __dirname pour ESM (dev) et CJS (build)
const _filename = typeof __filename !== 'undefined' ? __filename : (typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '');
const _dirname = typeof __dirname !== 'undefined' ? __dirname : (_filename ? path.dirname(_filename) : process.cwd());

function parseCliPort(): number | null {
  const portIdx = process.argv.indexOf("--port");
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    const val = Number(process.argv[portIdx + 1]);
    if (!isNaN(val) && val > 0) return val;
  }
  const pIdx = process.argv.indexOf("-p");
  if (pIdx !== -1 && process.argv[pIdx + 1]) {
    const val = Number(process.argv[pIdx + 1]);
    if (!isNaN(val) && val > 0) return val;
  }
  return null;
}

function parseCliHost(): string | null {
  const hostIdx = process.argv.indexOf("--host");
  if (hostIdx !== -1 && process.argv[hostIdx + 1]) {
    return process.argv[hostIdx + 1];
  }
  const hIdx = process.argv.indexOf("-h");
  if (hIdx !== -1 && process.argv[hIdx + 1]) {
    return process.argv[hIdx + 1];
  }
  return null;
}

async function startServer() {
  const app = express();

  // CLI argument takes precedence (--port), then 3000 in dev (constraints), then PORT env var in prod
  const cliPort = parseCliPort();
  const PORT = cliPort ?? (process.env.NODE_ENV === "production" && process.env.PORT ? Number(process.env.PORT) : 3000);
  const HOST = parseCliHost() ?? process.env.HOST ?? "0.0.0.0";

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", port: PORT });
  });

  app.get("/api/results", async (req, res) => {
    try {
      const monthQuery = typeof req.query.month === "string" ? req.query.month.trim() : "";
      const monthsBackQuery = req.query.monthsBack !== undefined ? Number(req.query.monthsBack) : 1;
      const drawName = typeof req.query.drawName === "string" ? req.query.drawName.trim() : undefined;
      const limit = req.query.limit !== undefined ? Math.max(1, Math.min(2000, Number(req.query.limit) || 2000)) : 2000;
      const bypassCache = req.query.refresh === "1" || req.query.refresh === "true";

      const months = monthQuery
        ? monthQuery.split(",").map((m) => normalizeMonthParam(m)).filter(Boolean).slice(0, 6)
        : buildRecentFrenchMonths(Number.isFinite(monthsBackQuery) ? monthsBackQuery : 1);

      const result = await fetchOfficialLotobonheurResults({ months, drawName, bypassCache });
      const limitedDraws = result.draws.slice(0, limit);
      res.status(result.success ? 200 : 502).json({
        ...result,
        count: limitedDraws.length,
        totalAvailable: result.draws.length,
        draws: limitedDraws,
      });
    } catch (error: unknown) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erreur récupération API résultats",
      });
    }
  });

  app.post("/api/results/sync", async (req, res) => {
    try {
      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
      const drawName = typeof body.drawName === "string" ? body.drawName.trim() : undefined;
      const requestedMonths = Array.isArray(body.months) ? body.months.map(String) : [];
      const monthsBack = typeof body.monthsBack === "number" ? body.monthsBack : 1;
      const persist = body.persist !== false;

      const months = requestedMonths.length > 0
        ? requestedMonths.slice(0, 6).map((m) => normalizeMonthParam(m))
        : buildRecentFrenchMonths(monthsBack);

      const fetched = await fetchOfficialLotobonheurResults({
        months,
        drawName,
        bypassCache: true,
      });

      const dbRes = persist
        ? await persistDrawsToSupabaseRest(fetched.draws)
        : { persisted: false, upserted: 0 };

      res.status(fetched.success ? 200 : 502).json({
        ...fetched,
        persisted: dbRes.persisted,
        upserted: dbRes.upserted,
        persistError: dbRes.error,
      });
    } catch (error: unknown) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erreur synchronisation résultats",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false, // HMR désactivé pour éviter les conflits WebSocket
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(_dirname, "dist")));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(_dirname, "dist", "index.html"));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });

  server.on("error", (err: any) => {
    console.error("Server error:", err);
  });

  process.on("SIGTERM", () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

process.on("unhandledRejection", (reason) => {
  console.warn("Unhandled Rejection in server:", reason);
});

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
