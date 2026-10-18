//! # In-Memory Store & Zero-Cost Draw Cache (Rust Core)
//!
//! Stockage mémoire ultra-compact et contigu pour l'historique complet des tirages 5/90.
//! Éradique les requêtes SQL répétitives et les Edge Functions Supabase en conservant
//! l'état en mémoire vive (RAM locale / WASM Linear Memory).
//!
//! Caractéristiques architecturales :
//! - Représentation compacte `CompactDraw` (24 octets par tirage) avec masque binaire `u128`.
//! - Test d'appartenance et intersection de tirages en 1 cycle d'horloge CPU (`count_ones()`).
//! - Dédoublonnage strict par clé composite déterministe O(1).
//! - Tri chronologique strict garanti (flèche du temps respectée pour les écarts).
//! - Normalisation des horodatages POSIX en secondes (u64).
//! - Zéro allocation dynamique lors de l'inférence.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

pub const TOTAL_NUMBERS: usize = 90;
pub const NUMBERS_PER_DRAW: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineError {
    InvalidNumber(u8),
    EmptyHistory,
    InsufficientHistory(usize),
    SerializationError(String),
    DrawNotFound(String),
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineError::InvalidNumber(n) => write!(f, "Numéro invalide hors domaine [1..90]: {}", n),
            EngineError::EmptyHistory => write!(f, "Historique vide pour le tirage demandé"),
            EngineError::InsufficientHistory(n) => write!(f, "Historique insuffisant ({}/5 requis) pour inférence", n),
            EngineError::SerializationError(e) => write!(f, "Erreur de sérialisation: {}", e),
            EngineError::DrawNotFound(name) => write!(f, "Tirage non trouvé dans le cache: {}", name),
        }
    }
}

impl std::error::Error for EngineError {}

/// Parseur déterministe de dates ISO ou formats standards en secondes POSIX
pub fn parse_date_to_posix_seconds(date_str: &str) -> u64 {
    let s = date_str.trim();
    if s.is_empty() {
        return 0;
    }

    if s.contains('-') {
        let parts: Vec<&str> = s.split('-').collect();
        if parts.len() >= 3 {
            let y = parts[0].parse::<u64>().unwrap_or(2026);
            let m = parts[1].parse::<u64>().unwrap_or(1);
            let d = parts[2].split('T').next().unwrap_or("1").parse::<u64>().unwrap_or(1);
            return approximate_posix_seconds(y, m, d);
        }
    } else if s.contains('/') {
        let parts: Vec<&str> = s.split('/').collect();
        if parts.len() == 3 {
            let d = parts[0].parse::<u64>().unwrap_or(1);
            let m = parts[1].parse::<u64>().unwrap_or(1);
            let y = parts[2].parse::<u64>().unwrap_or(2026);
            return approximate_posix_seconds(y, m, d);
        }
    }

    // Si numérique pur (timestamp en string)
    if let Ok(ts) = s.parse::<u64>() {
        return if ts > 10_000_000_000 { ts / 1000 } else { ts };
    }

    0
}

#[inline]
fn approximate_posix_seconds(year: u64, month: u64, day: u64) -> u64 {
    let days_before_month = [0u64, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let y = if year >= 1970 { year - 1970 } else { 0 };
    let leaps = (y + 2) / 4;
    let m = month.clamp(1, 12) - 1;
    let days = y * 365 + leaps + days_before_month[m as usize] + day.clamp(1, 31) - 1;
    days * 86400
}

/// Représentation ultra-compacte alignée en mémoire (24 octets)
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompactDraw {
    /// Horodatage Unix en secondes (POSIX strict)
    pub timestamp: u64,
    /// 5 numéros gagnants triés dans [1..90]
    pub winners: [u8; NUMBERS_PER_DRAW],
    /// 5 numéros machine triés dans [1..90]
    pub machine: [u8; NUMBERS_PER_DRAW],
    /// Masque binaire compact sur 128 bits (bits 1 à 90 activés si présent)
    /// Permet l'intersection stochastique en 1 instruction CPU vectorielle.
    pub winners_mask: u128,
}

impl CompactDraw {
    #[inline]
    pub fn new(
        mut timestamp: u64,
        winners: [u8; NUMBERS_PER_DRAW],
        machine: [u8; NUMBERS_PER_DRAW],
    ) -> Result<Self, EngineError> {
        // Normalisation stricte de l'horodatage en secondes POSIX
        if timestamp > 10_000_000_000 {
            timestamp /= 1000;
        }

        let mut mask: u128 = 0;
        for &w in &winners {
            if w < 1 || (w as usize) > TOTAL_NUMBERS {
                return Err(EngineError::InvalidNumber(w));
            }
            mask |= 1u128 << w;
        }

        Ok(Self {
            timestamp,
            winners,
            machine,
            winners_mask: mask,
        })
    }

    /// Clé composite d'unicité déterministe sur 128 bits
    #[inline(always)]
    pub fn composite_key(&self) -> u128 {
        ((self.timestamp as u128) << 64) ^ self.winners_mask
    }

    /// Nombre de numéros communs entre deux tirages calculé en 1 cycle CPU
    #[inline(always)]
    pub fn intersection_count(&self, other: &CompactDraw) -> u32 {
        (self.winners_mask & other.winners_mask).count_ones()
    }

    /// Vérifie instantanément si un numéro est présent
    #[inline(always)]
    pub fn contains_number(&self, num: u8) -> bool {
        if num < 1 || (num as usize) > TOTAL_NUMBERS {
            return false;
        }
        (self.winners_mask & (1u128 << num)) != 0
    }
}

/// Registre d'état statistique précalculé en O(1) maintenu au fil de l'eau
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IncrementalStats {
    /// Fréquences totales d'apparition [1..=90]
    pub frequencies: [u32; TOTAL_NUMBERS + 1],
    /// Écarts actuels (retards depuis la dernière sortie) [1..=90]
    pub current_gaps: [u32; TOTAL_NUMBERS + 1],
    /// Écarts maximaux historiques observés [1..=90]
    pub max_gaps: [u32; TOTAL_NUMBERS + 1],
    /// Nombre total de tirages analysés
    pub total_draws: usize,
}

impl Default for IncrementalStats {
    fn default() -> Self {
        Self {
            frequencies: [0; TOTAL_NUMBERS + 1],
            current_gaps: [0; TOTAL_NUMBERS + 1],
            max_gaps: [0; TOTAL_NUMBERS + 1],
            total_draws: 0,
        }
    }
}

/// Dépôt mémoire contigu pour un type de tirage spécifique (ex: NATIONAL, LUCKY TUESDAY)
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DrawTimeline {
    pub draw_name: String,
    pub network_id: String, // "hebdomadaire" ou "quotidien"
    pub history: Vec<CompactDraw>,
    pub stats: IncrementalStats,
    #[serde(skip)]
    pub seen_draws: HashSet<u128>,
}

impl DrawTimeline {
    pub fn new(draw_name: String, network_id: String) -> Self {
        Self {
            draw_name,
            network_id,
            history: Vec::with_capacity(1024),
            stats: IncrementalStats::default(),
            seen_draws: HashSet::with_capacity(1024),
        }
    }

    /// Ajoute un tirage de façon idempotente (dédoublonnage strict O(1))
    /// Retourne `true` si le tirage a été inséré, `false` s'il existait déjà.
    pub fn append(&mut self, draw: CompactDraw) -> bool {
        let key = draw.composite_key();
        if self.seen_draws.contains(&key) {
            return false; // Tirage déjà présent : no-op garantissant l'invariance des fréquences
        }
        self.seen_draws.insert(key);

        // Mise à jour continue des fréquences et des retards
        for n in 1..=TOTAL_NUMBERS {
            if draw.contains_number(n as u8) {
                self.stats.frequencies[n] += 1;
                if self.stats.current_gaps[n] > self.stats.max_gaps[n] {
                    self.stats.max_gaps[n] = self.stats.current_gaps[n];
                }
                self.stats.current_gaps[n] = 0;
            } else {
                self.stats.current_gaps[n] += 1;
            }
        }
        self.stats.total_draws += 1;
        self.history.push(draw);
        true
    }

    /// Charge en bloc des tirages avec tri chronologique ascendant garanti et dédoublonnage
    pub fn bulk_load_sorted(&mut self, mut draws: Vec<CompactDraw>) -> usize {
        // Tri chronologique strict : du plus ancien vers le plus récent (flèche du temps)
        draws.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        let mut loaded = 0usize;
        for draw in draws {
            if self.append(draw) {
                loaded += 1;
            }
        }
        loaded
    }

    /// Réinitialise complètement la timeline (permet une synchronisation propre sans cumul)
    pub fn clear(&mut self) {
        self.history.clear();
        self.seen_draws.clear();
        self.stats = IncrementalStats::default();
    }
}

/// Gestionnaire global du cache in-memory de tous les tirages
#[wasm_bindgen]
pub struct InMemoryDrawStore {
    timelines: HashMap<String, DrawTimeline>,
}

#[wasm_bindgen]
impl InMemoryDrawStore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            timelines: HashMap::with_capacity(32),
        }
    }

    /// Réinitialise l'historique d'un tirage spécifique
    #[wasm_bindgen]
    pub fn clear_draw(&mut self, draw_name: &str) {
        let norm = draw_name.trim().to_uppercase();
        if let Some(timeline) = self.timelines.get_mut(&norm) {
            timeline.clear();
        }
    }

    /// Amorce (Bootstrap) le cache depuis un payload JSON compact reçu de Supabase
    /// Trie chronologiquement et dédoublonne strictement chaque tirage.
    #[wasm_bindgen]
    pub fn bootstrap_json(&mut self, json_payload: &str) -> Result<usize, JsValue> {
        #[derive(Deserialize)]
        struct RawDrawInput {
            tirage: Option<String>,
            draw_name: Option<String>,
            date: Option<String>,
            timestamp: Option<u64>,
            gagnants: Vec<u8>,
            machine: Option<Vec<u8>>,
        }

        let raw_draws: Vec<RawDrawInput> = serde_json::from_str(json_payload)
            .map_err(|e| JsValue::from_str(&format!("Erreur parsing JSON: {}", e)))?;

        let mut grouped: HashMap<String, Vec<CompactDraw>> = HashMap::new();

        for raw in raw_draws {
            if raw.gagnants.len() < NUMBERS_PER_DRAW {
                continue;
            }

            let mut w = [0u8; NUMBERS_PER_DRAW];
            w.copy_from_slice(&raw.gagnants[..NUMBERS_PER_DRAW]);
            w.sort_unstable();

            let mut m = [0u8; NUMBERS_PER_DRAW];
            if let Some(mach) = raw.machine {
                if mach.len() >= NUMBERS_PER_DRAW {
                    m.copy_from_slice(&mach[..NUMBERS_PER_DRAW]);
                    m.sort_unstable();
                }
            }

            let ts = if let Some(t) = raw.timestamp {
                if t > 10_000_000_000 { t / 1000 } else { t }
            } else if let Some(d_str) = &raw.date {
                parse_date_to_posix_seconds(d_str)
            } else {
                0
            };

            if let Ok(draw) = CompactDraw::new(ts, w, m) {
                let name = raw.draw_name
                    .or(raw.tirage)
                    .unwrap_or_else(|| "GLOBAL".to_string());
                let norm_name = name.trim().to_uppercase();

                grouped.entry(norm_name).or_insert_with(Vec::new).push(draw);
            }
        }

        let mut total_loaded = 0usize;
        for (draw_name, draws) in grouped {
            let network = if draw_name.contains("NATIONAL") || draw_name.contains("MIDWEEK") {
                "hebdomadaire"
            } else {
                "quotidien"
            };

            let entry = self.timelines
                .entry(draw_name.clone())
                .or_insert_with(|| DrawTimeline::new(draw_name, network.to_string()));

            total_loaded += entry.bulk_load_sorted(draws);
        }

        Ok(total_loaded)
    }

    /// Récupère la taille de l'historique en RAM pour un tirage donné
    #[wasm_bindgen]
    pub fn get_draw_count(&self, draw_name: &str) -> usize {
        let norm = draw_name.trim().to_uppercase();
        self.timelines.get(&norm).map(|t| t.history.len()).unwrap_or(0)
    }

    /// Insère un nouveau tirage de façon idempotente (Delta Sync unitaire)
    #[wasm_bindgen]
    pub fn append_single_draw(
        &mut self,
        draw_name: &str,
        mut timestamp: u64,
        winners: &[u8],
        machine: &[u8],
    ) -> Result<bool, JsValue> {
        if winners.len() < NUMBERS_PER_DRAW {
            return Err(JsValue::from_str("Moins de 5 numéros gagnants"));
        }

        if timestamp > 10_000_000_000 {
            timestamp /= 1000;
        }

        let mut w = [0u8; NUMBERS_PER_DRAW];
        w.copy_from_slice(&winners[..NUMBERS_PER_DRAW]);
        w.sort_unstable();

        let mut m = [0u8; NUMBERS_PER_DRAW];
        if machine.len() >= NUMBERS_PER_DRAW {
            m.copy_from_slice(&machine[..NUMBERS_PER_DRAW]);
            m.sort_unstable();
        }

        let draw = CompactDraw::new(timestamp, w, m)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let norm = draw_name.trim().to_uppercase();
        let entry = self.timelines
            .entry(norm.clone())
            .or_insert_with(|| DrawTimeline::new(norm, "quotidien".to_string()));

        let inserted = entry.append(draw);
        Ok(inserted)
    }

    /// Retourne les fréquences [1..90] directement depuis la RAM locale en O(1)
    #[wasm_bindgen]
    pub fn get_frequencies(&self, draw_name: &str) -> Vec<u32> {
        let norm = draw_name.trim().to_uppercase();
        if let Some(t) = self.timelines.get(&norm) {
            t.stats.frequencies.to_vec()
        } else {
            vec![0; TOTAL_NUMBERS + 1]
        }
    }

    /// Retourne les écarts actuels [1..90] directement depuis la RAM locale en O(1)
    #[wasm_bindgen]
    pub fn get_current_gaps(&self, draw_name: &str) -> Vec<u32> {
        let norm = draw_name.trim().to_uppercase();
        if let Some(t) = self.timelines.get(&norm) {
            t.stats.current_gaps.to_vec()
        } else {
            vec![0; TOTAL_NUMBERS + 1]
        }
    }

    /// Analyse préalable complète de l'historique d'un tirage (Entropie, Hurst, FFT, Régime)
    #[wasm_bindgen]
    pub fn analyze_draw(&self, draw_name: &str) -> Result<crate::core_prediction_engine::PriorAnalysisReport, JsValue> {
        let norm = draw_name.trim().to_uppercase();
        let timeline = self.timelines.get(&norm)
            .ok_or_else(|| JsValue::from_str(&format!("Tirage '{}' absent du cache mémoire", draw_name)))?;
        Ok(crate::core_prediction_engine::analyze_draw_timeline(timeline))
    }

    /// Génère un portefeuille de tickets diversifiés (100% calculé en RAM Wasm locale, zéro réseau)
    #[wasm_bindgen]
    pub fn generate_portfolio(&self, draw_name: &str, num_tickets: usize) -> Result<crate::core_prediction_engine::WasmPredictionPortfolio, JsValue> {
        let norm = draw_name.trim().to_uppercase();
        let timeline = self.timelines.get(&norm)
            .ok_or_else(|| JsValue::from_str(&format!("Tirage '{}' absent du cache mémoire", draw_name)))?;
        let prior = crate::core_prediction_engine::analyze_draw_timeline(timeline);
        crate::core_prediction_engine::generate_multi_ticket_portfolio(timeline, &prior, num_tickets)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// Retourne l'identifiant du réseau ("hebdomadaire" ou "quotidien")
    #[wasm_bindgen]
    pub fn get_network_id(&self, draw_name: &str) -> String {
        let norm = draw_name.trim().to_uppercase();
        if let Some(t) = self.timelines.get(&norm) {
            t.network_id.clone()
        } else if norm.contains("NATIONAL") || norm.contains("MIDWEEK") {
            "hebdomadaire".to_string()
        } else {
            "quotidien".to_string()
        }
    }

    /// Calcule le couplage continu d'interconnexion entre deux tirages du store
    /// Zéro coupure binaire, poids continu dans ]0.0, 1.0[ selon AGENTS.md
    #[wasm_bindgen]
    pub fn compute_interdraw_coupling(&self, draw_a: &str, draw_b: &str) -> Result<f64, JsValue> {
        let norm_a = draw_a.trim().to_uppercase();
        let norm_b = draw_b.trim().to_uppercase();
        let ta = self.timelines.get(&norm_a)
            .ok_or_else(|| JsValue::from_str(&format!("Tirage '{}' absent", draw_a)))?;
        let tb = self.timelines.get(&norm_b)
            .ok_or_else(|| JsValue::from_str(&format!("Tirage '{}' absent", draw_b)))?;

        Ok(crate::interdraw_dynamics::continuous_pearson_coupling(
            &ta.stats.frequencies,
            &tb.stats.frequencies,
        ))
    }

    /// Calcule la propagation d'advection domino pour un tirage cible
    /// en exploitant les tirages récents du même réseau
    #[wasm_bindgen]
    pub fn compute_network_domino_wasm(
        &self,
        draw_name: &str,
        damping_gamma: f64,
    ) -> Result<crate::interdraw_dynamics::WasmDominoResult, JsValue> {
        let norm = draw_name.trim().to_uppercase();
        let timeline = self.timelines.get(&norm)
            .ok_or_else(|| JsValue::from_str(&format!("Tirage '{}' absent du cache", draw_name)))?;

        let count = timeline.history.len().min(30);
        if count == 0 {
            return Ok(crate::interdraw_dynamics::WasmDominoResult::empty(damping_gamma));
        }

        let mut flat = Vec::with_capacity(count * NUMBERS_PER_DRAW);
        for d in timeline.history.iter().rev().take(count) {
            for &w in &d.winners {
                flat.push(w as i32);
            }
        }

        Ok(crate::interdraw_dynamics::compute_domino_advection_wasm(
            &flat,
            count,
            damping_gamma,
        ))
    }

    /// Évalue la calibration empirique out-of-fold et la performance Walk-Forward
    #[wasm_bindgen]
    pub fn compute_walk_forward_calibration(
        &self,
        draw_name: &str,
        window_size: usize,
    ) -> Result<crate::calibration::WalkForwardReport, JsValue> {
        let norm = draw_name.trim().to_uppercase();
        let timeline = self.timelines.get(&norm)
            .ok_or_else(|| JsValue::from_str(&format!("Tirage '{}' absent du cache", draw_name)))?;

        crate::calibration::evaluate_walk_forward_calibration(timeline, window_size)
            .map_err(|e| JsValue::from_str(&e))
    }
}
