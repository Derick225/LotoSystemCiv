
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";

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

    // Utilisation de gemini-3.1-flash-preview pour l'analyse multimodale (OCR)
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-preview', 
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: "Extrais la date (format DD/MM/YYYY) et les 5 numéros gagnants (et les 5 numéros machine si présents) de ce ticket de loto ou écran de résultats. Retourne un JSON strict." }
        ]
      },
      config: {
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
