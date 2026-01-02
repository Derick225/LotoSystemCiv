
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "@google/genai";

declare const Deno: any;
declare const process: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageBase64 } = await req.json();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: "Extrais la date, les 5 numéros gagnants et les 5 numéros machine du ticket." }
        ]
      },
      config: {
        systemInstruction: "OCR Mode. Réponds uniquement en JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            gagnants: { type: Type.ARRAY, items: { type: Type.INTEGER } },
            machine: { type: Type.ARRAY, items: { type: Type.INTEGER } }
          }
        }
      }
    });

    return new Response(response.text, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
