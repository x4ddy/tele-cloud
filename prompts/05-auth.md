# Build prompt — `auth/` (module 5 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§3 (identity)** and **§5.1 (errors)**. Build **only** the `auth/` module. Touch no
other folder. Flag — don't make — any change to a shared contract.

## Scope (SPEC §6.4)
JWT-based authentication backed by Supabase.

## Requirements
- Signup / login / logout routes (FastAPI router). Password handling is delegated to
  Supabase — do NOT roll your own hashing.
- On signup, ensure a `profiles` row exists (via `database/` repo) with
  `email_verified=false`. (The verification *flow* itself lives in `users/`; here you
  just create the profile shell.)
- JWT issue + verify against the Supabase JWT secret from `config`.
- FastAPI dependencies:
  - `current_user()` → yields a `UserContext` (from `shared/`) or raises
    `TeleCloudError("unauthorized", 401)`.
  - `require_verified()` → builds on `current_user`, raises
    `TeleCloudError("forbidden", 403)` if `email_verified` is false. (Used by quota-gated
    routes, but enforcement of quota numbers is `quota/`'s job.)

## Must NOT
- Enforce quota limits, send emails (delegate to `notifications` via `users`), or
  manage files/folders.
- Read env directly (use `config`) or query DB directly (use `database/` repos).

## Deliverables
- `auth/` package: router + `current_user` / `require_verified` dependencies.
- Tests for token verify + the two dependencies (happy + unauthorized/forbidden).

Do not build anything outside `auth/`.
