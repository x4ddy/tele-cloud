# Build prompt — `users/` (module 6 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§3** and the verification rules. Build **only** the `users/` module. Touch no other
folder. Flag — don't make — any change to a shared contract.

## Scope (SPEC §6.5)
Profile reads/updates and the **email verification flow**.

## Requirements
- `get_profile(user) -> profile model` (via `database/` repo).
- `start_verification(user)`:
  - Generate an unguessable token (use the helper in `shared/`).
  - Persist/associate it with the user (store it — choose a sane place: a column or a
    short-lived Redis key via `rate_limit` is acceptable; if you add a DB column, FLAG
    it as a schema change rather than silently adding it).
  - Build the verification link using the app base URL from `config`.
  - Call `notifications.send_verification_email(email, link)`.
- `mark_verified(token)`:
  - Validate the token, set `profiles.email_verified = true` via the repo.
  - Idempotent + safe against invalid/expired tokens (raise `validation_error`).
- Expose verification status for other modules (e.g. `quota/`) to read off the profile.

## Must NOT
- Compute quota math or store usage deltas (that's `quota/`). You only hold the
  `email_verified` flag and own the verification handshake.
- Send the email yourself (delegate to `notifications`).

## Deliverables
- `users/` package: router (verification endpoints) + service functions.
- Tests for the verification happy path + invalid-token path.

> Note: storing the verification token may need a new column. If so, STOP and flag the
> schema change against SPEC §4 before proceeding.

Do not build anything outside `users/`.
