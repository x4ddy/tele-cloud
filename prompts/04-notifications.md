# Build prompt — `notifications/` (module 4 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth). Build
**only** the `notifications/` module. Touch no other folder. Flag — don't make — any
change to a shared contract.

## Scope (SPEC §6.15)
Send transactional email via **Resend**. Verification emails only — this is the entire
remit. No other notification types exist yet.

## Requirements
- Async Resend client using the API key + from-address from `config.get_settings()`.
- `send_verification_email(to: str, link: str) -> None` — a templated, reasonably
  styled HTML email containing the verification link. Plain-text fallback included.
- Raise `TeleCloudError("internal_error", ...)` (from `shared/`) on send failure;
  let callers decide retry policy.

## Must NOT
- Generate or store verification tokens or build the link — `users/` owns that and
  passes the finished `link` in. This module only sends.
- Depend on anything except `config/` and `shared/`.

## Deliverables
- `notifications/` package exporting `send_verification_email`.
- The email template (HTML + text).

Do not build anything outside `notifications/`.
