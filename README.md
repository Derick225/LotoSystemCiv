
# LotoPro Platinum Elite v12.0 🔮
### Industrial Stochastic Prediction System by Nexus Elite Engineering

Système industriel de prédiction stochastique par ensemble de neurones pondérés et synchronisation tensorielle. Développé pour l'analyse haute performance des flux 5/90.

## 🚀 Installation & Configuration Rapide

### 1. Installation des dépendances
```bash
npm install
```

### 2. Configuration Environnement (.env)
Renseignez vos clés de configuration Firebase et Gemini dans votre environnement :

```env
# Client (Vite)
VITE_FIREBASE_API_KEY=votre_cle_api_firebase
VITE_FIREBASE_AUTH_DOMAIN=votre_projet.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=votre_project_id
VITE_FIREBASE_STORAGE_BUCKET=votre_projet.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=votre_sender_id
VITE_FIREBASE_APP_ID=votre_app_id

# Serveur (Gemini)
GEMINI_API_KEY=votre_cle_google_gemini
```

### 3. Démarrage du serveur de développement
```bash
npm run dev
```

### 4. Déploiement de la configuration Firebase (Règles & Index Firestore)

Pour déployer vos règles de sécurité Firestore (`firestore.rules`) et la configuration des index (`firestore.indexes.json`) :

1. Connectez-vous à Firebase CLI :
    ```bash
    npx firebase login
    npx firebase use --add
    ```

2. Déployez les règles et les index vers Firestore :
    ```bash
    npx firebase deploy --only firestore
    ```

Note : Le projet inclut également un fichier de configuration canonique `firebase-blueprint.json` et `firebase.json` pour la synchronisation automatique des schémas Firestore.

## 🛠️ Architecture Nexus
*   **Neural Kernel**: Moteur d'inférence basé sur Gemini Pro pour le raisonnement stochastique et narratif.
*   **Firebase Integration**: Firestore (collections NoSQL pour l'historique et les prédictions) et Firebase Authentication.
*   **HPC Pipeline**: Calculs spectraux (FFT) et fractals (Hurst) exécutés de manière déterministe.
*   **Realtime Sync**: Synchronisation continue des tirages et statistiques via Firestore snapshot listeners.

## ⚠️ Disclaimer
LotoPro est un outil d'analyse statistique et de divertissement. Il ne garantit aucun gain.

