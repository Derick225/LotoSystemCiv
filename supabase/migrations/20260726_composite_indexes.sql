-- Migration: Composite Indexes for learning_logs and prediction_snapshots
-- Date: 2026-07-26

CREATE INDEX IF NOT EXISTS idx_learning_logs_draw_created ON public.learning_logs(draw_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_draw_created ON public.prediction_snapshots(draw_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_draw_target_date ON public.prediction_snapshots(draw_name, target_date DESC);
