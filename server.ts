
import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for large requests (e.g., OCR images)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Dynamically load API routes from the /api folder
  const apiDir = path.join(__dirname, 'api');
  if (fs.existsSync(apiDir)) {
    const apiFiles = fs.readdirSync(apiDir).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    
    for (const file of apiFiles) {
      const routeName = file.replace(/\.(ts|js)$/, '');
      const routePath = `/api/${routeName}`;
      
      app.all(routePath, async (req, res) => {
        try {
          // Import the handler dynamically
          const modulePath = path.join(apiDir, file);
          // Use file:// protocol for dynamic import in Windows/ESM compatibility
          const module = await import(`file://${modulePath}`);
          const handler = module.default;

          if (typeof handler !== 'function') {
            return res.status(500).json({ error: `No default export found in ${file}` });
          }

          // Convert Express req to Web Request
          const protocol = req.protocol || 'http';
          const host = req.get('host') || 'localhost';
          const url = new URL(req.originalUrl || req.url, `${protocol}://${host}`);
          
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
              value.forEach(v => headers.append(key, v));
            } else if (value) {
              headers.append(key, value);
            }
          }

          const requestInit: RequestInit = {
            method: req.method,
            headers,
          };

          if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            requestInit.body = JSON.stringify(req.body);
            headers.set('Content-Type', 'application/json');
          }

          const webRequest = new Request(url.toString(), requestInit);

          // Call the Vercel Edge Function handler
          const webResponse: Response = await handler(webRequest);

          // Convert Web Response back to Express res
          res.status(webResponse.status);
          
          webResponse.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });

          const responseText = await webResponse.text();
          try {
            // Try to parse and send as JSON if possible
            const json = JSON.parse(responseText);
            res.json(json);
          } catch {
            // Otherwise send as raw text
            res.send(responseText);
          }

        } catch (error: any) {
          console.error(`Error executing API route ${routePath}:`, error);
          res.status(500).json({ error: error.message || "Internal Server Error" });
        }
      });
      console.log(`Loaded API route: ${routePath}`);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
