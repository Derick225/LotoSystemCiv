import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleHybridPrediction(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { drawName, history, regime, hurst, entropy } = await req.json();

    if (!drawName || !history || !Array.isArray(history)) {
      return new Response(JSON.stringify({ error: "Paramètres 'drawName' et 'history' requis." }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "GEMINI_NOT_CONFIGURED",
        message: "La clé API Gemini n'est pas configurée dans les secrets."
      }), {
        status: 412,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // --- CONSIGNES STRICTES DE NON-INVENTION DES MÉTRIQUES ---
    const prompt = `En tant qu'expert en stochastique appliquée, théorie de la mesure et cybernétique pour les loteries 5/90 (notamment ${drawName}), votre rôle est de configurer optimalement les poids de notre ensemble d'algorithmes mathématiques de prédiction.

Données du tirage actuel (CALCULÉES EMPIRIQUEMENT PAR LE CŒUR STATISTIQUE LOCAL) :
- Jeu : ${drawName}
- Régime thermodynamique global détecté : ${regime || "Indéterminé"}
- Exposant de Hurst : ${hurst !== undefined ? hurst : "0.5"}
- Entropie de Shannon : ${entropy !== undefined ? entropy : "Inconnue"}

Historique récent (les 15 derniers tirages réels) :
${JSON.stringify(history.slice(0, 15).map((h: any) => ({ date: h.date, gagnants: h.gagnants })), null, 2)}

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

DIRECTIVES DE QUANTIFICATION ET DE NARRATION (NON NÉGOCIABLES) :
1. RIGUEUR DES MÉTRIQUES : Le champ 'rationale' et 'strategicAdvice' doivent s'appuyer UNIQUEMENT et EXCLUSIVEMENT sur les indicateurs chiffrés locaux fournis ci-dessus (Exposant de Hurst, Entropie de Shannon). Il vous est STRICTEMENT INTERDIT d'inventer, d'estimer ou d'halluciner d'autres métriques spéculatives non calculées par notre moteur.
2. CONTINUITÉ ET CYBERNÉTIQUE : Ajustez les poids de façon différentiable et continue. Si l'exposant de Hurst est bas (H < 0.5, régime anti-persistant), augmentez les poids des algorithmes de transition (markov, bayes, shadow, fractal) et réduisez la fréquence linéaire. Si Hurst est élevé (H > 0.5, régime persistant), favorisez la tendance et la cadence (gap_trend, gap_cadence, frequency, momentum).
3. EXPLICATION SCIENTIFIQUE : Évitez toute métaphore ésotérique, jargon marketing ou discours flou. Utilisez un ton académique, rigoureux et précis centré sur la dynamique des systèmes chaotiques et les transitions de phase stochastiques.

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

    return new Response(JSON.stringify(parsedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error("Erreur dans hybrid-prediction:", error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
