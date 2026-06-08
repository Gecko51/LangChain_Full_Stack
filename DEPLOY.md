# Deploying Agent Playground (Vercel + Render + Supabase)

Three pieces, all on free tiers:

| Piece | Host | Cost |
| --- | --- | --- |
| Frontend (Next.js) | **Vercel** | Free, always-on |
| Backend (FastAPI / SSE) | **Render** (Docker) | Free (sleeps after ~15 min idle) |
| Database | **Supabase** | Free (already set up) |

> The backend streams the chat over **SSE**, so it needs a *persistent* server (not serverless — those buffer/time out the stream). Render's free web service is the simplest fit.

---

## 1. Push to GitHub
Make sure the latest code is on GitHub. `.env` is git-ignored — never commit secrets.

## 2. Backend → Render
1. **render.com** → **New** → **Blueprint**.
2. Connect this repo. Render reads **`render.yaml`** and proposes the `agent-playground-api` service (Docker, free).
3. Fill the secret env vars (copy from your local `.env`):
   - `OPENROUTER_API_KEY` — your OpenRouter key
   - `SUPABASE_URL` — e.g. `https://kpertslfuaqmluhqdbuj.supabase.co`
   - `SUPABASE_KEY` — your Supabase anon key
   - `FRONTEND_URL` — leave blank for now (set in step 4)
   - `AUTH_SECRET` — leave it: Render generates one automatically.
4. **Apply** → wait for the Docker build (a few minutes). Note the URL, e.g. `https://agent-playground-api.onrender.com`.
5. Sanity check: open `https://…onrender.com/health` → should return `{"status":"ok"}`.

## 3. Frontend → Vercel
1. **vercel.com** → **Add New** → **Project** → import this repo.
2. **Root Directory** → set to **`frontend`**.
3. **Environment Variables** → add:
   - `NEXT_PUBLIC_BACKEND_URL` = the Render URL from step 2.
4. **Deploy** → note the URL, e.g. `https://agent-playground.vercel.app`.

## 4. Wire CORS back
1. Render → your service → **Environment** → set `FRONTEND_URL` = your Vercel URL.
   - Several origins (e.g. preview deploys)? Comma-separate them.
2. Save → Render restarts the service.

## 5. Use it
Open your Vercel URL → **create your account** (first connection) → chat. 🎉

---

## Notes & gotchas
- **Cold start**: the free Render backend sleeps after ~15 min idle; the first request then takes ~50s to wake it. For a smooth always-on demo, upgrade *that* service to **Starter ($7/mo)** — the frontend stays free on Vercel. (Or keep it warm by pinging `…/health` every ~10 min with a free cron such as cron-job.org.)
- **Supabase free** pauses after ~1 week of inactivity and resumes on the next request (data is preserved; the app also falls back to in-memory if Supabase is unreachable).
- **MCP**: the Docker image bundles Node.js, so `npx`-based MCP servers work in the cloud too.
- **AUTH_SECRET** on Render differs from your local one, so old localhost login tokens won't carry over — just log in again on the deployed site (your account/password live in Supabase and still work).
- **`NEXT_PUBLIC_BACKEND_URL`** is inlined at **build time**; if you change it, redeploy the frontend.
