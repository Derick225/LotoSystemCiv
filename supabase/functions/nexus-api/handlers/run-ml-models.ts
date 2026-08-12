import { z } from "zod";
import { corsHeaders } from "../../_shared/cors.ts";
import { DrawResult } from "../../_shared/types.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const MLRequestSchema = z.object({
  model: z.enum(['aco', 'genetic', 'forest']),
  history: z.array(z.record(z.unknown())).optional(),
  drawName: z.string().optional(),
  config: z.record(z.unknown()).optional()
});

interface MLConfig {
    antsCount?: number;
    generations?: number;
    alpha?: number;
    beta?: number;
    rho?: number;
    q0?: number;
    biasTargets?: number[];
    [key: string]: unknown;
}

// ACO Implementation (Ant Colony Optimization)
const runACO = (history: DrawResult[], config: MLConfig = {}) => {
    if (history.length === 0) return { error: "Empty history" };
    
    const antsCount = config.antsCount || 40;
    const generations = config.generations || 50;
    const alpha = config.alpha || 1.5;
    const beta = config.beta || 2.0;
    const rho = config.rho || 0.1;
    const q0 = config.q0 || 0.9;
    const biasTargets = config.biasTargets || [];

    // Deterministic LCG
    let seed = history.length > 0 && history[0].date ? new Date(history[0].date).getTime() : 12345;
    const prng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    // Initialize pheromones
    const pheromones: number[][] = Array(91).fill(0).map(() => Array(91).fill(1.0));
    const heuristic: number[][] = Array(91).fill(0).map(() => Array(91).fill(1.0));

    // Calculate heuristic based on frequency and gaps
    const freq = new Array(91).fill(0);
    const lastSeen = new Array(91).fill(history.length);
    history.forEach((draw, idx) => {
        draw.gagnants.forEach(n => {
            freq[n]++;
            if (idx < lastSeen[n]) lastSeen[n] = idx;
        });
    });

    for (let i = 1; i <= 90; i++) {
        for (let j = 1; j <= 90; j++) {
            if (i !== j) {
                // Affinity heuristic
                const affinity = Math.exp(-Math.abs(freq[i] - freq[j]) / 10) * Math.exp(-Math.abs(lastSeen[i] - lastSeen[j]) / 5);
                heuristic[i][j] = affinity;
            }
        }
    }

    // Add bias
    biasTargets.forEach(target => {
        if (target >= 1 && target <= 90) {
            for (let i = 1; i <= 90; i++) {
                heuristic[i][target] *= 1.5;
                heuristic[target][i] *= 1.5;
            }
        }
    });

    let globalBestPath: number[] = [];
    let globalBestScore = -1;

    for (let gen = 0; gen < generations; gen++) {
        let localBestPath: number[] = [];
        let localBestScore = -1;
        const antPaths: number[][] = [];

        for (let ant = 0; ant < antsCount; ant++) {
            const path: number[] = [];
            const visited = new Set<number>();
            let current = Math.floor(prng() * 90) + 1;
            path.push(current);
            visited.add(current);

            for (let step = 1; step < 5; step++) {
                // Determine next node
                const unvisited = [];
                for (let n = 1; n <= 90; n++) {
                    if (!visited.has(n)) unvisited.push(n);
                }

                if (prng() < q0) {
                    // Exploitation
                    let bestNext = -1;
                    let bestVal = -1;
                    for (const n of unvisited) {
                        const val = Math.pow(pheromones[current][n], alpha) * Math.pow(heuristic[current][n], beta);
                        if (val > bestVal) {
                            bestVal = val;
                            bestNext = n;
                        }
                    }
                    current = bestNext;
                } else {
                    // Exploration
                    let sum = 0;
                    const probs = unvisited.map(n => {
                        const val = Math.pow(pheromones[current][n], alpha) * Math.pow(heuristic[current][n], beta);
                        sum += val;
                        return { n, val };
                    });
                    
                    let rnd = prng() * sum;
                    for (const p of probs) {
                        rnd -= p.val;
                        if (rnd <= 0) {
                            current = p.n;
                            break;
                        }
                    }
                }
                path.push(current);
                visited.add(current);
            }

            antPaths.push(path);
            
            // Score path
            let score = 0;
            path.forEach(n => { score += freq[n]; });
            if (score > localBestScore) {
                localBestScore = score;
                localBestPath = [...path];
            }
        }

        if (localBestScore > globalBestScore) {
            globalBestScore = localBestScore;
            globalBestPath = [...localBestPath];
        }

        // Global pheromone update
        for (let i = 1; i <= 90; i++) {
            for (let j = 1; j <= 90; j++) {
                pheromones[i][j] *= (1.0 - rho);
            }
        }
        
        // Deposit pheromones on best path
        for (let i = 0; i < globalBestPath.length - 1; i++) {
            const u = globalBestPath[i];
            const v = globalBestPath[i+1];
            const deposit = 1.0 / (1.0 + Math.exp(-globalBestScore / 10));
            pheromones[u][v] += rho * deposit;
            pheromones[v][u] += rho * deposit;
        }
    }

    return { 
        type: 'aco', 
        bestPath: { 
            numbers: globalBestPath.sort((a, b) => a - b), 
            pheromoneDensity: 1.0 - Math.exp(-globalBestScore / 100), 
            confidence: Math.min(99, 50 + (globalBestScore / 10)) 
        } 
    };
};

// Genetic Algorithm Implementation
const runGenetic = (history: DrawResult[], config: MLConfig = {}) => {
    if (history.length === 0) return { error: "Empty history" };
    
    const popSize = 50;
    const generations = config.generations || 100;
    
    // Deterministic LCG
    let seed = history.length > 0 && history[0].date ? new Date(history[0].date).getTime() + 999 : 54321;
    const prng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    const evaluateFitness = (chromosome: number[]) => {
        let fitness = 0;
        // Simple fitness based on how often these pairs appeared together
        for (let i = 0; i < chromosome.length; i++) {
            for (let j = i + 1; j < chromosome.length; j++) {
                let coOccurrences = 0;
                history.forEach(d => {
                    if (d.gagnants.includes(chromosome[i]) && d.gagnants.includes(chromosome[j])) {
                        coOccurrences++;
                    }
                });
                fitness += coOccurrences;
            }
        }
        return fitness;
    };

    let population = Array.from({ length: popSize }, () => {
        const chrom = new Set<number>();
        while (chrom.size < 5) chrom.add(Math.floor(prng() * 90) + 1);
        return Array.from(chrom).sort((a, b) => a - b);
    });

    let bestChromosome: number[] = [];
    let bestFitness = -1;

    for (let gen = 0; gen < generations; gen++) {
        const scored = population.map(chrom => ({ chrom, fitness: evaluateFitness(chrom) }));
        scored.sort((a, b) => b.fitness - a.fitness);

        if (scored[0].fitness > bestFitness) {
            bestFitness = scored[0].fitness;
            bestChromosome = [...scored[0].chrom];
        }

        const nextPop = [scored[0].chrom, scored[1].chrom]; // Elitism

        while (nextPop.length < popSize) {
            // Tournament selection
            const t1 = scored[Math.floor(prng() * 10)];
            const t2 = scored[Math.floor(prng() * 10)];
            const parent1 = t1.fitness > t2.fitness ? t1.chrom : t2.chrom;
            
            const t3 = scored[Math.floor(prng() * 10)];
            const t4 = scored[Math.floor(prng() * 10)];
            const parent2 = t3.fitness > t4.fitness ? t3.chrom : t4.chrom;

            // Crossover
            const split = Math.floor(prng() * 4) + 1;
            const childSet = new Set(parent1.slice(0, split));
            let p2idx = 0;
            while (childSet.size < 5 && p2idx < 5) {
                childSet.add(parent2[p2idx++]);
            }
            while (childSet.size < 5) {
                childSet.add(Math.floor(prng() * 90) + 1);
            }
            
            const child = Array.from(childSet).slice(0, 5);
            
            // Mutation
            if (prng() < 0.1) {
                const mutIdx = Math.floor(prng() * 5);
                let newGene = Math.floor(prng() * 90) + 1;
                while (child.includes(newGene)) newGene = Math.floor(prng() * 90) + 1;
                child[mutIdx] = newGene;
            }
            
            nextPop.push(child.sort((a, b) => a - b));
        }
        population = nextPop;
    }

    return { 
        type: 'genetic', 
        bestChromosome: { 
            sequence: bestChromosome.sort((a, b) => a - b), 
            fitness: Math.min(0.99, bestFitness / 100), 
            generation: generations 
        } 
    };
};

export async function handleRunMlModels(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = reqBody || await req.json();
    const validation = MLRequestSchema.safeParse(body);
    
    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Payload invalide" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const { model, history: reqHistory, config, drawName } = validation.data;
    console.log(`[ML WORKER] Exécution du modèle : ${model} pour ${drawName || 'Unknown'}`);
    
    let history = reqHistory as unknown as DrawResult[];
    
    // Si l'historique n'est pas fourni, on tente de le récupérer depuis la base de données
    if (!history || history.length === 0) {
        if (!drawName) {
            throw new Error("L'historique ou le drawName doit être fourni");
        }
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !supabaseKey) throw new Error("Config Supabase manquante");
        
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await supabase
            .from('draw_results')
            .select('*')
            .eq('draw_name', drawName)
            .order('date', { ascending: false })
            .limit(100);
            
        if (error || !data) {
            throw new Error("Impossible de charger l'historique depuis la base de données");
        }
        history = data as unknown as DrawResult[];
    }
    
    let result;
    if (model === 'aco') result = runACO(history, config as MLConfig);
    else if (model === 'genetic') result = runGenetic(history, config as MLConfig);
    else result = { error: "Modèle non supporté pour l'instant" };

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    const err = error as Error;
    return new Response(JSON.stringify({ error: err.message || "Unknown Error" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
  }
}

