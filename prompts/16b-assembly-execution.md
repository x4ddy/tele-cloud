# Build prompt — `16B` Assembly: Validation + Execution (for Claude Code)

You are finishing the **TeleCloud** integration. A prior analysis/codegen pass
(Prompt 16A, run on Gemini Flash) has already written two files to the repo: the drift
report at **`DRIFT_REPORT.md`** (repo root) and a generated **`main.py`**. **Read both
by path first.** All 15 modules are built. You have a shell and real services. Your job
is to validate that draft work, wire the app for real, and run the integration
milestones until they pass.

## Treat 16A's output as an UNVERIFIED DRAFT, not ground truth
16A could not run anything and was produced by a weaker model. Before trusting it:
- **Re-verify the drift report** (`DRIFT_REPORT.md`) against the actual code. Use grep /
  imports / reading the real signatures. Add any mismatches 16A missed; drop any it
  hallucinated. Update `DRIFT_REPORT.md` in place — the corrected report is yours to own.
- **Validate `main.py`** by actually importing it and starting the app. Do not assume it
  is correct because 16A wrote it.

Read in priority order if anything is ambiguous: **`SPEC.md`** (intended contract) →
**real module code** (reality) → READMEs (orientation only, never over the code). Also
read `TESTING.md` for the milestone definitions.

## Steps
1. **Validate `main.py`** (already on disk from 16A). Confirm it's at the correct path
   for the import layout (move it if 16A misplaced it). Fix import/wiring errors you find
   while validating — but only in the glue layer, never inside a module (see hard rules).
2. **Reconcile drift.** For each item in the corrected drift report: if the user has
   already fixed it (re-ran the module prompt), confirm the code now matches and the
   wiring lines up. If an item is still unresolved, **STOP and report it** — do not
   patch the module to hide it; the user resolves it by re-running that module's prompt.
3. **Boot the app.** Start it; confirm it imports, middleware registers, all routers
   mount, lifespan initializes the DB/Redis/Telegram-pool resources, `/health` responds,
   and `/s/{token}` is reachable without auth.
4. **Run the 4 integration milestones (TESTING.md) against REAL services** — local
   Supabase (`supabase start`), real Upstash, a real test bot + private channel:
   1. **DB + RLS:** migrations apply; a user cannot read another user's rows.
   2. **Telegram round-trip:** push one 18 MiB chunk via `sendDocument`, pull it back
      via `getFile`, byte-diff equal.
   3. **Full authed cycle:** signup → verify email → create folder → upload a
      multi-chunk file → list → download with a `Range` header → assert `206` +
      byte-identical.
   4. **Sharing + jobs:** create share → unauthenticated download → revoke → confirm
      rejected; expired + over-limit rejected; trigger orphan sweep and confirm a
      `pending` file's Telegram messages are deleted.
   For **each** milestone: run it, **show the raw output**, and on failure diagnose,
   patch (glue layer only — or STOP and flag if the failure is inside a module), and
   **re-run until it passes**. Do not declare a milestone passed without showing output.
5. **Final check:** `GET /openapi.json` — confirm it is complete and accurate (every
   mounted router's routes present, request/response shapes correct). Confirm `/docs`
   renders. This spec is the contract the frontend will be generated against.

## Hard rules (unchanged — keep all of these intact)
- **Flag, don't fix.** Never edit a module's internals to paper over a mismatch or a
  milestone failure that originates inside a module. Report it; the user re-runs that
  module's prompt. You may only author/patch the assembly glue (`main.py` + app wiring).
- **No redesign.** Do not restructure modules or change their logic.
- **No new features.** Integration + verification only.
- **Reuse `config/` and `shared/`.** No second source of config, error types, or models.

## Deliverables
- The applied, working `main.py` + any glue, booting cleanly.
- The **corrected drift report** (with a note on which items 16A got wrong/missed).
- The 4 milestones each shown passing with raw output (or a clear STOP+flag if blocked
  by an unresolved in-module issue).
- Confirmation that `GET /openapi.json` and `/docs` are complete and accurate.
