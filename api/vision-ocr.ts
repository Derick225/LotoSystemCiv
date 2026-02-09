import { GoogleGenAI, Type } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageBase64 } = await req.json();
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API_KEY non configurée.");

    const ai = new GoogleGenAI({ apiKey });

    // Utilisation de gemini-2.5-flash-image : Le modèle spécialisé "Nano Banana" pour la vision rapide
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', 
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: "ANALYSE OCR LOTO. Extrais les données de ce ticket ou résultat. Format strict: Date (YYYY-MM-DD), 5 Numéros Gagnants, 5 Numéros Machine (si présents). Si illisible, renvoie des tableaux vides." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Format YYYY-MM-DD" },
            gagnants: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "Les 5 numéros principaux" },
            machine: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "Les 5 numéros machine (optionnel)" }
          },
          required: ["gagnants", "date"]
        }
      }
    });

    // Extraction directe de .text (propriété getter)
    const jsonStr = response.text;
    if (!jsonStr) throw new Error("Réponse OCR vide.");

    return new Response(jsonStr, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("[Vision API Error]", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}