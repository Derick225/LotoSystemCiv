
# LotoPro Platinum Elite v11.0 🔮
### Industrial Stochastic Prediction System by Nexus Elite Engineering

Système industriel de prédiction stochastique par ensemble de neurones pondérés et synchronisation tensorielle. Développé pour l'analyse haute performance des flux 5/90.

## 🚀 Repository & Sync
Dépôt Officiel : [https://github.com/Derick225/LotoSystem-](https://github.com/Derick225/LotoSystem-)

### 1. Installation
```bash
npm install
```

### 2. Variables d'Environnement (.env)
```env
# Google Gemini API Key (Studio AI)
API_KEY=votre_cle_gemini

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Déploiement du Cerveau (Edge Functions)
Pour synchroniser les algorithmes IA vers Supabase :
```bash
supabase login
supabase link --project-ref your-project-id
supabase functions deploy --no-verify-jwt
```

## 🛠️ Architecture Nexus
*   **Neural Kernel**: Moteur d'inférence basé sur Gemini 3 Pro pour le raisonnement narratif.
*   **HPC Pipeline**: Calculs spectraux (FFT) et fractals (Hurst) via Web Workers.
*   **Realtime Sync**: Table `draw_results` synchronisée via pg_cron et Edge Functions.

## ⚠️ Disclaimer
LotoPro est un outil d'analyse statistique et de divertissement. Il ne garantit aucun gain.
