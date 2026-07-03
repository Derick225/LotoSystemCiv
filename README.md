
# LotoPro Platinum Elite v11.0 🔮
### Industrial Stochastic Prediction System by Nexus Elite Engineering

Système industriel de prédiction stochastique par ensemble de neurones pondérés et synchronisation tensorielle. Développé pour l'analyse haute performance des flux 5/90.

## 🚀 Installation & Configuration Rapide

### 1. Installation des dépendances
```bash
npm install
```

### 2. Configuration Environnement (.env)
Créez un fichier nommé `.env` à la racine du projet et remplissez-le avec vos clés Supabase :

```env
# Client (Vite)
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-anon-publique
```

*Pour obtenir ces clés : Allez dans votre Dashboard Supabase > Settings > API.*

### 3. Démarrage
```bash
npm run dev
```

### 4. Déploiement du Cerveau (Edge Functions)
Pour activer l'IA (Gemini) et la synchronisation automatique :

1.  Connectez la CLI :
    ```bash
    npx supabase login
    npx supabase link --project-ref votre-project-id
    ```
2.  Envoyez les secrets serveurs (ne pas mettre dans le .env client !) :
    ```bash
    npx supabase secrets set API_KEY=votre_cle_google_gemini
    npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=votre_cle_service_role
    ```
3.  Déployez les fonctions :
    ```bash
    npm run deploy:nexus
    ```

## 🛠️ Architecture Nexus
*   **Neural Kernel**: Moteur d'inférence basé sur Gemini 3 Pro pour le raisonnement narratif.
*   **HPC Pipeline**: Calculs spectraux (FFT) et fractals (Hurst) via Web Workers.
*   **Realtime Sync**: Table `draw_results` synchronisée via pg_cron et Edge Functions.

## ⚠️ Disclaimer
LotoPro est un outil d'analyse statistique et de divertissement. Il ne garantit aucun gain.
