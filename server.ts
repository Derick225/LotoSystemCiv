
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';

dotenv.config();

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
