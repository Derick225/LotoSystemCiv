#!/bin/bash

echo "🚀 Deploying Nexus Edge Functions..."

# Deploy all functions with no JWT verification for public access (secured internally if needed)
npx supabase functions deploy --no-verify-jwt

echo "✅ Deployment complete."