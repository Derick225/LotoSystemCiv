use criterion::{black_box, criterion_group, criterion_main, Criterion};
use loto_engine::aco::run_aco_optimization_wasm;
use loto_engine::core_prediction_engine::{analyze_draw_timeline, generate_multi_ticket_portfolio};
use loto_engine::in_memory_store::{CompactDraw, DrawTimeline};

fn make_timeline(draws: u64) -> DrawTimeline {
    let mut timeline = DrawTimeline::new("BENCH".to_string(), "hebdomadaire".to_string());
    let batch: Vec<CompactDraw> = (0..draws)
        .map(|i| {
            let base = ((i * 37) % 86) as u8 + 1;
            let mut w = [base, base + 1, base + 2, base + 3, base + 4];
            w.sort_unstable();
            CompactDraw::new(1_600_000_000 + i * 86_400, w, w).unwrap()
        })
        .collect();
    timeline.bulk_load_sorted(batch);
    timeline
}

fn bench_bulk_load(c: &mut Criterion) {
    let batch: Vec<CompactDraw> = (0..10_000u64)
        .map(|i| {
            let base = ((i * 37) % 86) as u8 + 1;
            let mut w = [base, base + 1, base + 2, base + 3, base + 4];
            w.sort_unstable();
            CompactDraw::new(1_600_000_000 + i * 86_400, w, w).unwrap()
        })
        .collect();
    c.bench_function("bulk_load_sorted_10k", |b| {
        b.iter(|| {
            let mut timeline = DrawTimeline::new("BENCH".to_string(), "hebdomadaire".to_string());
            timeline.bulk_load_sorted(black_box(batch.clone()))
        })
    });
}

fn bench_portfolio(c: &mut Criterion) {
    let timeline = make_timeline(500);
    let prior = analyze_draw_timeline(&timeline);
    c.bench_function("generate_multi_ticket_portfolio_500_draws", |b| {
        b.iter(|| {
            generate_multi_ticket_portfolio(black_box(&timeline), black_box(&prior), black_box(5))
        })
    });
}

fn bench_aco(c: &mut Criterion) {
    let history: Vec<i32> = (0..200u64)
        .flat_map(|i| {
            let base = ((i * 37) % 86) as i32 + 1;
            [base, base + 1, base + 2, base + 3, base + 4]
        })
        .collect();
    c.bench_function("run_aco_200_draws_16_ants", |b| {
        b.iter(|| {
            run_aco_optimization_wasm(
                black_box(&history),
                black_box(200),
                black_box(5),
                black_box(16),
                black_box(10),
                black_box(1.0),
                black_box(2.0),
                black_box(0.1),
                black_box(0.9),
                black_box(&[]),
                black_box(0x5EED),
            )
        })
    });
}

criterion_group!(benches, bench_bulk_load, bench_portfolio, bench_aco);
criterion_main!(benches);
