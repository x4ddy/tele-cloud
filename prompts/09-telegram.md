# Build prompt — `telegram/` (module 9 of 15)

Building **TeleCloud**. **Read `SPEC.md`** first (frozen source of truth), especially
**§1 (constraints)** and the rate-limit notes. Build **only** the `telegram/` module.
Touch no other folder. Flag — don't make — any change to a shared contract.

## Scope (SPEC §6.8)
The Telegram transport: a round-robin **bot pool** that moves bytes to/from a private
channel. This module knows about bots, channels, messages, and bytes — NOT about
files, chunks-as-a-concept, quota, or DB rows.

## Requirements
- **Bot pool:** built from the list of bot tokens in `config`. Round-robin selection
  across bots. Channel-aware (channels list from `config`); every operation records
  which `channel_id` and `bot_id` it used and returns them to the caller.
- **Transport functions (all async):**
  - `send_document(channel_id, data: bytes) -> (message_id, telegram_file_id, bot_id)`.
  - `get_file_stream(channel_id, message_id) -> async iterator[bytes]` — streams a
    chunk back via `getFile`; **no disk buffering** (SPEC §1).
  - `delete_message(channel_id, message_id) -> None`.
- **Rate limiting:** respect Telegram's limits using `rate_limit.limiter` — per-bot
  (~30 msg/s) and per-channel (~20 msg/min). These numbers live here (the limiter is
  generic; telegram supplies the keys/limits). On a transient failure, use
  `rate_limit.queue` to enqueue a retry and raise/return a `telegram_error`
  (`TeleCloudError`) so callers can react.
- Pick a sane channel from the pool when the caller doesn't pin one; allow pinning a
  `channel_id` for reads/deletes (since chunks remember where they live).

## Must NOT
- Reference files, chunks, quota, or DB rows. It returns identifiers; `storage/`
  persists them.
- Buffer downloads to disk.

## Deliverables
- `telegram/` package: pool + the three transport functions.
- Tests with a mocked Telegram API covering RR rotation, the retry-enqueue path, and
  streaming read.

Do not build anything outside `telegram/`.
