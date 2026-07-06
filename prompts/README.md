# TeleCloud — Per-module build prompts

Each file is a self-contained prompt for **one** module. Open a **fresh session** per
module and paste the prompt. Every prompt tells the session to read the frozen
`SPEC.md` first and build only that module.

## How to use
1. Start a new session in this repo.
2. Paste the contents of the next-numbered prompt file.
3. Let it build only that module. Review, commit.
4. Move to the next number.

## Build order (dependency-respecting)

| # | Module          | Depends on (contracts must exist first)            |
|---|-----------------|----------------------------------------------------|
| 01 | `config`       | —                                                  |
| 02 | `shared`       | config                                             |
| 03 | `database`     | config, shared                                     |
| 04 | `notifications`| config, shared                                     |
| 05 | `auth`         | config, shared, database                           |
| 06 | `users`        | config, shared, database, notifications            |
| 07 | `rate_limit`   | config, shared                                     |
| 08 | `middleware`   | config, shared, auth, rate_limit                   |
| 09 | `telegram`     | config, shared, rate_limit                         |
| 10 | `storage`      | config, shared, database, telegram                 |
| 11 | `quota`        | config, shared, database, users                    |
| 12 | `folders`      | config, shared, database, auth (+ files entrypoint)|
| 13 | `files`        | config, shared, database, auth, quota, storage, folders |
| 14 | `sharing`      | config, shared, database, files, storage           |
| 15 | `jobs`         | config, shared, database, telegram, storage, quota, rate_limit |

## Two known cross-order dependencies (already flagged in the prompts)
- **`folders` (12) → `files` (13):** folder soft-delete calls `files`' deletion
  entrypoint. If you build folders first, the cascade hook will be flagged as a pending
  dependency until `files` exists. Alternatively build `files` first, then `folders`.
- **`files` (13) → `jobs` (15):** soft-delete enqueues a deletion job. The enqueue
  helper lives in `jobs`. The `files` prompt flags this; either stub the enqueue call or
  build `jobs` right after `files`.

If any session needs to change a shared contract (a table, a `shared/` model, or another
module's interface), it must STOP and flag it against `SPEC.md` — never diverge silently.

## Final step — assembly (after all 15 modules)

Assembly is split across two models:

| Prompt | Run on | Does |
|--------|--------|------|
| `16a-assembly-codegen.md` | Gemini Flash 3.5 | Reads SPEC + all modules; writes `main.py` + `DRIFT_REPORT.md` to disk. **No execution** (no shell). `DRIFT_REPORT.md` ends with a HANDOFF task list. |
| `16b-assembly-execution.md` | Claude Code | Reads `main.py` + `DRIFT_REPORT.md` by path **as an unverified draft**, re-verifies the drift report against real code, validates `main.py`, then runs the 4 integration milestones (`TESTING.md`) against real services until they pass. Confirms `/openapi.json`. |

Flow: run **16A** (Gemini) → it writes `main.py` + `DRIFT_REPORT.md` → start a **16B**
(Claude Code) session that reads both by path → resolve any flagged drift by re-running
the relevant module prompt → re-run 16B until milestones pass → export `/openapi.json`
for the frontend.
