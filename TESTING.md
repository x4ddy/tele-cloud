# TeleCloud — Testing Guide (TESTING.md)

Companion to `SPEC.md`. Two tiers: **per-module unit tests** (run inside each module
session, externals mocked) and **integration milestones** (run at a few points against
real services). Each module prompt already lists the unit tests that module must ship;
this file is the shared reference for *how* to test and *what* to verify end-to-end.

---

## Tooling

| Purpose                     | Tool                                            |
|-----------------------------|-------------------------------------------------|
| Test runner                 | `pytest`                                        |
| Async tests                 | `pytest-asyncio`                                |
| HTTP route tests            | FastAPI `TestClient` / `httpx.AsyncClient`      |
| Mock outbound HTTP          | `respx` (or `responses`)                        |
| Fake Redis                  | `fakeredis` (async)                             |
| Real Postgres + RLS locally | `supabase start` (local Supabase via Docker)    |

Run a single module's suite: `pytest telecloud/<module>/`. Keep Tier-1 tests offline and
fast — no real network.

---

## Tier 1 — Per-module unit tests (mock the externals)

Mock the external service at each module's boundary so logic is tested in isolation:

| External dependency | Mock with                                  |
|---------------------|--------------------------------------------|
| Supabase / Postgres | mock the `database/` repo layer (or local Supabase for `database/` itself) |
| Upstash Redis       | `fakeredis`                                |
| Telegram Bot API    | `respx`, or a fake transport object        |
| Resend / QStash     | `respx`                                     |
| HTTP routes         | `TestClient` / `AsyncClient`               |

### Per-module focus (the test that actually matters)

- **`shared`** — chunk-math (count + `(chunk_index, offset)` from a byte offset) and
  token generation. Pure, no mocks.
- **`config`** — loads with a test env; fails fast when a required var is missing.
- **`database`** — best tested against **local Supabase**: migrations apply and **RLS
  blocks cross-user access** (mocked tests can't prove RLS).
- **`notifications`** — `respx`-stub Resend; assert payload + error handling.
- **`auth`** — token verify with a known secret; `current_user` (happy + 401);
  `require_verified` (403 when unverified).
- **`users`** — verification happy path + invalid/expired token path.
- **`rate_limit`** — limiter window behavior; enqueue/dequeue/dead-letter transitions.
- **`middleware`** — the `{ "error": { "code", "message" } }` envelope; the 429 path.
- **`telegram`** — mocked Bot API: round-robin rotation, retry-enqueue on failure,
  streaming read.
- **`storage`** — mock `telegram` + `database`: correct chunk count, the commit
  transition, a single-chunk range, and a **range spanning two chunks** (the tricky one).
- **`quota`** — unverified over per-file cap, over total cap, under both; verified
  unlimited; add/subtract correctness incl. no-negative.
- **`folders`** — create under parent; move-cycle rejection; cascading soft-delete
  marks descendants.
- **`files`** — upload happy path + quota-reject; range download returns `206` with
  correct headers; soft-delete decrements quota + enqueues deletion.
- **`sharing`** — create→download happy path; revoked/expired/over-limit rejected; no
  owner info leaks in the public response.
- **`jobs`** — QStash signature rejection; orphan sweep deletes pending chunks+rows;
  deferred delete removes `deleting` files; dead-letter after repeated Telegram failures.

**Gate:** `pytest` green for a module before moving to the next.

---

## Tier 2 — Integration milestones (real services)

Mocks prove the logic; they don't prove the premise. Run these against real Supabase
(local), real Upstash, and a real **test bot + private channel**.

### Milestone 1 — after `database`
Migrations apply cleanly to local Supabase, and **RLS actually blocks** one user from
reading another user's rows. (RLS bugs never appear in mocked tests.)

### Milestone 2 — after `telegram` (do this manually, early)
The entire project rests on one assumption: an **18 MiB chunk uploads via
`sendDocument` and comes back through `getFile` under the 20 MB download cap**. Make a
real bot + private channel, push one chunk, stream it back, **byte-diff** the result.
If this fails, stop and rethink chunk size before building anything on top.

### Milestone 3 — after `files`
Full authenticated cycle against real services:
`signup → verify email → create folder → upload a multi-chunk file → list → download
with a Range header`. Assert the download is **byte-identical** and a ranged request
returns **`206`** with correct `Content-Range` / `Accept-Ranges`.

### Milestone 4 — after `sharing` + `jobs`
- Create a share link → download it **unauthenticated** → revoke → confirm rejected.
- Confirm expired and over-`download_limit` shares are rejected.
- Trigger the **orphan sweep** and confirm a `pending` file's Telegram messages are
  deleted; trigger **deferred delete** and confirm `deleting` files are removed.

---

## What "done" looks like

- Every module: Tier-1 suite green with externals mocked.
- All 4 integration milestones pass against real services.
- The assembly pass (`prompts/16-assembly.md`) reports no unresolved code/SPEC drift
  and `GET /openapi.json` + `/docs` are complete — that OpenAPI spec is the contract the
  frontend is generated against.
