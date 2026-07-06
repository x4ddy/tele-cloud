# Backend Brief — make TeleCloud's API deploy on Render and work with the Vercel frontend

> **Audience:** a fresh coding session with no prior context. Read this top to
> bottom, then do the work in **§7 (Task list)**. Everything else is the context
> and exact contract you need.

---

## 1. What exists today

- A FastAPI backend lives in [`telecloud/`](telecloud/). Entry point:
  [`telecloud/main.py`](telecloud/main.py) exposes `app = create_app()` (ASGI).
- The design is governed by [`SPEC.md`](SPEC.md), marked **FROZEN**. Do **not**
  change business logic or wire contracts. The changes in this brief are
  *additive deploy glue* (a config field, CORS wiring, a `requirements.txt`, a
  `render.yaml`) — none touch the frozen request/response contracts.
- There is currently **no** `requirements.txt`, **no** start command, and CORS
  allows only one origin. Those three gaps are why Render + a separate Vercel
  frontend won't work yet. Fix exactly those.
- A new **frontend** lives in [`frontend/`](frontend/) (Vite + vanilla JS, hosted
  on Vercel). It is the only client. The contract it depends on is in **§4** —
  treat it as fixed; the frontend is already built against it.

## 2. Target topology

```
Browser ──HTTPS──> Vercel (static frontend, frontend/)  ── calls ──>  Render (FastAPI, telecloud/)
                                                                         │
                                          Supabase (Auth + Postgres), Upstash Redis, Telegram, QStash
```

- **Frontend origin** (Vercel), e.g. `https://telecloud.vercel.app`.
- **Backend origin** (Render), e.g. `https://telecloud-api.onrender.com`.
- They are **different origins**, so the backend MUST send correct CORS headers
  for the frontend origin, and `APP_BASE_URL` must point at the **frontend**
  (it's used to build share links + the Supabase email-confirmation redirect).

## 3. How auth/session works (so you don't add a refresh endpoint)

- `POST /auth/login` returns Supabase tokens (`access_token`, `refresh_token`,
  `expires_in`, `user`). The access token is a standard Supabase JWT (~1h TTL).
- **The frontend refreshes tokens itself**, directly against Supabase's
  `POST {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token` using the public
  anon key (exactly like the official Supabase JS client). **You do NOT need to
  add a `/auth/refresh` endpoint.** Leave the auth module alone.
- Email confirmation is Supabase-managed. Supabase redirects the user to
  `{APP_BASE_URL}/index.html#access_token=...` after they click the email link.
  Therefore:
  - `APP_BASE_URL` must be the **Vercel frontend URL**.
  - That URL (and `…/index.html`) must be in **Supabase → Authentication → URL
    Configuration → Redirect URLs**.

## 4. The frontend ↔ backend contract (FIXED — do not change shapes)

All errors use the envelope `{"error": {"code": "...", "message": "..."}}`.
All authed requests send `Authorization: Bearer <access_token>`.

### Auth
| Method & path | Request body | Success | Notes |
| --- | --- | --- | --- |
| `POST /auth/login` | `{email, password}` | `200 {access_token, refresh_token, token_type, expires_in, user:{id,email,email_verified}}` | |
| `POST /auth/signup` | `{email, password}` | `201 {email, confirmation_required, message}` | no session issued |
| `POST /auth/resend-confirmation` | `{email}` | `202` (empty) | never reveals account state |
| `POST /auth/logout` | `{refresh_token?}` | `204` | authed |
| `GET /users/me` | — | `200 {id, email, email_verified}` | authed; `401` if token invalid |

### Folders
| Method & path | Body | Success |
| --- | --- | --- |
| `GET /folders` | — | `200 {folder_id:null, folders:[{id,name,created_at}], files:[{id,name,size_bytes,created_at,mime_type}]}` |
| `GET /folders/{id}` | — | same shape, `folder_id:{id}` |
| `POST /folders` | `{name, parent_id}` | `201 {id,name,created_at,...}` |
| `PATCH /folders/{id}` | `{name}` | `200` |
| `POST /folders/{id}/move` | `{new_parent_id}` | `200` |
| `DELETE /folders/{id}` | — | `204` |

### Files
| Method & path | Body | Success | Notes |
| --- | --- | --- | --- |
| `POST /files?name=<n>&folder_id=<id?>` | **raw file bytes** as the request body | `201` | `Content-Type: <mime>`; `folder_id` omitted ⇒ root. Frontend uploads via `XMLHttpRequest` for progress. |
| `GET /files/{id}` | — | `200` file bytes | sends `Content-Disposition` (filename); streamed download |
| `PATCH /files/{id}` | `{name}` | `200` |
| `POST /files/{id}/move` | `{folder_id}` | `200` |
| `DELETE /files/{id}` | — | `204` |

### Shares
| Method & path | Body | Success | Notes |
| --- | --- | --- | --- |
| `GET /shares?file_id=<id>` | — | `200 {shares:[{id,token,revoked,expires_at,download_limit,download_count}]}` | |
| `POST /shares` | `{file_id, expires_at?, download_limit?}` | `201` | |
| `POST /shares/{id}/revoke` | — | `200` | |
| `GET /s/{token}` | — | `200/206` file bytes | **public, unauthenticated.** Frontend probes with `Range: bytes=0-0` and reads `Content-Range`/`Content-Length` + `Content-Disposition`. Must support range + expose those headers (see CORS note). |

### CORS headers the browser needs
- For all of the above: allow the frontend origin, methods `*`, headers `*`,
  and `Authorization`.
- For `GET /s/{token}` and `GET /files/{id}` the frontend reads response headers
  `Content-Disposition`, `Content-Range`, `Content-Length`. Cross-origin JS can
  only read these if they're in `Access-Control-Expose-Headers`. **Add an
  `expose_headers` list** (see §5) or downloads/share-size display will be wrong.

## 5. Required backend changes (additive, flagged in the code already)

### 5a. Multi-origin CORS + exposed headers
`telecloud/middleware/cors.py` already documents that `config` *should* gain an
explicit allowed-origins list, and `register_middleware(..., cors_origins=...)`
already accepts an override. Wire it up:

1. **Add a config field** in [`telecloud/config/settings.py`](telecloud/config/settings.py)
   (`Settings` class), mirroring the CSV pattern used for `telegram_bot_tokens`:

   ```python
   from typing import Annotated
   from pydantic import NoDecode

   # -- App --
   #: Extra browser origins allowed by CORS (comma-separated), e.g. the Vercel
   #: frontend URL(s). The origin derived from app_base_url is always allowed too.
   cors_allowed_origins: Annotated[list[str], NoDecode] = []

   @field_validator("cors_allowed_origins", mode="before")
   @classmethod
   def _split_origins(cls, value: object) -> object:
       if isinstance(value, str):
           return [v.strip().rstrip("/") for v in value.split(",") if v.strip()]
       return value
   ```

2. **Have `register_cors` expose headers and merge origins.** In
   `telecloud/middleware/cors.py`, update `resolve_cors_origins` to union the
   `app_base_url` origin with `settings.cors_allowed_origins`, and add
   `expose_headers` to the middleware:

   ```python
   def resolve_cors_origins(settings=None):
       settings = settings or get_settings()
       origins = set()
       base = _origin_of(settings.app_base_url)
       if base:
           origins.add(base)
       origins.update(getattr(settings, "cors_allowed_origins", []) or [])
       return sorted(origins)
   ```
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=allowed,
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
       expose_headers=["Content-Disposition", "Content-Range", "Content-Length", "Accept-Ranges"],
   )
   ```

   > Tip for Vercel **preview** deployments (random `*.vercel.app` subdomains):
   > additionally pass `allow_origin_regex=r"https://.*\.vercel\.app"` to
   > `CORSMiddleware`. Optional; only if you use preview deploys.

3. No change needed in `main.py` if `register_cors` reads settings itself — it
   already does. Just make sure `register_middleware(app)` runs (it does).

### 5b. Nothing else in the app code (required)
Do not add `/auth/refresh`, do not touch routers/services/schemas. The frontend
handles refresh (see §3).

### 5c. (OPTIONAL) Signed download URL for native browser downloads
Owner downloads (`GET /files/{id}`) require an `Authorization` header, so the
frontend must fetch the bytes itself and can't hand the URL to the browser's
native download manager (the one with the OS-level progress/ETA). The frontend
already streams the download with an in-app progress bar + ETA, which is fine.

If you want the *true* browser-download-tab experience for owner files, add a
short-lived **signed download URL** the browser can `GET` without a custom header
— e.g. `POST /files/{id}/download-url` → `{ url }` where `url` is `GET /files/{id}?dl=<short-lived-HMAC-token>`
that the files router also accepts (verify the token, ignore the missing bearer).
Then the frontend can just navigate to `url`. This mirrors how the public share
route `/s/{token}` already works. **Optional** — only if the in-app progress isn't
enough. If you add it, tell the frontend session so it can switch owner downloads
to a direct navigation.

## 5d. (HIGH PRIORITY) Per-request latency — fix the connection churn

**Symptom:** simple operations (open a folder, create a folder) take *seconds*,
even though each is a single request. **Root cause is server-side**, not the
frontend (which sends exactly one request per action).

**What's slow.** Every authenticated request opens brand-new connections to
Supabase instead of reusing a pool:

- `auth.current_user` → `database.get_db(token)` calls **`create_async_client()`
  — a fresh Supabase client** — to read the `profiles` row, then closes it.
- The route service (e.g. `folders.service.list_contents`) calls
  **`get_db(access_token)` *again* — a second fresh client** — for the actual work.
- Each `create_async_client` + first query does a **new TCP + TLS handshake to
  Supabase PostgREST** with no keep-alive reuse across requests.
- The rate-limit middleware adds **one Upstash Redis REST round-trip** per request.

So a single folder open ≈ 2 client constructions + 2–4 PostgREST queries over
freshly-handshaked connections + 1 Redis call. If the server and Supabase aren't
in the same region, each handshake is 100–400ms → multi-second responses.

**Fixes, in priority order:**

1. **Stop creating a client per request — reuse connections.** The Supabase
   `AsyncClient` wraps `httpx`; a long-lived client reuses keep-alive connections
   and eliminates the repeated TLS handshakes. Approaches (pick one):
   - *Easiest 2× win:* resolve the profile and run the handler on the **same**
     `get_db` client within one request (pass it down / cache on `request.state`)
     instead of creating two. Cuts client constructions + handshakes in half.
   - *Real fix:* keep a **process-wide pooled PostgREST client** and apply the
     user's JWT **per call** (set the `Authorization` header on the request)
     rather than `client.postgrest.auth(jwt)` (which mutates shared state and is
     why the code recreates the client). If per-call auth isn't ergonomic in the
     installed `supabase`/`postgrest` version, keep a small acquire/release
     **pool** of clients so the underlying httpx connections are reused.
   - Ensure the JWKS and Upstash HTTP clients are also long-lived (reused), not
     per-call.
2. **Co-locate regions.** Put the Render service in the **same region** as the
   Supabase project (and Upstash DB). Cross-region adds latency to *every* round
   trip; with several per request it dominates. This alone often takes seconds → sub-second.
3. **Trim the rate-limiter cost.** It does a Redis REST round-trip per request.
   Use an Upstash region near Render, reuse one pooled HTTP client for it, and/or
   make it best-effort (don't block the response on it).
4. **Fewer queries per request.** `current_user` does a `profiles` SELECT on every
   request. For paths that don't gate on verification, consider a short-lived
   per-token profile cache (a few seconds) so repeated requests skip the round
   trip. (Keep it authoritative where the tier gate matters — SPEC §3.)

**Verify with numbers.** Add a tiny timing log (or use the existing request-logging
middleware's duration) and confirm a *warm* `GET /folders` is well under ~150ms
server-side once co-located + pooled. If it isn't, the remaining time is the
Supabase/Upstash round trips — chase region + pooling.

## 6. Render deployment files (create these)

### 6a. `requirements.txt` (repo root) — pinned to the versions this code targets
```text
fastapi==0.115.12
uvicorn[standard]==0.34.2
starlette==0.46.2
pydantic==2.12.5
pydantic-settings==2.8.1
supabase==2.31.0
supabase-auth==2.31.0
httpx==0.28.1
PyJWT==2.12.1
python-jose==3.4.0
python-multipart==0.0.27
email-validator==2.2.0
redis==5.2.1
cryptography==44.0.0
anyio==4.12.0
```
> Verify against the working dev environment with `pip freeze`; the app imports
> `fastapi, starlette, pydantic, pydantic_settings, supabase, supabase_auth,
> httpx, jwt (PyJWT), cryptography`. `python-jose`/`python-multipart` are included
> defensively; drop any that `pip check` says are unused. `uvicorn[standard]` is
> the ASGI server Render runs.

### 6b. `render.yaml` (repo root) — Render Blueprint
```yaml
services:
  - type: web
    name: telecloud-api
    runtime: python
    plan: free
    buildCommand: "pip install -r requirements.txt"
    startCommand: "uvicorn telecloud.main:app --host 0.0.0.0 --port $PORT"
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: PYTHON_VERSION
        value: "3.12.4"
      # Secrets — set these in the Render dashboard (sync:false = not in git):
      - key: TELEGRAM_BOT_TOKENS
        sync: false
      - key: TELEGRAM_CHANNEL_IDS
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SUPABASE_JWT_SECRET
        sync: false
      - key: UPSTASH_REDIS_REST_URL
        sync: false
      - key: UPSTASH_REDIS_REST_TOKEN
        sync: false
      - key: QSTASH_CURRENT_SIGNING_KEY
        sync: false
      - key: QSTASH_NEXT_SIGNING_KEY
        sync: false
      - key: APP_BASE_URL
        sync: false   # = the Vercel frontend URL, no trailing slash
      - key: CORS_ALLOWED_ORIGINS
        sync: false   # = the Vercel frontend URL (+ any extra origins, comma-separated)
      - key: APP_ENV
        value: production
```
> `$PORT` is provided by Render — bind to it, not 8000. `/health` already exists
> in `main.py`. If you don't use a Blueprint, set the **Build Command** and
> **Start Command** above in the Render web-service UI and add the env vars there.

### 6c. Python version pin (optional but recommended)
Add a `runtime.txt` at repo root with `python-3.12.4` (or set `PYTHON_VERSION`
as above). Match the version the code was developed on.

## 7. Task list (do these)

> **Execution note:** the phases below are ordered by priority, but the
> *cheapest* way to run this brief across sessions is **not** one session per
> phase. Phase 1 is the only part that needs deep context (perf/connection code,
> CORS middleware) and iteration; Phases 2 and 3 are mechanical file creation and
> mostly manual dashboard clicking. Splitting into 3 sessions triples the fixed
> cost of re-reading SPEC.md / main.py / config / cors / db client in each fresh
> session for little benefit. Prefer **2 sessions**: Session A = Phase 1 only,
> Session B = Phase 2 + Phase 3 together. Use 3 sessions only if you want a hard
> stop-and-verify checkpoint between "files created" and "deployed."

### Phase 1 — Fix what's broken/slow (do first, highest impact)

0. **(Perf, high priority)** Fix the per-request connection churn (§5d): reuse a
   pooled Supabase client instead of `create_async_client` per request, and
   co-locate the Render/Supabase/Upstash regions. This is the cause of the
   "several seconds to open/create a folder" complaint.
1. Add `cors_allowed_origins` config field + validator (§5a.1).
2. Union origins in `resolve_cors_origins` and add `expose_headers` in
   `register_cors` (§5a.2). Optionally add the `*.vercel.app` regex.

### Phase 2 — Make it deployable

3. Create `requirements.txt` (§6a). Run `pip install -r requirements.txt` in a
   clean venv and `pip check`; trim/adjust pins until it imports cleanly and
   `uvicorn telecloud.main:app` boots locally.
4. Create `render.yaml` (and optional `runtime.txt`) (§6b/§6c).
5. Confirm the app starts with `uvicorn telecloud.main:app --port 8000` against a
   filled `.env` (see [`.env.example`](.env.example)); hit `GET /health` → `{"status":"ok"}`.

### Phase 3 — Deploy and wire up external config

6. Deploy to Render. Then set on Render: `APP_BASE_URL` = Vercel URL,
   `CORS_ALLOWED_ORIGINS` = Vercel URL, plus all Supabase/Telegram/Upstash/QStash
   secrets.
7. In **Supabase → Authentication → URL Configuration**, add the Vercel URL and
   `<vercel-url>/index.html` to **Redirect URLs**, and set **Site URL** to the
   Vercel URL.
8. In **Vercel**, set the frontend's `VITE_API_BASE` to the Render URL and
   redeploy.

## 8. Acceptance checks (end-to-end)

- `GET https://<render>/health` → `200 {"status":"ok"}`.
- From the deployed Vercel app: sign up → receive Supabase email → click link →
  lands on the frontend, logs in, reaches the dashboard.
- Browser devtools **Network** tab shows API calls to the Render origin returning
  `Access-Control-Allow-Origin: <vercel-origin>` (no CORS errors in console).
- Upload a file, download it (filename correct ⇒ `Content-Disposition` exposed),
  create a share link, open it in an incognito window (public `/s/{token}` works,
  file size shows ⇒ `Content-Range`/`Content-Length` exposed).
- Leave the tab idle > 1 hour, then act again → no forced logout (token refresh
  works). First call after Render idle may show a brief "waking up" notice, then
  succeeds (cold-start retry works).

## 9. Gotchas

- **Bind to `$PORT`** on Render, not a hardcoded port.
- **`APP_BASE_URL` = frontend (Vercel) URL**, not the Render URL — it drives the
  email redirect and share links. Getting this wrong sends confirmed users to the
  wrong place.
- **Expose headers** or downloads get a generic filename and the public share
  page shows `0 Bytes`.
- Render free tier **spins down when idle**; the first request cold-starts (~30–60s).
  The frontend already retries with backoff and shows a notice, so this is a UX
  delay, not a failure — but don't be surprised by the first slow request.
- Keep secrets out of git. `SUPABASE_ANON_KEY` is the *only* Supabase value also
  used by the frontend (it's public by design); the **service role key and JWT
  secret are backend-only — never put them in the frontend.**
