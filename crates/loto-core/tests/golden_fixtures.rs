use loto_core::combinatorics::{
    binomial, fnv1a_64, hypergeometric_tail_prob, DeterministicLcg,
};
use loto_core::stacking::stack_channels_l2;
use serde_json::Value;

const FIXTURE: &str = include_str!("../../../tests/fixtures/golden-engine.json");

fn fixture() -> Value {
    serde_json::from_str(FIXTURE).expect("golden fixture JSON valide")
}

#[test]
fn binomial_matches_golden_fixture() {
    let f = fixture();
    let b = &f["binomial"];
    assert_eq!(binomial(90, 5) as u64, b["90,5"].as_u64().unwrap());
    assert_eq!(binomial(85, 5) as u64, b["85,5"].as_u64().unwrap());
    assert_eq!(binomial(85, 3) as u64, b["85,3"].as_u64().unwrap());
}

#[test]
fn hypergeometric_matches_golden_fixture_within_epsilon() {
    let f = fixture();
    let eps = f["epsilon"].as_f64().unwrap();
    let h = &f["hypergeometric"];
    let pool = h["poolSize"].as_u64().unwrap() as u32;
    let winners = h["poolWinners"].as_u64().unwrap() as u32;
    let ticket = h["ticketSize"].as_u64().unwrap() as u32;
    for case in h["cases"].as_array().unwrap() {
        let k = case["minHits"].as_u64().unwrap() as u32;
        let expected = case["p"].as_f64().unwrap();
        let actual = hypergeometric_tail_prob(k, ticket, winners, pool);
        assert!(
            (actual - expected).abs() <= eps,
            "P(>= {k}) = {actual}, attendu {expected} (eps={eps})"
        );
    }
}

#[test]
fn lcg_matches_golden_fixture_within_epsilon() {
    let f = fixture();
    let eps = f["epsilon"].as_f64().unwrap();
    let seed = f["lcg"]["seed"].as_u64().unwrap();
    let expected = f["lcg"]["values"].as_array().unwrap();
    let mut lcg = DeterministicLcg::new(seed);
    for (i, value) in expected.iter().enumerate() {
        let target = value.as_f64().unwrap();
        let actual = lcg.next_f64();
        assert!(
            (actual - target).abs() <= eps,
            "LCG[{i}] = {actual}, attendu {target}"
        );
    }
}

#[test]
fn fnv_matches_golden_fixture() {
    let f = fixture();
    let input = f["fnv"]["input"].as_str().unwrap();
    let expected = f["fnv"]["hash53"].as_f64().unwrap();
    let hash = fnv1a_64(input.as_bytes());
    let hash53 = (hash % (1u64 << 53)) as f64;
    assert_eq!(hash53, expected);
}

#[test]
fn stacking_matches_golden_fixture_within_epsilon() {
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

    let mut oof = Vec::with_capacity(num_samples);
    let mut targets = Vec::with_capacity(num_samples);
    for _ in 0..num_samples {
        let mut ch0 = vec![0.0f64; 91];
        let mut ch1 = vec![0.0f64; 91];
        let mut tgt = vec![0.0f64; 91];
        for n in 1..=90usize {
            ch0[n] = if n <= 5 { 0.9 } else { 0.01 };
            ch1[n] = 0.0555;
            tgt[n] = if n <= 5 { 1.0 } else { 0.0 };
        }
        oof.push(vec![ch0, ch1]);
        targets.push(tgt);
    }

    let out = stack_channels_l2(&oof, &targets, num_channels);
    for (k, target) in expected.iter().enumerate() {
        assert!(
            (out.channel_weights[k] - target).abs() <= eps,
            "poids[{k}] = {}, attendu {target}",
            out.channel_weights[k]
        );
    }
}
