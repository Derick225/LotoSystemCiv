
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@0.1.1";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageBase64 } = await req.json();
    const apiKey = Deno.env.get('API_KEY');
    if (!apiKey) throw new Error("API_KEY not configured");

    const ai = new GoogleGenAI({ apiKey });

    // Modèle Vision Performant
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', 
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: "Analyse cette image de ticket de loto ou d'écran de résultats. Extrais la date, les 5 numéros gagnants et si présents, les 5 numéros machine." }
        ]
      },
      config: {
        systemInstruction: "OCR Mode. Réponds UNIQUEMENT avec un JSON valide respectant le schéma.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Format DD/MM/YYYY" },
            gagnants: { type: Type.ARRAY, items: { type: Type.INTEGER } },
            machine: { type: Type.ARRAY, items: { type: Type.INTEGER } }
          },
          required: ["gagnants"]
        }
      }
    });

    return new Response(response.text, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
