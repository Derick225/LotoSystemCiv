#![cfg(target_arch = "wasm32")]

use loto_engine::{abi_hash, engine_version, stack_channel_weights_wasm};
use serde_json::Value;
use wasm_bindgen_test::*;

const FIXTURE: &str = include_str!("../../../tests/fixtures/golden-engine.json");

fn fixture() -> Value {
    serde_json::from_str(FIXTURE).expect("golden fixture JSON valide")
}

#[wasm_bindgen_test]
fn wasm_exports_are_present() {
    assert_eq!(engine_version(), "1.0.0");
    let hash = abi_hash();
    assert_eq!(hash.len(), 16, "abi_hash doit être un FNV-1a 64-bit hex");
    assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
}

#[wasm_bindgen_test]
fn stacking_matches_cross_platform_golden_fixture() {
    let f = fixture();
    let eps = f["epsilon"].as_f64().unwrap();
    let num_samples = f["stacking"]["numSamples"].as_u64().unwrap() as usize;
    let num_channels = f["stacking"]["numChannels"].as_u64().unwrap() as usize;
    let expected: Vec<f64> = f["stacking"]["channelWeights"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_f64().unwrap())
        .collect();

    let stride = 91usize;
    let mut oof_flat: Vec<f64> = Vec::with_capacity(num_samples * num_channels * stride);
    let mut targets_flat: Vec<f64> = Vec::with_capacity(num_samples * stride);

    for _ in 0..num_samples {
        for k in 0..num_channels {
            for n in 0..stride {
                let value = if k == 0 {
                    if n >= 1 && n <= 5 { 0.9 } else if n == 0 { 0.0 } else { 0.01 }
                } else if n == 0 {
                    0.0
                } else {
                    0.0555
                };
                oof_flat.push(value);
            }
        }
        for n in 0..stride {
            targets_flat.push(if n >= 1 && n <= 5 { 1.0 } else { 0.0 });
        }
    }

    let weights = stack_channel_weights_wasm(&oof_flat, &targets_flat, num_channels, num_samples);
    assert_eq!(weights.len(), num_channels);
    for (k, target) in expected.iter().enumerate() {
        assert!(
            (weights[k] - target).abs() <= eps,
            "poids WASM[{k}] = {}, attendu {target}",
            weights[k]
        );
    }
}
