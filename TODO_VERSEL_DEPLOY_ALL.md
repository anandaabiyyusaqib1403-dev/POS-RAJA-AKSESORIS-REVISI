# TODO: Deploy all Vercel (Frontend) - raja-aksesoris-pos

## Step 1 — Identify deploy targets
- [ ] Confirm in Vercel which projects/environments correspond to dev/staging/prod.
- [ ] Confirm correct domains/aliases per environment.

## Step 2 — Verify local build
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm run test:money`
- [x] `npm run test:runtime`
- [x] `npm run test:performance`
- [x] `npm run test:ux`
- [x] `npm run verify:hardening`

## Step 3 — Verify runtime configuration
- [ ] Ensure these frontend env vars exist in each Vercel environment (dev/staging/prod):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- [ ] Ensure these serverless `/api` env vars exist in each Vercel environment that runs API routes:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FONNTE_TOKEN`
  - `FONNTE_TARGETS`
- [ ] Use `VITE_BACKEND_URL` only when pointing the frontend to a separate deployed Express backend.
- [x] Ensure no secrets like `SUPABASE_SERVICE_ROLE_KEY` are added to frontend.

Checked 2026-06-01 with `vercel env ls --format=json`:
- Production has the required frontend and serverless `/api` vars.
- Preview is missing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FONNTE_TOKEN`, and `FONNTE_TARGETS`.
- Development has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, but is missing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FONNTE_TOKEN`, and `FONNTE_TARGETS`.
- No `VITE_*SERVICE_ROLE*` env var was found.

## Step 4 — Ensure /api proxy expectations
- [x] Use Vercel serverless `/api` routes for production unless a separate Express backend is deployed.

`VITE_BACKEND_URL` is currently set in Production. Remove it from Production if WhatsApp shift notifications should use the Vercel serverless `/api/whatsapp/*` routes in this repo.

## Step 5 — Deploy (frontend)
- [ ] Deploy dev with Vercel CLI using env vars.
- [ ] Deploy staging.
- [ ] Deploy production.

## Step 6 — Smoke tests per environment
- [ ] Load `/` and SPA routes.
- [ ] Call one representative endpoint under `/api/*` from browser.
- [ ] Login with a kasir test account and verify shift/transaction flow.

## Step 7 — Record release metadata
- [ ] Save commit hash + deploy output URLs for each environment.

