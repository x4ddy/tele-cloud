# Build prompt — `middleware/` (module 8 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§5.1 (error model)**. Build **only** the `middleware/` module. Touch no other folder.
Flag — don't make — any change to a shared contract.

## Scope (SPEC §6.7)
The cross-cutting request pipeline registered on the FastAPI app.

## Requirements
- **Error handler:** catch `TeleCloudError` (from `shared/`) and convert to the SPEC
  §5.1 JSON shape `{ "error": { "code", "message" } }` with the correct `http_status`.
  Catch unexpected exceptions → `internal_error` 500 (log details, don't leak them).
- **Rate limiting:** per-request limiting using `rate_limit.limiter` keyed by user
  (from `auth.current_user` when present) or client IP otherwise. On block, raise
  `rate_limited` (429).
- **CORS:** configured from `config` (allowed origins for the frontend).
- **Request logging:** structured, minimal (method, path, status, duration). Never log
  secrets or tokens.

## Must NOT
- Contain feature logic (files, quota, sharing, etc.).
- Depend on anything beyond `config`, `shared`, `auth`, `rate_limit`.

## Deliverables
- `middleware/` package with registration helpers (e.g. `register_middleware(app)`).
- Tests asserting the error envelope and the 429 path.

Do not build anything outside `middleware/`.
