# Supabase Deployment Configuration

This project is configured to automatically deploy Supabase Edge Functions using GitHub Actions.

## GitHub Secrets Setup

To make the deployment work, you MUST add the following secrets to your GitHub repository (Settings > Secrets and variables > Actions):

1. `SUPABASE_ACCESS_TOKEN`: Your personal access token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).
2. `SUPABASE_PROJECT_ID`: Your Supabase project reference ID (the string of characters in your project URL: `https://supabase.com/dashboard/project/<project-id>`).

## Local Development

To run functions locally:

```bash
supabase start
supabase functions serve
```

## Manual Deployment

```bash
supabase functions deploy <function_name> --project-ref <project-id>
```
