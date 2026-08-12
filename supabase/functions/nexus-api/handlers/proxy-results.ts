import { z } from "zod";
import { corsHeaders } from "../../_shared/cors.ts"

const ProxyRequestSchema = z.object({
    month: z.string().optional() // Ex: "Octobre 2023"
});

export async function handleProxyResults(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = reqBody || await req.json();
    const validation = ProxyRequestSchema.safeParse(body);
    
    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid payload" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { month } = validation.data;
    
    // Exemple d'un payload form-data attendu par le serveur distant (lotobonheur)
    const formData = new FormData();
    formData.append('date', month || "");

    const fetchResponse = await fetch("https://www.lonaci.net/resultats", {
        method: "POST",
        body: formData
        // Note: L'URL exacte et le format dépendent du fournisseur officiel ivoirien.
        // Ce proxy redirige la requête sans subir les contraintes CORS du navigateur internet.
    });

    if (!fetchResponse.ok) {
         throw new Error(`Erreur réseau du fournisseur distant: ${fetchResponse.statusText}`);
    }
    
    // Si la réponse est en JSON :
    // const remoteData = await fetchResponse.json();
    
    // Si la réponse de LOTOBONHEUR est en texte/HTML qu'il faut parser, il faudrait
    // extraire les résultats via Regex ou Deno DOM ici avant de renvoyer le JSON au frontend.
    // Pour cet exemple, on simule une réponse JSON structurée si l'API est construite ainsi :
    const remoteData = await fetchResponse.json().catch(() => ({ 
        success: false, 
        message: "L'API source n'a pas renvoyé de JSON valide. Scraping HTML requis." 
    }));

    return new Response(JSON.stringify(remoteData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    });

  } catch (error: any) {
    console.error("Proxy Results Error:", error)
    return new Response(JSON.stringify({ success: false, error: error?.message || "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
