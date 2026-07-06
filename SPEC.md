# TeleCloud — Canonical Specification (SPEC.md)

> **Status: FROZEN.** This document is the single source of truth for every module.
> Per-module build sessions MUST read this file first and conform to the contracts
> defined here. If a module needs to change a shared contract (a table, a shared
> model, or another module's public interface), it must STOP and flag the change
> rather than silently diverging. Drift between sessions is the #1 risk; this file
> exists to prevent it.

> **AMENDMENT (email verification).** The original design used Resend + a custom
> per-profile token flow (`notifications/` + `users/`) for email verification.
> This has been **replaced by Supabase's built-in email confirmation**: Supabase
> sends the confirmation email and owns the link, and a DB trigger mirrors
> `auth.users.email_confirmed_at` onto `profiles.email_verified` (migration
> `0005`). Consequences, reflected below: `notifications/` is removed; `users/`
> no longer runs a verification flow; `auth/` signup issues no session until the
> email is confirmed and exposes `POST /auth/resend-confirmation`.

---

## 1. What TeleCloud is

A cloud storage system that uses **Telegram's Bot API as the storage backend**.
Files are split into fixed **18 MiB** chunks, each chunk is uploaded to a private
Telegram channel via `sendDocument`, and all metadata lives in **Supabase (Postgres)**.
Downloads stream **Telegram → FastAPI → browser** with no disk buffering.

Scale target: ~10 concurrent users. This is a portfolio/résumé project, not a
hyperscale system. Favor correctness and clarity over premature scaling.

### Core constraints (do not violate)

- **18 MiB fixed chunk size** (`CHUNK_SIZE = 18 * 1024 * 1024`). Chosen because the
  Telegram Bot API **download** path (`getFile`) caps file size at **20 MB**. Upload
  (`sendDocument`) allows 50 MB, but the download cap is the binding limit since we
  stream downloads back through the bot. Do NOT use dynamic chunk sizes.
- **No disk buffering** on download. Stream chunk bytes straight through.
- **Two-phase commit** for uploads (see §7.1). A file is not visible/usable until
  all chunks are confirmed and the file row is marked `committed`.
- **Channel-aware storage.** Even though we use one channel today, every chunk
  records which channel + bot it lives in. Never assume a single global channel.

---

## 2. Tech stack

| Concern              | Technology                                  |
|----------------------|---------------------------------------------|
| Backend API          | FastAPI (Python), deployed on Fly.io        |
| DB + Auth store      | Supabase (Postgres + Row Level Security)    |
| Sessions             | JWT (issued/validated against Supabase)     |
| Rate limit + retries | Upstash Redis                               |
| Transactional email  | Supabase built-in email confirmation        |
| Cron / cleanup       | QStash (calls back into FastAPI job routes) |
| Frontend             | Single-file HTML/JS/CSS (designed later)    |
| Repo layout          | Monorepo                                     |

---

## 3. Identity, verification & quota rules

- Auth is **JWT-based**, backed by Supabase. Password hashes etc. live in Supabase.
- Every user has a **profile** row tracking verification status and storage usage.
- **Email verification** (via Supabase's built-in confirmation email) is the only
  "tier" gate:

| State        | Total quota    | Max file size |
|--------------|----------------|---------------|
| Unverified   | **500 MiB**    | **30 MiB**    |
| Verified     | **Unlimited**  | **No cap**    |

- Quota is enforced **before** an upload begins (reject early) and `storage_used_bytes`
  is updated transactionally on commit / delete.
- Constants live in `config/`:
  - `QUOTA_UNVERIFIED_BYTES = 500 * 1024 * 1024`
  - `MAX_FILE_SIZE_UNVERIFIED = 30 * 1024 * 1024`
  - Verified = `None` (sentinel for "unlimited").

---

## 4. Data model (Postgres) — FROZEN

All app tables live in the `public` schema. Supabase Auth owns `auth.users`.
All `id` columns are `uuid` (default `gen_random_uuid()`) unless noted. All
timestamps are `timestamptz` defaulting to `now()`. Soft deletes use a nullable
`deleted_at`.

```sql
-- 4.1 profiles: one row per auth user
create table public.profiles (
    id                            uuid primary key references auth.users(id) on delete cascade,
    email                         text not null,
    email_verified                boolean not null default false,
    storage_used_bytes            bigint not null default 0,
    verification_token            text,            -- pending email-verification token (users/)
    verification_token_expires_at timestamptz,     -- absolute expiry for that token
    created_at                    timestamptz not null default now()
);
create unique index profiles_verification_token_key
    on public.profiles (verification_token)
    where verification_token is not null;

-- 4.2 folders: virtual hierarchy (adjacency list)
create table public.folders (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references public.profiles(id) on delete cascade,
    parent_id   uuid references public.folders(id) on delete cascade,
    name        text not null,
    created_at  timestamptz not null default now(),
    deleted_at  timestamptz
);
create index on public.folders (owner_id, parent_id);

-- 4.3 files: metadata + lifecycle status
create type file_status as enum ('pending', 'committed', 'deleting');

create table public.files (
    id           uuid primary key default gen_random_uuid(),
    owner_id     uuid not null references public.profiles(id) on delete cascade,
    folder_id    uuid references public.folders(id) on delete set null,
    name         text not null,
    size_bytes   bigint not null,
    mime_type    text not null default 'application/octet-stream',
    chunk_count  int not null,
    status       file_status not null default 'pending',
    created_at   timestamptz not null default now(),
    deleted_at   timestamptz
);
create index on public.files (owner_id, folder_id);
create index on public.files (status);

-- 4.4 chunks: one row per 18 MiB piece, channel-aware
create type chunk_status as enum ('pending', 'committed');

create table public.chunks (
    id                uuid primary key default gen_random_uuid(),
    file_id           uuid not null references public.files(id) on delete cascade,
    chunk_index       int not null,            -- 0-based, ordered
    size_bytes        int not null,            -- last chunk may be < CHUNK_SIZE
    channel_id        bigint not null,         -- Telegram channel the chunk lives in
    message_id        bigint not null,         -- Telegram message id (for getFile/delete)
    telegram_file_id  text not null,           -- file_id returned by sendDocument
    bot_id            text not null,           -- which bot uploaded it (RR pool key)
    status            chunk_status not null default 'pending',
    created_at        timestamptz not null default now(),
    unique (file_id, chunk_index)
);
create index on public.chunks (file_id);

-- 4.5 shares: public URL access to a file
create table public.shares (
    id              uuid primary key default gen_random_uuid(),
    file_id         uuid not null references public.files(id) on delete cascade,
    owner_id        uuid not null references public.profiles(id) on delete cascade,
    token           text not null unique,      -- unguessable, URL-safe
    expires_at      timestamptz,               -- null = never expires
    download_limit  int,                       -- null = unlimited
    download_count  int not null default 0,
    revoked         boolean not null default false,
    created_at      timestamptz not null default now()
);
create index on public.shares (token);
```

### RLS expectations

- RLS is **enabled on every table**.
- Default policy: a user can only see/modify rows where `owner_id = auth.uid()`
  (`profiles` keys on `id = auth.uid()`).
- The **share download path** does NOT use the user's JWT. It resolves a file via
  `shares.token` using a **service-role** connection (RLS-bypassing), then enforces
  `revoked`, `expires_at`, and `download_limit` in application code. This is the only
  sanctioned RLS bypass and it lives in the `sharing`/`storage` read path only.

---

## 5. Cross-cutting conventions — FROZEN

### 5.1 Error model
- All API errors return JSON: `{ "error": { "code": <string>, "message": <string> } }`.
- Use a shared exception type `TeleCloudError(code, message, http_status)` defined in
  `shared/`. Middleware (`middleware/`) converts it to the JSON response.
- Reserved codes (extend as needed, keep stable):
  `unauthorized`, `forbidden`, `not_found`, `quota_exceeded`,
  `file_too_large`, `rate_limited`, `upload_incomplete`, `share_expired`,
  `share_revoked`, `telegram_error`, `validation_error`, `internal_error`.

### 5.2 Config
- All configuration is read from environment variables through a single typed
  settings object in `config/` (pydantic `BaseSettings`). No module reads `os.environ`
  directly. No secrets in code.

### 5.3 Shared models
- Pydantic schemas shared across modules (e.g. `FileMeta`, `ChunkMeta`, `UserContext`)
  live in `shared/`. Module-private request/response models live in that module.

### 5.4 Async & no blocking
- All I/O is `async`. Telegram and Redis calls use async clients. Never block the
  event loop with sync HTTP or sleeping.

### 5.5 IDs & time
- UUIDs everywhere for app rows. All timestamps UTC `timestamptz`. Convert relative
  times to absolute at write time.

---

## 6. Module contracts — FROZEN

Each module is a Python package under `telecloud/`. "Public interface" lists what
other modules may import. "Must NOT" lists forbidden responsibilities (those belong
to another module). A module session builds ONLY its own package.

### 6.1 `config/` — settings (no deps)
- **Owns:** the typed `Settings` object; all constants (`CHUNK_SIZE`, quota limits,
  bot tokens list, channel ids, Redis/Resend/QStash/Supabase URLs + keys).
- **Public:** `get_settings() -> Settings` (cached singleton).
- **Must NOT:** import any other telecloud module.

### 6.2 `shared/` — common models, errors, utils (deps: config)
- **Owns:** `TeleCloudError`, shared pydantic models (`UserContext`, `FileMeta`,
  `ChunkMeta`, `FolderMeta`, `ShareMeta`), small pure helpers (token generation,
  human-size formatting, chunk-math helpers).
- **Public:** all of the above.
- **Must NOT:** talk to DB, Telegram, Redis, or HTTP. Pure logic only.

### 6.3 `database/` — Supabase access (deps: config, shared)
- **Owns:** the Supabase/Postgres client factories (one user-scoped client honoring
  RLS via JWT, one service-role client for sanctioned bypass), connection lifecycle,
  the SQL migration files (§4), and typed repository helpers per table
  (`profiles_repo`, `folders_repo`, `files_repo`, `chunks_repo`, `shares_repo`).
- **Public:** repository functions returning shared models; `get_db(user)` and
  `get_service_db()`.
- **Must NOT:** contain business rules (quota math, two-phase logic). It's a data layer.

### 6.4 `auth/` — JWT auth (deps: config, shared, database)
- **Owns:** JWT issue/verify, login/signup/logout routes, password handling delegated
  to Supabase, dependency `current_user()` that yields a `UserContext`. **Email
  verification is Supabase-managed:** signup enables Supabase's confirmation email
  and issues no session until confirmed; `POST /auth/resend-confirmation` re-sends
  it. The `profiles` shell is created by a DB trigger on `auth.users` insert
  (migration `0005`), not by app code at signup.
- **Public:** `current_user` FastAPI dependency; `require_verified` dependency.
- **Must NOT:** enforce quota or manage files. (It no longer sends email itself —
  Supabase does — and there is no `notifications` module to ask.)

### 6.5 `users/` — profile state (deps: config, shared, database)
- **Owns:** reading the profile and exposing verification status (the
  `email_verified` flag) for other modules to read off the row. There is **no
  custom verification flow** — verification is Supabase-managed (see §6.4); a DB
  trigger keeps `profiles.email_verified` in sync with `auth.users`.
- **Public:** `get_profile()`.
- **Must NOT:** compute or store quota usage math (that's `quota/`); it only holds the
  `storage_used_bytes` column via the repo. It no longer issues or redeems
  verification tokens.

### 6.6 `rate_limit/` — Upstash Redis limiter + retry queue (deps: config, shared)
- **Owns:** the async Redis client, a sliding-window/leaky-bucket limiter, and the
  **retry queue** primitives used by `telegram`/`jobs` for failed sends.
- **Public:** `limiter.check(key, limit, window)`, `queue.enqueue(...)`,
  `queue.dequeue(...)`.
- **Must NOT:** know about Telegram specifics or HTTP routing.

### 6.7 `middleware/` — request pipeline (deps: config, shared, auth, rate_limit)
- **Owns:** error-handling middleware (`TeleCloudError` → JSON), request-level rate
  limiting, CORS, request logging.
- **Public:** functions/classes registered on the FastAPI app at startup.
- **Must NOT:** contain feature logic.

### 6.8 `telegram/` — bot pool + transport (deps: config, shared, rate_limit)
- **Owns:** the **round-robin bot pool**, `send_document(channel_id, bytes) ->
  (message_id, telegram_file_id, bot_id)`, `get_file_stream(channel_id, message_id)
  -> async byte iterator`, `delete_message(channel_id, message_id)`. Respects the
  per-channel (~20 msg/min) and per-bot (~30 msg/s) limits via `rate_limit`, and uses
  the retry queue on failure.
- **Public:** the three transport functions + pool accessor.
- **Must NOT:** know about files, chunks-as-a-concept, quota, or DB rows. It moves
  bytes to/from Telegram and reports identifiers back.

### 6.9 `storage/` — chunking engine (deps: config, shared, database, telegram)
- **Owns:** splitting an upload stream into 18 MiB chunks and driving the two-phase
  commit (§7.1); reassembling a download by streaming chunks in order; the
  **HTTP Range → (chunk_index, offset)** mapping for resumable downloads (§7.2).
- **Public:** `store_upload(file_meta, stream) -> committed file`,
  `open_download(file_id, range=None) -> async byte iterator + content headers`.
- **Must NOT:** check quota (asks `quota/` first via `files/`), do auth, or build
  HTTP responses. It yields bytes + metadata; `files/` wraps them in responses.

### 6.10 `quota/` — usage enforcement (deps: config, shared, database, users)
- **Owns:** the quota rules in §3. `check_can_upload(user, size) -> ok | raise`,
  `add_usage(user, delta)`, `subtract_usage(user, delta)` (transactional).
- **Public:** those three functions.
- **Must NOT:** move bytes or touch Telegram.

### 6.11 `folders/` — virtual hierarchy (deps: config, shared, database, auth)
- **Owns:** CRUD over the adjacency-list folder tree, listing folder contents,
  rename/move, soft-delete (cascading to descendants + their files' deletion jobs).
- **Public:** folder CRUD routes + service functions.
- **Must NOT:** manage file bytes.

### 6.12 `files/` — file lifecycle & orchestration (deps: config, shared, database, auth, quota, storage, folders)
- **Owns:** the upload route (calls `quota.check_can_upload` → `storage.store_upload`),
  the authenticated download route (range-aware, calls `storage.open_download`),
  list/rename/move, and **soft-delete** (mark `deleting`, decrement quota, enqueue a
  Telegram-deletion job). This is the orchestrator that ties quota + storage + folders
  together and builds the actual HTTP responses.
- **Public:** file routes + service functions used by `sharing/`.
- **Must NOT:** talk to Telegram directly (goes through `storage`/`telegram`).

### 6.13 `sharing/` — public URL access (deps: config, shared, database, files, storage)
- **Owns:** create/revoke share links, resolve a token to a file, and the **public,
  unauthenticated download route** that uses the service-role DB read + enforces
  `revoked` / `expires_at` / `download_limit`, then reuses `storage.open_download`.
- **Public:** share-management routes (authed) + public download route (token).
- **Must NOT:** bypass the share checks, and must NOT expose owner identity.
- **Open design decisions (decide when building):** default expiry, max download
  count, whether revocation is hard or soft.

### 6.14 `jobs/` — async cleanup via QStash (deps: config, shared, database, telegram, storage, quota, rate_limit)
- **Owns:** QStash-triggered job routes for (a) sweeping stale `pending` chunks from
  abandoned uploads (delete their Telegram messages + DB rows), and (b) executing
  deferred **file deletions** (delete Telegram messages for files in `deleting`,
  then remove rows). Uses the retry queue for transient Telegram failures.
- **Public:** the job HTTP endpoints QStash calls + the enqueue helpers others use.
- **Must NOT:** be callable without QStash signature verification.

### 6.15 `notifications/` — REMOVED
- **Removed by the email-verification amendment.** Verification email is now sent
  by **Supabase's built-in confirmation** (see §6.4), so there is no transactional
  email to send from app code. The package has been deleted; the Resend
  configuration is no longer used.

---

## 7. Key flows — FROZEN

### 7.1 Upload (two-phase commit)
1. `files/` receives the upload. Reads declared size.
2. `quota.check_can_upload(user, size)` — reject early on `quota_exceeded` /
   `file_too_large`.
3. Create a `files` row with `status='pending'`, `chunk_count` computed.
4. `storage.store_upload` reads the stream in 18 MiB pieces. For each piece:
   - `telegram.send_document(channel, bytes)` → `(message_id, file_id, bot_id)`.
   - Insert a `chunks` row with `status='pending'` and the returned identifiers.
5. When **all** chunks are inserted, in one transaction: set all chunks
   `committed`, set the file `committed`, and `quota.add_usage(user, size)`.
6. If anything fails mid-way, the file stays `pending` and the `jobs/` sweeper later
   deletes the orphaned Telegram messages + rows. The client may retry.

### 7.2 Download with Range (resumable)
- Request may include `Range: bytes=start-end`.
- `storage.open_download` maps `start` to `chunk_index = start // CHUNK_SIZE` and
  `offset = start % CHUNK_SIZE`. It streams from that chunk's `getFile` stream,
  skipping `offset` bytes, then continues through subsequent chunks until `end`.
- A range may span chunk boundaries — continue into the next chunk seamlessly.
- Respond `206 Partial Content` with correct `Content-Range`/`Accept-Ranges: bytes`
  when a range is given, else `200` with full `Content-Length`.

### 7.3 Share download
- Public route receives `token`. `sharing/` loads the share via service-role DB.
- Reject `revoked`, expired (`expires_at < now()`), or over `download_limit`.
- Otherwise increment `download_count` and stream via `storage.open_download`
  (range supported here too). No auth, no owner info leaked.

### 7.4 Cleanup (QStash → jobs)
- **Orphan sweep:** find `files` in `pending` older than a threshold; for each, delete
  every chunk's Telegram message and DB rows.
- **Deferred delete:** find `files` in `deleting`; delete Telegram messages, then rows.
- Both use the retry queue for transient `telegram_error`s.

---

## 8. Build order (dependency-respecting)

Build foundation first; never build a module before its dependencies' contracts exist.

```
1. config          7. telegram
2. shared          8. storage
3. database        9. quota
4. auth           10. folders
5. users          11. files
6. rate_limit     12. sharing
   └ middleware   13. jobs
     (after auth + rate_limit)
```

(`notifications/` was removed by the email-verification amendment — see §6.15.)

Suggested session order: `config → shared → database → auth → users →
rate_limit → middleware → telegram → storage → quota → folders → files →
sharing → jobs`.

Each session: read this SPEC.md, build ONLY the named module to its §6 contract,
do not touch other folders, and flag (don't make) any needed change to a shared
contract.
