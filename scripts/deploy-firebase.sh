#!/bin/bash

echo "🚀 Déploiement de la configuration Firebase (Firestore Rules, Index)..."

# Vérification du CLI Firebase
if ! command -v firebase &> /dev/null && ! command -v npx &> /dev/null; then
    echo "❌ Ni 'firebase' ni 'npx' ne sont disponibles."
    exit 1
fi

echo "📦 Déploiement des règles et des index Firestore..."
npx firebase deploy --only firestore --project studio-7022336341-7e428

echo "✅ Déploiement Firebase terminé avec succès."
