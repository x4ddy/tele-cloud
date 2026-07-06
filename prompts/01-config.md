# Build prompt — `config/` (module 1 of 15)

You are building the **TeleCloud** project. Before writing anything, **read `SPEC.md`
in the repo root** — it is the frozen source of truth. Build **only** the `config/`
module. Do not create or touch any other folder. If you find you need to change a
shared contract in SPEC.md, STOP and flag it instead of diverging.

## Scope (SPEC §6.1)
Build the single typed settings layer for the whole app.

## Requirements
- Use pydantic `BaseSettings` (pydantic-settings). One `Settings` class reading all
  config from environment variables. No module may read `os.environ` directly.
- Provide `get_settings() -> Settings`, cached as a singleton (`functools.lru_cache`).
- Include every constant and secret the system needs:
  - `CHUNK_SIZE = 18 * 1024 * 1024` (hard constant, not env).
  - `QUOTA_UNVERIFIED_BYTES = 500 * 1024 * 1024`, `MAX_FILE_SIZE_UNVERIFIED = 30 * 1024 * 1024`.
  - Telegram: a **list** of bot tokens (for the RR pool) and a list of channel ids.
  - Supabase: project URL, anon key, service-role key, JWT secret.
  - Upstash Redis URL + token.
  - Resend API key + from-address.
  - QStash signing keys (current + next).
  - App base URL (for building verification/share links).
- Validate required vars at startup; fail fast with a clear message if missing.
- Provide a `.env.example` documenting every variable (no real secrets).

## Must NOT
- Import any other telecloud module.
- Hardcode secrets.

## Deliverables
- `config/` package with the settings module + `__init__.py` exporting `get_settings`.
- `.env.example`.
- A short module README noting each env var.

Do not build anything outside `config/`.
