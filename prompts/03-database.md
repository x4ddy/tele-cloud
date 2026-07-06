# Build prompt — `database/` (module 3 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§4 (data model + RLS)**. Build **only** the `database/` module. Touch no other
folder. Flag — don't make — any change to the schema or a shared contract.

## Scope (SPEC §6.3)
The data-access layer: clients, migrations, and per-table repositories. **No business
rules** (quota math, two-phase orchestration) live here — only data access.

## Requirements
- **Migrations:** SQL files implementing SPEC §4 exactly (tables `profiles`, `folders`,
  `files`, `chunks`, `shares`; enums `file_status`, `chunk_status`; indexes; FKs).
  Include the RLS policies described in §4 (owner-scoped on every table).
- **Clients:** two async accessors —
  - `get_db(user)` → a user-scoped Supabase/Postgres client that honors RLS via the
    user's JWT.
  - `get_service_db()` → a service-role client that bypasses RLS. This is ONLY for the
    sanctioned share-download read path (SPEC §4 RLS expectations). Document that.
- **Repositories** returning the `shared/` models (not raw rows):
  - `profiles_repo`, `folders_repo`, `files_repo`, `chunks_repo`, `shares_repo`.
  - Cover the operations the contracts in §6 imply (insert pending file, insert chunk,
    mark committed, soft-delete, find pending/deleting files for jobs, resolve share by
    token, increment download_count, update `storage_used_bytes`, etc.).
- Use `config.get_settings()` for connection details. All calls `async`.

## Must NOT
- Implement quota rules, two-phase commit, auth, or Telegram logic.
- Return raw DB rows across the boundary — return `shared/` models.

## Deliverables
- `database/` package: client factories + repositories (`__init__.py` exports).
- `database/migrations/` with ordered SQL files.
- Notes on how to run the migrations against Supabase.

Do not build anything outside `database/`.
