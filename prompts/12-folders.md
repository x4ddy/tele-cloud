# Build prompt — `folders/` (module 12 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§4.2 (folders table)**. Build **only** the `folders/` module. Touch no other folder.
Flag — don't make — any change to a shared contract.

## Scope (SPEC §6.11)
The virtual folder hierarchy (adjacency list via `parent_id`). Single-user-per-account;
no sharing of folders.

## Requirements
- CRUD routes + services (all owner-scoped via `auth.current_user`, enforced by RLS):
  - Create folder (optional `parent_id`; validate parent belongs to the user).
  - List folder contents (subfolders + files in a folder; root = `parent_id IS NULL`).
  - Rename, move (re-parent; reject cycles — a folder cannot become its own descendant).
  - **Soft-delete:** set `deleted_at` cascading to descendant folders, and for files
    inside, hand off to `files/`'s deletion path (mark `deleting` + enqueue Telegram
    deletion job). Do NOT delete Telegram messages directly here.
- Validate names (non-empty, reasonable length, no path separators needed since it's
  virtual).

## Must NOT
- Manage file bytes or talk to Telegram/storage directly.
- Compute quota (file deletion's quota decrement is handled in `files/`).

## Deliverables
- `folders/` package: router + services.
- Tests for: create under parent, move-cycle rejection, and cascading soft-delete
  marking descendants.

> Cross-module note: the cascading delete depends on a `files/` deletion entrypoint.
> Call it through `files/`'s public service interface (built in module 13/`files`). If
> that interface isn't defined yet, FLAG the dependency rather than reaching into the
> `files` tables directly.

Do not build anything outside `folders/`.
