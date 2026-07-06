# Build prompt — `rate_limit/` (module 7 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth). Build
**only** the `rate_limit/` module. Touch no other folder. Flag — don't make — any
change to a shared contract.

## Scope (SPEC §6.6)
Upstash Redis: a rate limiter + a retry queue used by `telegram/` and `jobs/`.

## Requirements
- Async Redis client to Upstash using URL + token from `config`.
- **Limiter:** `check(key, limit, window) -> allowed: bool` (sliding-window or
  leaky-bucket). Will be used both for app-level request limiting (by `middleware/`)
  and Telegram's per-bot / per-channel limits (by `telegram/`). Keep it generic — the
  caller supplies the key and limits; this module does not hardcode Telegram numbers.
- **Retry queue:** `enqueue(job)`, `dequeue() -> job | None`, and a way to mark
  attempts / move to a dead-letter set after N failures. Jobs are JSON-serializable
  dicts. Used for failed Telegram sends/deletes.

## Must NOT
- Know anything about Telegram specifics, HTTP routing, or DB rows.
- Depend on anything except `config/` and `shared/`.

## Deliverables
- `rate_limit/` package exporting `limiter` and `queue` interfaces.
- Tests (can use a fake/in-memory Redis or mock) for limiter window behavior and
  enqueue/dequeue/dead-letter transitions.

Do not build anything outside `rate_limit/`.
