# Build prompt — `shared/` (module 2 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth). Build
**only** the `shared/` module. Touch no other folder. Flag — don't make — any change
to a shared contract.

## Scope (SPEC §6.2, §5.1, §5.3)
Common models, the error type, and pure helper logic. **No I/O of any kind.**

## Requirements
- `TeleCloudError(code: str, message: str, http_status: int)` exception. The error
  codes in SPEC §5.1 are reserved — define them as constants/enum.
- Shared pydantic models (used across modules), matching the data model in SPEC §4:
  - `UserContext` (id, email, email_verified) — the authenticated identity.
  - `FileMeta`, `ChunkMeta`, `FolderMeta`, `ShareMeta` — read models mirroring the
    respective tables' meaningful fields.
- Pure helpers only:
  - URL-safe unguessable token generator (used by `users` verification + `sharing`).
  - Human-readable size formatting.
  - Chunk math: given total size + `CHUNK_SIZE`, compute `chunk_count`; given a byte
    offset, compute `(chunk_index, intra_chunk_offset)`. (Used by `storage` for Range.)

## Must NOT
- Talk to DB, Telegram, Redis, HTTP, or filesystem. Pure functions/models only.
- Depend on anything except `config/`.

## Deliverables
- `shared/` package exporting the error type, models, and helpers via `__init__.py`.
- Unit tests for the chunk-math and token helpers (pure, easy to test).

Do not build anything outside `shared/`.
