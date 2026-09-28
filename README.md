# Biodiversity Ambassadors Platform

Public website and ambassador/manager platform for the **Biodiversity Ambassadors** program (Armenian Universities Coalition for Biodiversity × GYBN Armenia), ahead of COP17 in Yerevan.

## Stack

- **Frontend**: plain HTML/CSS/JS (no build step, no framework) in [`public/`](public/), served by a tiny static file server ([`scripts/dev-server.js`](scripts/dev-server.js)).
- **Backend**: [Supabase](https://supabase.com) — Postgres, Auth, Storage, and two Edge Functions ([`supabase/functions/`](supabase/functions/)) for certificate scanning and manager-initiated password resets. All business logic (credit rules, the Oct 15 deadline lock, auto-publication at 60 credits, notifications) lives in Postgres functions under [`supabase/migrations/`](supabase/migrations/).
- **Media**: [`media/`](media/) — carousel/about photos and team photos, served directly by the static server. The homepage carousel, About page and team photos are driven by `media/manifest.json`; the dev server generates it fresh on every request, but static hosts need it pre-built and committed (`npm run build:media`) — re-run and commit it whenever photos are added or removed. The UNICEF course videos themselves (`unicef_modules/`, ~880MB) are **not** served from here — they live in Cloudflare R2 (zero egress fees) and are referenced via `MEDIA_BASE` in `public/js/config.js`, since streaming that much video from the app server alone was enough to blow through a free hosting bandwidth quota in days. The local `media/unicef_modules/` copy is gitignored; re-upload with a small script if the bucket ever needs to be rebuilt.

## Running locally

```bash
npm install
npm start
```

Opens on `http://localhost:3000`. The frontend talks directly to Supabase (see `public/js/config.js` for the project URL and publishable key — this key is meant to be public; access is enforced by row-level security in Postgres, not by hiding the key).

## Deploying

This is a **static site**, not a Python/Streamlit app — there's no `streamlit run` entrypoint here, since nothing in this project uses Streamlit. To host it:

- **Static hosts with a build step** (Vercel, Netlify, Cloudflare Pages, Render's Static Site): run `npm run build:media` then merge `public/` and `media/` into one output directory (e.g. `mkdir dist && cp -r public/. dist/ && cp -r media dist/media`), and publish `dist/`. Add an SPA rewrite (`/*` → `/index.html`) so client-side routes don't 404 on refresh.
- **Node hosts**: run `npm start` on Render, Railway, Fly.io, etc., which serves the same files via [`scripts/dev-server.js`](scripts/dev-server.js) — no build step needed, it generates `media/manifest.json` on the fly.
- **Plain git-deploy hosts with no build step** (e.g. Hostinger's Git feature, which just clones the repo as-is into the web root): commit a pre-built `media/manifest.json` (`npm run build:media`, then commit it) and rely on the root [`.htaccess`](.htaccess) in this repo, which rewrites the doc root to behave as if `public/`'s contents lived there directly, with an SPA fallback to `index.html` — same effect as the merge step above, but done at request time via Apache instead of at build time.

Either way, the Supabase project itself (database, auth, storage, edge functions) is already live and shared by every deployment — you're only hosting static files.

## Not included in this repo

- Any attendee/check-in spreadsheet — those contain real people's names and are imported directly into Supabase (`checkin_batches` / `checkin_records`), never committed to git.
