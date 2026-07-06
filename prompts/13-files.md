# Build prompt — `files/` (module 13 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§7.1 (upload), §7.2 (download/Range)**. Build **only** the `files/` module. Touch no
other folder. Flag — don't make — any change to a shared contract.

## Scope (SPEC §6.12)
The orchestrator. Ties `quota` + `storage` + `folders` together and builds the actual
HTTP responses. This is the only file-domain module that produces FastAPI responses.

## Requirements (all routes owner-scoped via `auth.current_user`)
- **Upload** (`POST`):
  1. Determine declared size + name + optional `folder_id` (validate folder ownership).
  2. `quota.check_can_upload(user, size)` — early reject.
  3. Create the `pending` file row, then `storage.store_upload(file_meta, stream)`.
  4. On success, `quota.add_usage(user, size)` and return the committed `FileMeta`.
     (If SPEC §7.1's transaction already covers part of this, keep the boundary clean —
     `files/` owns the quota call; `storage/` owns the chunk/file commit.)
- **Download** (`GET`, range-aware):
  - Read optional `Range` header; call `storage.open_download(file_id, range)`.
  - Stream the response; set `Content-Type`, `Content-Length`/`Content-Range`,
    `Accept-Ranges: bytes`; return **206** for a range else **200**.
- **List / rename / move** files (within the owner's folders).
- **Soft-delete** (the public deletion entrypoint `folders/` also calls):
  - Mark file `status='deleting'`, `deleted_at=now()`, `quota.subtract_usage(user, size)`,
    and enqueue a Telegram-deletion job (via `jobs/`'s enqueue helper — if not built
    yet, FLAG the dependency; do not delete Telegram messages inline).

## Must NOT
- Talk to Telegram directly (always via `storage`/`telegram`).
- Reimplement quota math or chunking.

## Deliverables
- `files/` package: router + service functions (incl. the deletion entrypoint reused
  by `folders/` and the read helpers reused by `sharing/`).
- Tests: upload happy path (mock quota/storage), quota-reject path, range download
  returns 206 with correct headers, soft-delete decrements quota + enqueues deletion.

Do not build anything outside `files/`.
