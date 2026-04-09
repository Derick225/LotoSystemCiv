import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60, // 60 seconds max duration
};

async function generateWithFallback(genAI: any, primaryModel: string, params: any) {
    const fallbackModel = "gemini-3.1-flash-preview";
    const config = { ...params.config };

    try {
        console.log(`Executing task with model: ${primaryModel}`);
        return await genAI.models.generateContent({ ...params, model: primaryModel, config });
    } catch (e: any) {
        console.error(`Error with ${primaryModel}:`, e.message);
        
        if (primaryModel !== fallbackModel) {
            console.warn(`Falling back to ${fallbackModel}...`);
            try {
                return await genAI.models.generateContent({ ...params, model: fallbackModel, config });
            } catch (e2: any) {
                console.error(`Error with ${fallbackModel}:`, e2.message);
                throw e2;
            }
        } else {
            throw e;
        }
    }
}

export default async function handler(req: Request) {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase configuration");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const body = await req.json();
        const { snapshotId, drawResultId } = body;

        if (!snapshotId || !drawResultId) {
            throw new Error("Missing snapshotId or drawResultId");
        }

        // 1. Fetch Snapshot
        const { data: snapshot, error: snapshotError } = await supabase
            .from('prediction_snapshots')
            .select('*')
            .eq('id', snapshotId)
            .single();

        if (snapshotError || !snapshot) {
            throw new Error(`Snapshot not found: ${snapshotError?.message}`);
        }

        // 2. Fetch Draw Result
        const { data: drawResult, error: drawError } = await supabase
            .from('draw_results')
            .select('*')
            .eq('id', drawResultId)
            .single();

        if (drawError || !drawResult) {
            throw new Error(`Draw result not found: ${drawError?.message}`);
        }

        // 3. Calculate Near Misses
        const predicted = snapshot.predicted_numbers;
        const actual = drawResult.numbers;
        
        const nearMisses = [];
        let exactMatches = 0;

        for (const p of predicted) {
            if (actual.includes(p)) {
                exactMatches++;
            } else {
                // Check for +/- 1 near miss
                if (actual.includes(p - 1) || actual.includes(p + 1)) {
                    nearMisses.push(p);
                }
            }
        }

        // 3.5 CACHE CHECK: Did we already analyze this exact prediction for this draw?
        const { data: cachedReports } = await supabase
            .from('forensic_reports')
            .select('report_data, prediction_snapshots!inner(predicted_numbers)')
            .eq('draw_result_id', drawResultId);

        let reportContent = null;
        let usedCache = false;

        if (cachedReports && cachedReports.length > 0) {
            const match = cachedReports.find((r: any) => 
                JSON.stringify(r.prediction_snapshots.predicted_numbers) === JSON.stringify(predicted)
            );
            if (match) {
                console.log("Cache HIT: Reusing identical prediction report.");
                reportContent = match.report_data;
                usedCache = true;
            }
        }

        // 4. Generate Report via Gemini (Only if no cache)
        if (!reportContent) {
            const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error("Missing API_KEY for Gemini");
            }

            const ai = new GoogleGenAI({ apiKey });

            const prompt = `
            En tant qu'expert en analyse de données de loterie et en algorithmes prédictifs, réalise une autopsie de cette prédiction.

            Prédiction : ${predicted.join(', ')}
            Résultat réel : ${actual.join(', ')}
            Correspondances exactes : ${exactMatches}
            Near Misses (+/- 1) : ${nearMisses.join(', ') || 'Aucun'}

            ADN de la décision (Poids des algorithmes, incluant potentiellement le transfert machine) :
            ${JSON.stringify(snapshot.decision_dna, null, 2)}

            Génère un rapport post-mortem structuré en JSON avec les clés suivantes :
            - "analysis": Une analyse textuelle de ce qui a fonctionné ou échoué.
            - "recommendations": Des recommandations pour ajuster les poids algorithmiques.
            - "score": Une note sur 100 évaluant la qualité de la prédiction (même si elle n'a pas gagné, la structure était-elle bonne ?).
            - "bias_detected": Un biais potentiel détecté dans l'ADN de la décision (ex: "Trop de poids sur la fréquence").
            `;

            const response = await generateWithFallback(ai, "gemini-3.1-pro-preview", {
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            analysis: { type: Type.STRING },
                            recommendations: { type: Type.STRING },
                            score: { type: Type.NUMBER },
                            bias_detected: { type: Type.STRING }
                        },
                        required: ["analysis", "recommendations", "score", "bias_detected"]
                    }
                }
            });

            reportContent = JSON.parse(response.text || "{}");
        }

        // 5. Save Report
        const { data: report, error: reportError } = await supabase
            .from('forensic_reports')
            .insert({
                prediction_id: snapshot.id,
                draw_result_id: drawResult.id,
                user_id: snapshot.user_id,
                report_data: reportContent,
                ai_model_used: usedCache ? 'cache-hit' : 'gemini-3.1-pro-preview'
            })
            .select()
            .single();

        if (reportError) {
            throw new Error(`Failed to save report: ${reportError.message}`);
        }

        // 6. Update Snapshot Status
        await supabase
            .from('prediction_snapshots')
            .update({ status: 'AUTOPSIED' })
            .eq('id', snapshot.id);

        return new Response(JSON.stringify({ success: true, report }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error("Forensic Autopsy Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
