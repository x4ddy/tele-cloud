# Build prompt — `jobs/` (module 15 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§7.4 (cleanup)**. Build **only** the `jobs/` module. Touch no other folder. Flag —
don't make — any change to a shared contract.

## Scope (SPEC §6.14)
QStash-triggered async cleanup. Two jobs + the enqueue helpers other modules use.

## Requirements
- **QStash signature verification:** every job route MUST verify the QStash signature
  (signing keys from `config`) before doing anything. Unsigned/invalid → `unauthorized`.
  Job endpoints must NOT be runnable by arbitrary callers.
- **Orphan sweep job:** find `files` with `status='pending'` older than a threshold
  (via `database.files_repo`). For each, delete every chunk's Telegram message
  (`telegram.delete_message`) and remove the chunk + file rows. Idempotent.
- **Deferred-delete job:** find `files` with `status='deleting'`. Delete their Telegram
  messages, then remove rows. Idempotent. (Quota was already decremented at soft-delete
  time in `files/`; do not double-count.)
- **Retry handling:** transient `telegram_error`s go through `rate_limit.queue`
  (enqueue + dead-letter after N attempts). A job run should drain a bounded batch and
  return, not loop forever.
- **Enqueue helpers:** expose the function `files/` uses to schedule a deferred deletion
  (the public enqueue API referenced by module 13). Keep it thin.

## Must NOT
- Run without QStash signature verification.
- Re-decrement quota for deferred deletes (already handled in `files/`).

## Deliverables
- `jobs/` package: the two QStash job routes, signature verification, and enqueue
  helpers.
- Tests: signature rejection, orphan sweep deletes pending chunks+rows, deferred delete
  removes `deleting` files, and dead-letter after repeated telegram failures.

Do not build anything outside `jobs/`.
