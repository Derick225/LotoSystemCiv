
import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ask-oracle", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Clé API Gemini manquante côté serveur." });
      }

      const { task } = req.body;
      
      if (!task) {
        return res.status(400).json({ error: "Paramètre 'task' manquant." });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      let prompt = "";
      if (task === 'analyze') {
        const { drawName, history } = req.body;
        if (!history || !Array.isArray(history)) return res.status(400).json({ error: "Historique invalide pour l'analyse." });

        prompt = `
          Tu es un expert en analyse statistique de loterie. Analyse les tirages suivants pour le jeu "${drawName || 'Inconnu'}".
          Historique récent: ${JSON.stringify(history)}
          
          Fournis une réponse au format JSON strict avec la structure suivante :
          {
            "logicalAnalysis": "Analyse textuelle détaillée des tendances...",
            "patternType": "Nom du pattern identifié (ex: Retour à la moyenne)",
            "nextSequence": "Estimation de la prochaine séquence probable",
            "anomalies": ["Liste des anomalies détectées"],
            "strategicAdvice": "Conseil stratégique pour le prochain jeu",
            "suggestedFocus": [Numéros à surveiller],
            "intuitionScore": Score de confiance (0-100)
          }
        `;
      } else if (task === 'optimize_weights') {
        const { drawName, history } = req.body;
        if (!history || !Array.isArray(history)) return res.status(400).json({ error: "Historique invalide pour l'optimisation." });

        prompt = `
          En te basant sur l'historique fourni pour "${drawName || 'Inconnu'}", suggère des poids optimaux pour les algorithmes de prédiction suivants :
          Frequency, Gap, Markov, Spectral, LSTM, Poisson.
          La somme des poids doit être égale à 1.0.
          
          Historique: ${JSON.stringify(history)}

          Réponds uniquement avec un objet JSON :
          {
            "frequency": 0.x,
            "gap": 0.x,
            "markov": 0.x,
            "spectral": 0.x,
            "lstm": 0.x,
            "poisson": 0.x
          }
        `;
      } else if (task === 'python_kernel') {
        const { drawName, dataset, modelType, computedContext } = req.body;
        prompt = `
          Tu es un Data Scientist Expert spécialisé en modélisation stochastique pour loterie.
          
          CONTEXTE:
          Jeu: "${drawName || 'Inconnu'}"
          Modèle: ${modelType || 'Générique'}
          Données calculées (Client): ${JSON.stringify(computedContext || {})}
          
          TACHE:
          1. Génère un script Python (fictif/éducatif) qui aurait pu produire ces résultats.
          2. Interprète les résultats (P-Value, Vecteurs) pour donner un insight stratégique.
          3. Simule une sortie console (stdout) réaliste pour ce script.

          Réponds uniquement avec un objet JSON :
          {
            "script": "Code python...",
            "stdout": ["Ligne 1", "Ligne 2"...],
            "insight": "Analyse stratégique courte..."
          }
        `;
      } else if (task === 'chat') {
        const { userInput, currentContext, history: chatHistory } = req.body;
        prompt = `
          Tu es "Apex", une IA tactique de haut niveau pour l'analyse de loterie.
          Ton ton est professionnel, précis, cyber-futuriste mais utile.
          
          CONTEXTE ACTUEL:
          ${JSON.stringify(currentContext || {})}

          HISTORIQUE CONVERSATION:
          ${JSON.stringify(chatHistory || [])}

          DERNIER MESSAGE UTILISATEUR:
          "${userInput}"

          Réponds à l'utilisateur en tant qu'Apex. Sois concis (max 3 phrases sauf si demande complexe).
          Réponds uniquement avec un objet JSON :
          {
            "response": "Ta réponse ici..."
          }
        `;
      } else {
        return res.status(400).json({ error: `Tâche inconnue: ${task}` });
      }

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const text = response.text;
      if (!text) throw new Error("Réponse vide de l'IA");

      const jsonResponse = JSON.parse(text);
      res.json(jsonResponse);

    } catch (error: any) {
      console.error("Erreur Oracle:", error);
      res.status(500).json({ error: error.message || "Erreur interne de l'Oracle." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
