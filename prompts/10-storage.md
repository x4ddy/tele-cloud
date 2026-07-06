# Build prompt — `storage/` (module 10 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§1, §7.1 (two-phase commit), §7.2 (Range)**. Build **only** the `storage/` module.
Touch no other folder. Flag — don't make — any change to a shared contract.

## Scope (SPEC §6.9)
The chunking engine: split uploads into 18 MiB chunks driving two-phase commit, and
stream downloads back (range-aware). Yields bytes + metadata; it does NOT build HTTP
responses, check quota, or do auth — `files/` wraps it.

## Requirements
- **Upload** `store_upload(file_meta, stream) -> committed file`:
  - Read the stream in `CHUNK_SIZE` (18 MiB) pieces; last chunk may be smaller.
  - For each piece: `telegram.send_document(...)` then insert a `chunks` row
    (`status='pending'`) via `database/` with the returned `message_id`,
    `telegram_file_id`, `bot_id`, `channel_id`, `chunk_index`, `size_bytes`.
  - After all chunks land, perform the SPEC §7.1 transactional commit: mark all chunks
    + the file `committed`. (Quota increment is called by `files/`, not here — but if
    you find that boundary awkward, FLAG it, don't move it.)
  - On mid-way failure: leave the file `pending` for the `jobs/` sweeper. Surface the
    error.
- **Download** `open_download(file_id, range=None) -> (async byte iterator, headers)`:
  - No range: stream chunks `0..n` in order via `telegram.get_file_stream`.
  - With range `bytes=start-end`: use `shared/` chunk-math to get
    `chunk_index = start // CHUNK_SIZE`, `offset = start % CHUNK_SIZE`; start streaming
    from that chunk, skip `offset` bytes, continue across chunk boundaries until `end`.
  - Return enough info for `files/` to set `Content-Length` / `Content-Range` /
    `Accept-Ranges` and choose 200 vs 206.
  - Strictly no disk buffering.

## Must NOT
- Check quota, do auth, or build FastAPI responses.
- Talk to Telegram except through the `telegram/` module's functions.

## Deliverables
- `storage/` package: `store_upload` + `open_download`.
- Tests (mock `telegram` + `database`) for: correct chunk count, the commit
  transition, a single-chunk range, and a **range spanning two chunks** (the tricky case).

Do not build anything outside `storage/`.
