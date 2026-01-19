
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

    // Utilisation de 2.5 Flash pour une vision ultra-rapide et précise
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', 
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: "Agis comme un scanner de haute précision. Extrais : 1. La date (format YYYY-MM-DD), 2. Les 5 numéros gagnants, 3. Les 5 numéros machine. Retourne un JSON pur sans texte additionnel." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Date format YYYY-MM-DD" },
            gagnants: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "Exactement 5 numéros" },
            machine: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "Optionnel" }
          },
          required: ["gagnants", "date"]
        }
      }
    });

    return new Response(response.text, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
