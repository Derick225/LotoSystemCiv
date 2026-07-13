
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Résolution universelle __dirname pour ESM (dev) et CJS (build)
const _filename = typeof __filename !== 'undefined' ? __filename : (typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '');
const _dirname = typeof __dirname !== 'undefined' ? __dirname : (_filename ? path.dirname(_filename) : process.cwd());

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API direct Gemini Hybrid Weight Generation
  let aiClient: any = null;
  const getGeminiClient = () => {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("La clé API GEMINI_API_KEY n'est pas configurée.");
      }
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  };

  app.post("/api/gemini/hybrid-prediction", async (req, res) => {
    try {
      const { drawName, history, regime, hurst, entropy } = req.body;

      if (!drawName || !history || !Array.isArray(history)) {
        return res.status(400).json({ error: "Paramètres 'drawName' et 'history' requis." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(412).json({
          error: "GEMINI_NOT_CONFIGURED",
          message: "La clé API Gemini n'est pas configurée dans les secrets."
        });
      }

      const ai = getGeminiClient();
      const prompt = `En tant qu'expert en stochastique appliquée et théorie du chaos pour les loteries 5/90 (notamment ${drawName}), votre mission est de configurer optimalement les poids de notre ensemble d'algorithmes mathématiques de prédiction.

Données du tirage actuel :
- Jeu : ${drawName}
- Régime global détecté : ${regime || "Indéterminé"}
- Exposant de Hurst calculé : ${hurst !== undefined ? hurst : "0.5"}
- Entropie de Shannon : ${entropy !== undefined ? entropy : "Inconnue"}

Historique récent (les 15 derniers tirages) :
${JSON.stringify(history.slice(0, 15).map(h => ({ date: h.date, gagnants: h.gagnants })), null, 2)}

Liste des 19 algorithmes disponibles pour lesquels vous devez attribuer des poids relatifs continus (de 0.1 à 10.0) :
1. frequency (analyse classique de fréquence de sortie)
2. gap (analyse d'écarts de sortie)
3. spectral (transformation de Fourier spectrale)
4. markov (chaînes de transition markoviennes de premier ordre)
5. bayes (loi bayésienne de probabilités a posteriori)
6. momentum (vitesse locale de sortie)
7. affinity (indices d'affinités de co-occurrence de paires)
8. spatial (topologie et géométrie des numéros sur la grille)
9. temporal (processus de Hawkes spatio-temporel)
10. fractal (analyse multi-fractale des séries de tirages)
11. shadow (densité spectrale de probabilités fantômes/ombres)
12. network (réseau neuronal de corrélation temporelle)
13. echo_state (réseau à état d'écho de réservoir)
14. gap_sequence (séquence continue d'écarts)
15. derived_neighbor (corrélation par voisinage dérivé)
16. gap_pattern (motifs géométriques des écarts)
17. sequence_pattern (motifs de séquences récurrentes)
18. gap_cadence (rythme et cadence harmonique des écarts)
19. gap_trend (tendance de dérive locale)

Ajustez les poids de manière différentiable et continue selon l'exposant de Hurst et l'entropie. Par exemple, si le régime est chaotique et Hurst est bas (< 0.5, régime anti-persistant), augmentez les poids des algorithmes de transition (markov, bayes, shadow, fractal) et réduisez la fréquence linéaire. Si Hurst est élevé (> 0.5, régime persistant), favorisez la tendance et la cadence (gap_trend, gap_cadence, frequency, momentum).

Générez la meilleure configuration de poids dans le schéma JSON spécifié.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              weights: {
                type: "OBJECT",
                properties: {
                  frequency: { type: "NUMBER" },
                  gap: { type: "NUMBER" },
                  spectral: { type: "NUMBER" },
                  markov: { type: "NUMBER" },
                  bayes: { type: "NUMBER" },
                  momentum: { type: "NUMBER" },
                  affinity: { type: "NUMBER" },
                  spatial: { type: "NUMBER" },
                  temporal: { type: "NUMBER" },
                  fractal: { type: "NUMBER" },
                  shadow: { type: "NUMBER" },
                  network: { type: "NUMBER" },
                  echo_state: { type: "NUMBER" },
                  gap_sequence: { type: "NUMBER" },
                  derived_neighbor: { type: "NUMBER" },
                  gap_pattern: { type: "NUMBER" },
                  sequence_pattern: { type: "NUMBER" },
                  gap_cadence: { type: "NUMBER" },
                  gap_trend: { type: "NUMBER" }
                },
                required: [
                  "frequency", "gap", "spectral", "markov", "bayes", "momentum", "affinity",
                  "spatial", "temporal", "fractal", "shadow", "network", "echo_state",
                  "gap_sequence", "derived_neighbor", "gap_pattern", "sequence_pattern",
                  "gap_cadence", "gap_trend"
                ]
              },
              rationale: { type: "STRING" },
              confidence: { type: "NUMBER" },
              strategicAdvice: { type: "STRING" }
            },
            required: ["weights", "rationale", "confidence", "strategicAdvice"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Réponse vide de Gemini");
      }

      const parsedData = JSON.parse(responseText.trim());
      return res.json(parsedData);

    } catch (e: any) {
      console.error("Gemini Hybrid Weights Error:", e);
      return res.status(500).json({
        error: "GEMINI_ERROR",
        message: e.message || "Erreur interne lors de la consultation d'IA."
      });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(_dirname, "dist")));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(_dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
