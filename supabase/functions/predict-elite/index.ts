import { createClient } from 'supabase';
import { corsHeaders } from "../_shared/cors.ts";
import { predict } from "./predictionEngine.bundle.js";
import { z } from "zod";

const DrawResultSchema = z.object({
  date: z.string().optional().nullable(),
  gagnants: z.array(z.number().int().min(1).max(90)).length(5),
  machine: z.union([z.array(z.number().int().min(1).max(90)), z.string()]).optional().nullable(),
});

const PredictionRequestSchema = z.object({
  drawName: z.string(),
  history: z.array(DrawResultSchema).min(12, "Dataset de moins de 12 tirages insuffisant pour une inférence robuste."),
  weights: z.record(z.number()).optional(),
  symbioticContext: z.object({
    spatialHotZones: z.array(z.number()).optional()
  }).optional(),
  metrics: z.any().optional()
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = PredictionRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(JSON.stringify({ error: "Invalid Request payload", details: validation.error.format() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const { history, weights, drawName, symbioticContext, metrics } = validation.data;

    // --- ÉTAPE 1 : NETTOYAGE ---
    const parseMachineWinners = (machineVal: any): number[] => {
      if (!machineVal) return [];
      if (Array.isArray(machineVal)) {
        return machineVal.map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 90);
      }
      if (typeof machineVal === 'string') {
        return machineVal.split(/[\s,;-]+/)
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n) && n >= 1 && n <= 90);
      }
      return [];
    };

    let cleanedHistory = history.filter(d => d && d.gagnants && d.gagnants.length === 5);
    cleanedHistory = cleanedHistory.map(d => {
      const uniqGagnants = Array.from(new Set(d.gagnants)).sort((a, b) => a - b);
      const mach = parseMachineWinners(d.machine);
      return {
        ...d,
        gagnants: uniqGagnants,
        machine: mach.length > 0 ? mach : undefined
      };
    }).filter(d => d.gagnants.length === 5);

    const seenDraws = new Set<string>();
    cleanedHistory = cleanedHistory.filter(d => {
      const key = d.gagnants.join(',');
      if (seenDraws.has(key)) return false;
      seenDraws.add(key);
      return true;
    });

    if (cleanedHistory.length < 12) {
      return new Response(JSON.stringify({ error: "Dataset insuffisant après nettoyage des doublons (minimum 12 tirages valides requis)." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    console.log(`[EDGE INFERENCE] Inférence LotoPro Platinum pour ${drawName} sur ${cleanedHistory.length} tirages.`);

    // --- ÉTAPE 2 : CHARGEMENT DE LA MÉMOIRE FORENSIQUE ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    
    let preloadedForensicReports: any[] = [];
    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const { data: forensicData, error: forensicError } = await supabase
          .from('forensic_reports')
          .select('id, draw_name, draw_date, report_data, created_at')
          .eq('draw_name', drawName)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (!forensicError && forensicData) {
          preloadedForensicReports = forensicData.map(row => ({
            id: row.id,
            drawName: row.draw_name,
            drawDate: row.draw_date,
            timestamp: row.created_at,
            ...row.report_data
          }));
          console.log(`[EDGE DATABASE] ${preloadedForensicReports.length} rapports forensiques chargés pour ${drawName}.`);
        }
      } catch (err) {
        console.warn("[EDGE] Échec d'accès à la base pour les rapports forensiques, continuation autonome:", err);
      }
    }

    // --- ÉTAPE 3 : APPEL DU MOTEUR DE PRÉDICTION UNIFIÉ ---
    const predictionResult = await predict(
      drawName,
      cleanedHistory,
      weights,
      symbioticContext,
      metrics,
      preloadedForensicReports
    );

    predictionResult.analysis = `Prédiction calculée via le supercalculateur Cloud Deno (Modèle Nexus v12.0). Alignement parfait de l'ADN algorithmique local-cloud (22 algorithmes unifiés).`;

    return new Response(JSON.stringify(predictionResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    const err = error as Error;
    console.error("[EDGE ERROR]", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown Error" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
