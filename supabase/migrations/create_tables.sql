
-- Table pour stocker l'historique des prédictions
CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    draw_name TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    prediction JSONB NOT NULL, -- Contient suggestedNumbers, confidence, breakdown, etc.
    draw_result_id UUID REFERENCES draw_results(id), -- Lien optionnel vers le résultat
    feedback JSONB, -- Feedback utilisateur ou automatique
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_predictions_user_draw ON predictions(user_id, draw_name);
CREATE INDEX IF NOT EXISTS idx_predictions_timestamp ON predictions(timestamp DESC);

-- Table pour les rapports Forensic
CREATE TABLE IF NOT EXISTS forensic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    prediction_id UUID REFERENCES predictions(id) ON DELETE CASCADE,
    draw_name TEXT NOT NULL,
    draw_date TEXT NOT NULL, -- Format JJ/MM/AAAA ou ISO
    report_data JSONB NOT NULL, -- Contient matches, scoreDivergence, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forensic_user_draw ON forensic_reports(user_id, draw_name);

-- Table pour les sessions d'apprentissage (Feedback Loop)
CREATE TABLE IF NOT EXISTS learning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    draw_name TEXT NOT NULL,
    session_data JSONB NOT NULL, -- Poids ajustés, leçons apprises
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_user_draw ON learning_sessions(user_id, draw_name);

-- RLS Policies (Row Level Security)
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forensic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;

-- Policies pour predictions
CREATE POLICY "Users can view their own predictions" ON predictions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own predictions" ON predictions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own predictions" ON predictions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own predictions" ON predictions FOR DELETE USING (auth.uid() = user_id);

-- Policies pour forensic_reports
CREATE POLICY "Users can view their own forensic reports" ON forensic_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own forensic reports" ON forensic_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own forensic reports" ON forensic_reports FOR DELETE USING (auth.uid() = user_id);

-- Policies pour learning_sessions
CREATE POLICY "Users can view their own learning sessions" ON learning_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own learning sessions" ON learning_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own learning sessions" ON learning_sessions FOR UPDATE USING (auth.uid() = user_id);
