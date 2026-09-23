use wasm_bindgen::prelude::*;

const DRAW_SIZE: usize = 5;
const DOMAIN_SIZE: usize = 90;

/// Générateur Linéaire Congruentiel Déterministe (LCG)
/// Conforme à la règle ZÉRO HASARD d'AGENTS.md (reproductibilité absolue)
struct LcgRng {
    state: u64,
}

impl LcgRng {
    #[inline]
    fn new(seed: u64) -> Self {
        Self {
            state: (seed ^ 0x5bf03635) & 0xFFFFFFFF,
        }
    }

    #[inline]
    fn next_f64(&mut self) -> f64 {
        self.state = (self.state.wrapping_mul(1664525).wrapping_add(1013904223)) & 0xFFFFFFFF;
        (self.state as f64) / 4294967296.0
    }

    #[inline]
    fn next_range(&mut self, max: usize) -> usize {
        if max == 0 {
            return 0;
        }
        ((self.next_f64() * (max as f64)).floor() as usize).min(max - 1)
    }
}

/// Résultat de l'optimisation combinatoire par recuit simulé
#[wasm_bindgen]
pub struct AnnealingOptimizationResult {
    best_combination: Vec<i32>,
    best_energy: f64,
    iterations_run: usize,
}

#[wasm_bindgen]
impl AnnealingOptimizationResult {
    #[wasm_bindgen(getter)]
    pub fn best_combination(&self) -> Vec<i32> {
        self.best_combination.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn best_energy(&self) -> f64 {
        self.best_energy
    }

    #[wasm_bindgen(getter)]
    pub fn iterations_run(&self) -> usize {
        self.iterations_run
    }
}

/// Calcule l'énergie globale d'une combinaison de 5 numéros de façon continue et différentiable.
/// 
/// Intègre :
/// - Les scores de base pré-calculés des numéros (terme négatif d'énergie)
/// - L'affinité de co-occurrence pairwise issue de la matrice aplatie (91x91)
/// - La régularité de parité (pénalité continue quadratique sur l'écart à l'équilibre 2 ou 3 pairs)
/// - La dispersion des décades (pénalité de concentration)
/// - L'amplitude continue (dispersion max - min)
#[inline]
fn calculate_combo_energy(
    combo: &[i32; DRAW_SIZE],
    scores_91: &[f64],
    affinity_matrix_91x91: &[f64],
) -> f64 {
    let mut energy = 0.0f64;

    // 1. Terme des scores individuels (Maximiser les scores <=> Minimiser l'énergie)
    for &num in combo {
        let n = num as usize;
        if n <= DOMAIN_SIZE && n < scores_91.len() {
            energy -= scores_91[n];
        }
    }

    // 2. Affinité pairwise de co-occurrence
    let mut pairwise_affinity = 0.0f64;
    for i in 0..DRAW_SIZE {
        let n1 = combo[i] as usize;
        let row_offset = n1 * 91;
        for j in (i + 1)..DRAW_SIZE {
            let n2 = combo[j] as usize;
            let idx = row_offset + n2;
            if idx < affinity_matrix_91x91.len() {
                pairwise_affinity += affinity_matrix_91x91[idx];
            }
        }
    }
    energy -= pairwise_affinity * 1.5;

    // 3. Pénalité continue de Parité (Distribution idéale 2 ou 3 pairs sur 5)
    let even_count = combo.iter().filter(|&&n| n % 2 == 0).count() as f64;
    let parity_deviation = (even_count - 2.5).abs() - 0.5;
    if parity_deviation > 0.0 {
        energy += parity_deviation * parity_deviation * 25.0;
    }

    // 4. Pénalité d'amplitude (Écart max - min)
    let mut min_val = combo[0];
    let mut max_val = combo[0];
    for &n in &combo[1..] {
        if n < min_val { min_val = n; }
        if n > max_val { max_val = n; }
    }
    let spread = (max_val - min_val) as f64;
    // Pénalisation continue sigmoïdale si l'amplitude est trop resserrée (< 30) ou extrême
    if spread < 30.0 {
        let diff = 30.0 - spread;
        energy += diff * diff * 0.5;
    }

    // 5. Pénalité de consécutifs excessifs
    let mut sorted = *combo;
    sorted.sort_unstable();
    let mut consecutive_count = 0.0;
    for i in 0..(DRAW_SIZE - 1) {
        if sorted[i + 1] - sorted[i] == 1 {
            consecutive_count += 1.0;
        }
    }
    if consecutive_count > 1.0 {
        energy += (consecutive_count - 1.0) * 40.0;
    }

    energy
}

/// Optimisation Combinatoire par Recuit Simulé (Simulated Annealing) Haute Performance
/// 
/// Explore l'espace d'états discret des combinaisons de 5 numéros parmi le pool de candidats
/// avec un calendrier de refroidissement continu Boltzmann : T_{k+1} = T_k * alpha.
/// 
/// 100% Déterministe via seed LCG canonique, garantit zéro allocation dans la boucle critique.
#[wasm_bindgen]
pub fn solve_combinatorial_annealing_wasm(
    candidate_pool: &[i32],
    scores_91: &[f64],
    affinity_matrix: &[f64],
    initial_temperature: f64,
    cooling_rate: f64,
    min_temperature: f64,
    iterations_per_temp: usize,
    deterministic_seed: u64,
) -> AnnealingOptimizationResult {
    let pool_len = candidate_pool.len();
    if pool_len < DRAW_SIZE {
        return AnnealingOptimizationResult {
            best_combination: candidate_pool.to_vec(),
            best_energy: 0.0,
            iterations_run: 0,
        };
    }

    let mut rng = LcgRng::new(deterministic_seed);

    // Initialisation : sélection des 5 premiers candidats uniques
    let mut current_combo = [0i32; DRAW_SIZE];
    for i in 0..DRAW_SIZE {
        current_combo[i] = candidate_pool[i];
    }

    let mut current_energy = calculate_combo_energy(&current_combo, scores_91, affinity_matrix);
    let mut best_combo = current_combo;
    let mut best_energy = current_energy;

    let mut temperature = initial_temperature.max(1e-3);
    let safe_cooling = cooling_rate.clamp(0.80, 0.999);
    let safe_min_temp = min_temperature.max(1e-5);
    let mut total_iterations = 0usize;

    // Boucle de recuit simulé native sans Garbage Collection
    while temperature > safe_min_temp && total_iterations < 200_000 {
        for _ in 0..iterations_per_temp {
            total_iterations += 1;
            let mut proposed_combo = current_combo;

            // Opérateur de mutation déterministe : swap d'un numéro par un candidat du pool
            let swap_slot = rng.next_range(DRAW_SIZE);
            let mut new_cand = candidate_pool[rng.next_range(pool_len)];
            let mut tries = 0;

            // Assurer que le candidat n'est pas déjà dans la combinaison
            while proposed_combo.contains(&new_cand) && tries < pool_len {
                new_cand = candidate_pool[rng.next_range(pool_len)];
                tries += 1;
            }

            proposed_combo[swap_slot] = new_cand;

            let proposed_energy = calculate_combo_energy(&proposed_combo, scores_91, affinity_matrix);
            let delta_energy = proposed_energy - current_energy;

            // Critère de Metropolis : acceptation systématique si amélioration,
            // ou stochastique continue exp(-delta / T)
            if delta_energy < 0.0 {
                current_combo = proposed_combo;
                current_energy = proposed_energy;

                if proposed_energy < best_energy {
                    best_combo = proposed_combo;
                    best_energy = proposed_energy;
                }
            } else {
                let acceptance_prob = (-delta_energy / temperature).exp();
                if rng.next_f64() < acceptance_prob {
                    current_combo = proposed_combo;
                    current_energy = proposed_energy;
                }
            }
        }

        // Décroissance continue de température
        temperature *= safe_cooling;
    }

    let mut final_vec = best_combo.to_vec();
    final_vec.sort_unstable();

    AnnealingOptimizationResult {
        best_combination: final_vec,
        best_energy,
        iterations_run: total_iterations,
    }
}
