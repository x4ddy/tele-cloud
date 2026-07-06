# Build prompt — `quota/` (module 11 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§3 (quota rules)**. Build **only** the `quota/` module. Touch no other folder. Flag —
don't make — any change to a shared contract.

## Scope (SPEC §6.10)
Enforce the verification-based quota rules. Pure policy + usage accounting; it never
moves bytes.

## Requirements
- `check_can_upload(user, size_bytes)`:
  - **Unverified:** reject if `size_bytes > MAX_FILE_SIZE_UNVERIFIED` (30 MiB) →
    `file_too_large`; reject if `current_usage + size_bytes > QUOTA_UNVERIFIED_BYTES`
    (500 MiB) → `quota_exceeded`.
  - **Verified:** no per-file cap, no total cap. Always allow.
  - Read verification status + current usage off the profile (via `users`/`database`).
  - Limits come from `config` — do not hardcode the numbers in this module's logic
    beyond referencing the config constants.
- `add_usage(user, delta)` / `subtract_usage(user, delta)`: transactional updates to
  `profiles.storage_used_bytes` via the `database/` repo. Never let usage go negative.

## Must NOT
- Move bytes, touch Telegram, or build HTTP responses.
- Reimplement the verification handshake (read the flag via `users`).

## Deliverables
- `quota/` package: the three functions.
- Tests covering: unverified over per-file cap, unverified over total cap, unverified
  under both, verified unlimited, and add/subtract correctness (incl. no-negative).

Do not build anything outside `quota/`.
