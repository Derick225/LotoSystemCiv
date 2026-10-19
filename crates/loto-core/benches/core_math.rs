use criterion::{black_box, criterion_group, criterion_main, Criterion};
use loto_core::combinatorics::{
    fnv1a_64, hypergeometric_tail_prob, ticket_prob_at_least, DeterministicLcg,
};
use loto_core::hyperparams::{domino_transition_profile, repulsion_gamma};
use loto_core::stacking::stack_channels_l2;

fn bench_combinatorics(c: &mut Criterion) {
    c.bench_function("hypergeometric_tail_prob_ge3", |b| {
        b.iter(|| hypergeometric_tail_prob(black_box(3), 5, 5, 90))
    });
    c.bench_function("ticket_prob_at_least_3", |b| {
        b.iter(|| ticket_prob_at_least(black_box(3)))
    });
}

fn bench_lcg(c: &mut Criterion) {
    c.bench_function("lcg_1m_draws", |b| {
        b.iter(|| {
            let mut lcg = DeterministicLcg::new(black_box(0xC0FFEE));
            let mut acc = 0.0f64;
            for _ in 0..1_000_000 {
                acc += lcg.next_f64();
            }
            acc
        })
    });
}

fn bench_fnv(c: &mut Criterion) {
    let payload: Vec<u8> = (0..4096u32).map(|v| (v % 251) as u8).collect();
    c.bench_function("fnv1a_64_4kb", |b| b.iter(|| fnv1a_64(black_box(&payload))));
}

fn bench_domino(c: &mut Criterion) {
    let timeline: Vec<[u8; 5]> = (0..500u32)
        .map(|i| {
            let base = ((i * 37) % 86) as u8 + 1;
            let mut w = [base, base + 1, base + 2, base + 3, base + 4];
            w.sort_unstable();
            w
        })
        .collect();
    c.bench_function("domino_profile_500_draws", |b| {
        b.iter(|| domino_transition_profile(black_box(&timeline)))
    });
    c.bench_function("repulsion_gamma_16", |b| b.iter(|| repulsion_gamma(black_box(16))));
}

fn bench_stacking(c: &mut Criterion) {
    let num_samples = 40usize;
    let num_channels = 4usize;
    let oof: Vec<Vec<Vec<f64>>> = (0..num_samples)
        .map(|s| {
            (0..num_channels)
                .map(|k| {
                    (0..91)
                        .map(|n| (((s * 13 + k * 7 + n * 3) % 97) as f64) / 97.0)
                        .collect()
                })
                .collect()
        })
        .collect();
    let targets: Vec<Vec<f64>> = (0..num_samples)
        .map(|s| (0..91).map(|n| if (s * 5 + n) % 90 < 5 { 1.0 } else { 0.0 }).collect())
        .collect();
    c.bench_function("stack_channels_l2_40x4", |b| {
        b.iter(|| stack_channels_l2(black_box(&oof), black_box(&targets), num_channels))
    });
}

criterion_group!(
    benches,
    bench_combinatorics,
    bench_lcg,
    bench_fnv,
    bench_domino,
    bench_stacking
);
criterion_main!(benches);
