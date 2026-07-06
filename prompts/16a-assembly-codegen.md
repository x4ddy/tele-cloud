# Build prompt — `16A` Assembly: Analysis + Codegen (for Gemini Flash 3.5)

You are analyzing the **TeleCloud** project. All 15 modules are already built. Your job
is **analysis and code generation only — you have NO shell access and you will NOT run
anything**. You produce two artifacts: a **drift report** and **`main.py`**. A separate
executor (Claude Code, with a shell) will validate and run them afterward.

**Write both artifacts to disk as files** so the executor can read them by path:
`main.py` at its correct location, and the drift report to **`DRIFT_REPORT.md`** in the
repo root. If you have no file-write access, output them as clearly fenced blocks each
labeled with its target path so they can be saved manually.

## Read first, in this priority order
1. **`SPEC.md`** (repo root) — the frozen contracts. This is what *should* be true.
2. **The actual code of every module** under `telecloud/` — the real function
   signatures, imports, and router objects. This is what *is* true.
3. Module READMEs — orientation only. **Do NOT trust a README over the real code.** If a
   README and the code disagree, the code is reality and SPEC is the intended contract.

Also read `TESTING.md` for context on what the executor will later verify (you do not
run any of it).

## Artifact 1 — Drift report (write to `DRIFT_REPORT.md`)
Find every place where **code ≠ SPEC** or where a *consumer* module imports/calls
something that does not match the *provider* module's real interface. For each finding,
give:
- the **consumer** file + line (who calls it),
- the **provider** file + function (what's actually defined),
- the **expected vs. actual signature** (exact),
- a one-line description of the mismatch.

Example shape:
> `files/service.py:88` calls `quota.add_usage(user, delta)` →
> `quota/usage.py:31` defines `add_usage(user_id: str, bytes: int)` →
> mismatch: passes `UserContext` + `delta`, provider expects `user_id` + `bytes`.

Note: SPEC has already absorbed at least one accepted drift (`profiles` carries
`verification_token` columns). Expect a few more; list every one you find. If you find
none, state that explicitly.

## Artifact 2 — `main.py`
Generate the app entrypoint (`telecloud/main.py` or `telecloud/app.py` — match the
repo's import layout). It must:
- Create the FastAPI app via an app factory.
- Register middleware by calling the real function `middleware/` exposes (e.g.
  `register_middleware(app)` — verify the actual name in code).
- `app.include_router(...)` for every module that defines a router — `auth`, `users`,
  `files`, `folders`, `sharing`, `jobs`, and any others the code actually exposes. Use
  sane prefixes/tags. The public share download route (`/s/{token}`) must be reachable
  **without auth** (SPEC §7.3).
- **Lifespan wiring** (startup/shutdown): initialize and dispose the shared resources
  once — the Supabase/Postgres clients (`database/`), the Upstash Redis connection
  (`rate_limit/`), and the Telegram bot pool (`telegram/`). Inject them where modules
  expect them. Validate required config via `config.get_settings()` and fail fast.
- A **health check** endpoint (`GET /health`).
- Keep the QStash job routes (from `jobs/`) registered with their signature
  verification intact.

Wire against the **real** signatures you read in the code, not what SPEC wishes they
were. Where code and SPEC disagree, wire to the code AND record it in the drift report —
do not invent an adapter to hide it.

## Hard rules (unchanged — apply to all your output)
- **Flag, don't fix.** Do NOT edit any module's internals to paper over a mismatch.
  Record it in the drift report; the executor/user resolves it by re-running that
  module's prompt. The only file you author is the assembly glue (`main.py`).
- **No redesign.** Do not restructure modules or change their logic.
- **No new features.** Integration glue only.
- **Reuse `config/` and `shared/`.** Do not introduce a second source of config, error
  types, or shared models.
- **Do NOT execute anything** — no test runs, no migrations, no milestone checks. You
  have no shell. Leave all execution to Prompt 16B.

## Handoff section (end your output with this, formatted for Claude Code to ingest)
Put this `## HANDOFF` section at the end of `DRIFT_REPORT.md` so Claude Code can read it
as a task list:
- **Files created:** path of `main.py` (+ any other glue file) and `DRIFT_REPORT.md`,
  one line each.
- **Drift items to resolve:** numbered list, each with file/function/signature and the
  fix needed, phrased as an actionable task.
- **Assumptions made:** anything you wired that you could not fully confirm from the
  code, so the executor knows what to double-check.
- **Next step:** "Start a Prompt 16B (Claude Code) session; it will read `main.py` and
  `DRIFT_REPORT.md` by path for validation and milestone execution."
