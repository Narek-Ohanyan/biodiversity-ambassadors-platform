# Biodiversity Ambassadors Platform

Public website and ambassador/manager platform for the **Biodiversity Ambassadors** program (Armenian Universities Coalition for Biodiversity × GYBN Armenia), ahead of COP17 in Yerevan.

## Stack

- **Frontend**: plain HTML/CSS/JS (no build step, no framework) in [`public/`](public/), served by a tiny static file server ([`scripts/dev-server.js`](scripts/dev-server.js)).
- **Backend**: [Supabase](https://supabase.com) — Postgres, Auth, Storage, and two Edge Functions ([`supabase/functions/`](supabase/functions/)) for certificate scanning and manager-initiated password resets. All business logic (credit rules, the Oct 15 deadline lock, auto-publication at 60 credits, notifications) lives in Postgres functions under [`supabase/migrations/`](supabase/migrations/).
- **Media**: [`media/`](media/) — carousel/about photos and team photos, served directly by the static server (this needs HTTP Range support to let the UNICEF video player seek/resume; `scripts/dev-server.js` handles it, and any static host you switch to must too). The UNICEF course videos themselves (`unicef_modules/`, ~880MB) are **not** served from here — they live in Cloudflare R2 (zero egress fees) and are referenced via `MEDIA_BASE` in `public/js/config.js`, since streaming that much video from the app server alone was enough to blow through a free hosting bandwidth quota in days. The local `media/unicef_modules/` copy is gitignored; re-upload with a small script if the bucket ever needs to be rebuilt.

## Running locally

```bash
npm install
npm start
```

Opens on `http://localhost:3000`. The frontend talks directly to Supabase (see `public/js/config.js` for the project URL and publishable key — this key is meant to be public; access is enforced by row-level security in Postgres, not by hiding the key).

## Deploying

This is a **static site**, not a Python/Streamlit app — there's no `streamlit run` entrypoint here, since nothing in this project uses Streamlit. To host it:

- **Static hosts** (simplest): point Vercel, Netlify, Cloudflare Pages, or GitHub Pages at the [`public/`](public/) and [`media/`](media/) directories. No build step needed.
- **Node hosts**: run `npm start` on Render, Railway, Fly.io, etc., which serves the same files via [`scripts/dev-server.js`](scripts/dev-server.js).

Either way, the Supabase project itself (database, auth, storage, edge functions) is already live and shared by every deployment — you're only hosting static files.

## Not included in this repo

- Any attendee/check-in spreadsheet — those contain real people's names and are imported directly into Supabase (`checkin_batches` / `checkin_records`), never committed to git.
