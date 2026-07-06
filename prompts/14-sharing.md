# Build prompt — `sharing/` (module 14 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§4.5 (shares table), §7.3 (share download), §4 RLS expectations**. Build **only** the
`sharing/` module. Touch no other folder. Flag — don't make — any change to a shared
contract.

## Scope (SPEC §6.13)
Public, URL-based file sharing. Two surfaces: authed share management, and an
unauthenticated token download path.

## Requirements
- **Create share** (authed, owner-scoped): generate an unguessable `token` (use the
  `shared/` helper), insert a `shares` row for the owner's file. Accept optional
  `expires_at`, `download_limit`.
- **Revoke share** (authed): set `revoked=true`.
- **List shares** for the current user's file(s).
- **Public download** (`GET /s/{token}` — NO auth):
  - Resolve the share via the **service-role DB client** (`database.get_service_db()`) —
    the one sanctioned RLS bypass (SPEC §4).
  - Reject: `revoked` → `share_revoked`; `expires_at < now()` → `share_expired`;
    `download_count >= download_limit` (when limit set) → `forbidden`.
  - Otherwise increment `download_count`, then stream via `storage.open_download`
    (range-aware, reuse `files/`'s response shaping or replicate the header logic).
  - **Leak nothing about the owner** (no email, no user id in the response).

## Must NOT
- Bypass the revoked/expiry/limit checks, or use the service-role client for anything
  beyond resolving + streaming the shared file.
- Reimplement chunk streaming (reuse `storage.open_download`).

## Design decisions to make now (SPEC §6.13 left these open)
- Default expiry (e.g. none vs 7 days), max download count policy, and whether revoke is
  hard (delete row) or soft (`revoked=true`). Pick sensible defaults and document them.

## Deliverables
- `sharing/` package: management router (authed) + public download route.
- Tests: create→download happy path, revoked rejected, expired rejected, over-limit
  rejected, and that no owner info appears in the public response.

Do not build anything outside `sharing/`.
