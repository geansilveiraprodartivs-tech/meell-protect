# Meell Protect

A React + TypeScript + Vite web app for protected digital file delivery. Creators can upload and share files; clients receive secure, trackable download links.

## Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Supabase (auth, database, storage)
- **Icons**: Lucide React

## Running the app

The workflow **Start application** runs `npm run dev` and serves on port 5000.

## Environment variables / secrets

| Key | Description |
|-----|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key (Settings → API) |

## Project structure

```
src/
  components/   # UI components (Landing, Auth, Dashboards, Chat, etc.)
  lib/          # Supabase client, auth context, router, types, utils
  pages/        # Page-level components
supabase/
  migrations/   # SQL migration files
  functions/    # Supabase Edge Functions
```

## User preferences

_None recorded yet._
