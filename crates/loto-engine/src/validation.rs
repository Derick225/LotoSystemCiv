//! # Validation Renforcée — Wrapper moteur
//!
//! Les primitives pures (holdout, blocs, statistiques) vivent dans `loto-core`.
//! Ce module ajoute uniquement l'adaptateur `DrawTimeline` propre au moteur.

pub use loto_core::validation::{
    block_ranges, block_stats, holdout_size, BLOCK_MIN_SIZE, HOLDOUT_FRACTION, HOLDOUT_MIN_DRAWS,
};

use crate::in_memory_store::DrawTimeline;

/// Sous-timeline déterministe excluant le bloc [start, end)
pub fn timeline_excluding_block(timeline: &DrawTimeline, start: usize, end: usize) -> DrawTimeline {
    let mut sub = DrawTimeline::new(timeline.draw_name.clone(), timeline.network_id.clone());
    for (i, draw) in timeline.history.iter().enumerate() {
        if i < start || i >= end {
            sub.append(*draw);
        }
    }
    sub
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::in_memory_store::CompactDraw;

    #[test]
    fn block_exclusion_preserves_order_and_isolates_network() {
        let mut timeline = DrawTimeline::new("TEST".to_string(), "hebdomadaire".to_string());
        for i in 0..20u64 {
            let w = [((i % 80) + 1) as u8, 20, 40, 60, 80];
            let mut sorted = w;
            sorted.sort_unstable();
            timeline.append(CompactDraw::new(1_600_000_000 + i * 86_400, sorted, sorted).unwrap());
        }
        let sub = timeline_excluding_block(&timeline, 5, 9);
        assert_eq!(sub.history.len(), 16);
        assert_eq!(sub.network_id, "hebdomadaire");
        assert!(sub.history.windows(2).all(|w| w[0].timestamp <= w[1].timestamp));
    }
}
