
export const NEXUS_DATABASE_SCHEMA = `-- SCHEMA SQL NEXUS PLATINUM v11.0
-- Copiez ce code dans l'éditeur SQL de Supabase

-- 1. Table des résultats
CREATE TABLE IF NOT EXISTS public.draw_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    draw_name TEXT NOT NULL,
    date DATE NOT NULL,
    gagnants INTEGER[] NOT NULL,
    machine INTEGER[],
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_draw_date UNIQUE (draw_name, date)
);

-- 2. Table des analyses (Cache HPC)
CREATE TABLE IF NOT EXISTS public.draw_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    draw_name TEXT NOT NULL,
    date DATE NOT NULL,
    spectral JSONB,
    fractal JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Sécurité (RLS)
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture Publique" ON public.draw_results FOR SELECT USING (true);
CREATE POLICY "Admin Insert" ON public.draw_results FOR INSERT WITH CHECK (true);

-- 4. Indexation de performance
CREATE INDEX IF NOT EXISTS idx_draw_name_date ON public.draw_results(draw_name, date);
`;
