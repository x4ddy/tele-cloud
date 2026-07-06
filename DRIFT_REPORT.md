# TeleCloud — Drift Report (corrected in 16B)

This document reports mismatches between the frozen **`SPEC.md`** contracts and the
actual **`telecloud/`** codebase.

> **16B revision note.** This report was first drafted in 16A by a model that could not
> run the code. Every item below was re-verified in 16B against the real source
> (signatures, call sites, and a clean app boot). The substantive correction: **for each
> deviation, the *provider* and every *consumer* agree with each other** — the divergence
> is only against SPEC's prose, not within the code — so the application imports, boots,
> and serves requests. None of items 1–6 is an "unresolved" provider/consumer break.
> Item 7 was a **16A hallucination** (no such SPEC requirement). Item 8 was **overstated**
> by 16A. See *Corrections to the 16A draft* at the end.
>
> Per the assembly hard rules, `SPEC.md` stays **frozen** and module internals are **not**
> patched here. These deviations were already flagged in the relevant module docstrings;
> this report records them, it does not "resolve" them by editing SPEC or modules.

---

## 1. `get_db` takes a JWT string, not a `UserContext`  — REAL, internally consistent

* **Provider**: [`database/client.py:64`](telecloud/database/client.py#L64) — `async def get_db(user_jwt: str) -> Database`
* **Consumers** (all pass the raw access token, agreeing with the provider):
  * [`files/service.py:160`](telecloud/files/service.py#L160), `:214`, `:234`, `:251`, `:275`, `:322` — `await get_db(access_token)`
  * [`sharing/service.py:123`](telecloud/sharing/service.py#L123), `:151`, `:176` — `await get_db(access_token)`
* **Expected (SPEC §6.3)**: `get_db(user) -> Database`
* **Actual**: `get_db(user_jwt: str)` — and it is `async` (SPEC implies sync).
* **Why**: Postgres RLS is authenticated by the request's bearer JWT, so the data layer
  needs the token string, not a `UserContext`. To supply it, `auth/` exposes an extra
  dependency **`access_token`** ([`auth/dependencies.py:40`](telecloud/auth/dependencies.py#L40))
  not listed in SPEC §6.4's public surface. *(16A missed this companion deviation.)*

---

## 2. Quota functions are `async` and take a keyword-only `access_token`  — REAL, internally consistent

* **Provider**: [`quota/service.py:41`](telecloud/quota/service.py#L41), `:77`, `:104`
* **Consumer**: [`files/service.py:166`](telecloud/files/service.py#L166), `:183`, `:333` — calls match exactly.
* **Expected (SPEC §6.10)**: `check_can_upload(user, size)`, `add_usage(user, delta)`, `subtract_usage(user, delta)`
* **Actual**:
  * `async check_can_upload(user: UserContext, size_bytes: int, *, access_token: str) -> None`
  * `async add_usage(user: UserContext, delta: int, *, access_token: str) -> int`
  * `async subtract_usage(user: UserContext, delta: int, *, access_token: str) -> int`
* **Why**: quota reads/writes `profiles.storage_used_bytes` under the user's RLS policy,
  so it needs the same request JWT (`access_token`) — consistent with item 1.

---

## 3. Telegram transport signatures (`get_file_stream`, `delete_message`)  — REAL, internally consistent

* **Provider**: [`telegram/transport.py:239`](telecloud/telegram/transport.py#L239) (`get_file_stream`),
  `:249` (`delete_message`)
* **Consumer**: [`storage/download.py:190`](telecloud/storage/download.py#L190), `:216` — `transport.get_file_stream(channel_id, telegram_file_id, bot_id=...)`
* **Expected (SPEC §6.8)**: `get_file_stream(channel_id, message_id) -> async byte iterator`;
  `delete_message(channel_id, message_id)`
* **Actual**:
  * `get_file_stream(channel_id: int, file_id: str, *, bot_id: str | None = None) -> AsyncIterator[bytes]`
  * `delete_message(channel_id: int, message_id: int, *, bot_id: str | None = None) -> None` *(the optional `bot_id` add was missed by 16A)*
* **Why**: Bot-API `getFile` keys on the `file_id` (stored as `chunks.telegram_file_id`,
  SPEC §4.4), not the message id; file ids are bot-specific, so an optional `bot_id` pins
  the uploading bot. Already flagged in `telegram/__init__.py`.

---

## 4. `send_document` returns a 4-field `SendResult`, not a 3-tuple  — REAL, internally consistent

* **Provider**: [`telegram/transport.py:234`](telecloud/telegram/transport.py#L234) → `SendResult` ([`:38`](telecloud/telegram/transport.py#L38))
* **Consumer**: [`storage/upload.py:90`](telecloud/storage/upload.py#L90) — `await transport.send_document(None, piece)`, reads the named fields.
* **Expected (SPEC §6.8)**: `send_document(channel_id, bytes) -> (message_id, telegram_file_id, bot_id)`
* **Actual**: `send_document(channel_id: int | None, data: bytes) -> SendResult`, where
  `SendResult = (message_id, telegram_file_id, bot_id, channel_id)`.
* **Why**: chunk rows are channel-aware (SPEC §4.4) and the pool may choose the channel
  (`channel_id` may be `None` on input), so the transport reports back the channel it used.
  Already flagged in `telegram/__init__.py`.

---

## 5. `storage.store_upload` takes `db: Database` first  — REAL, internally consistent

* **Provider**: [`storage/upload.py:63`](telecloud/storage/upload.py#L63)
* **Consumer**: [`files/service.py:177`](telecloud/files/service.py#L177) — `await storage.store_upload(db, pending, stream)`
* **Expected (SPEC §6.9)**: `store_upload(file_meta, stream) -> committed file`
* **Actual**: `async store_upload(db: Database, file_meta: FileMeta, stream: AsyncIterator[bytes], *, transport=telegram, chunk_size=CHUNK_SIZE) -> FileMeta`
* **Why**: repository writes must run on the request-scoped (RLS) DB client, which `files/`
  owns and passes down.

---

## 6. `storage.open_download` takes `db: Database` first and returns `DownloadResponse`  — REAL, internally consistent

* **Provider**: [`storage/download.py:232`](telecloud/storage/download.py#L232)
* **Consumers**: [`files/service.py:219`](telecloud/files/service.py#L219) — `storage.open_download(db, file_id, range_)`;
  [`sharing/service.py:253`](telecloud/sharing/service.py#L253) — `storage.open_download(db, share.file_id, range_)` (db here is the service-role client).
* **Expected (SPEC §6.9)**: `open_download(file_id, range=None) -> async byte iterator + content headers`
* **Actual**: `async open_download(db: Database, file_id: UUID, range_: ByteRange | str | None = None, *, transport=telegram, chunk_size=CHUNK_SIZE) -> DownloadResponse`
* **Why**: needs the request- (or service-) scoped DB to read file/chunk metadata, and
  returns a `DownloadResponse` bundling the stream + HTTP status/headers (the §7.2/§7.3
  Range handling).

---

## 7. ~~Missing `range_not_satisfiable` error code~~  — **NOT A DRIFT (16A hallucination)**

* **16A claimed**: SPEC §5.1 requires an `ErrorCode.range_not_satisfiable`, and the code is
  in violation for not having it.
* **Reality**: SPEC §5.1's reserved-code list is
  *unauthorized, forbidden, not_found, quota_exceeded, file_too_large, rate_limited,
  upload_incomplete, share_expired, share_revoked, telegram_error, validation_error,
  internal_error* — it **does not** contain `range_not_satisfiable`, and it explicitly says
  "extend as needed". The code at [`storage/download.py:104`](telecloud/storage/download.py#L104)
  deliberately raises `TeleCloudError(ErrorCode.VALIDATION_ERROR, ..., http_status=416)` and
  documents the choice in-line. This is **SPEC-compliant**, not a deviation.
* **Action**: none. Adding a new error code would be an unrequested feature change; do not.

---

## 8. Config has QStash *signing* keys but no *publish* credentials  — REAL but **not a SPEC contract break** (16A overstated)

* **Provider**: [`config/settings.py:89`](telecloud/config/settings.py#L89) — only
  `qstash_current_signing_key` / `qstash_next_signing_key`.
* **Consumer**: [`jobs/enqueue.py:96`](telecloud/jobs/enqueue.py#L96) `register(publisher=None)`.
* **Reality**: this is an **intentional, documented design**, not a broken contract. SPEC
  §7.4 only requires the QStash→jobs **cron sweep** path (orphan sweep + deferred delete),
  which is implemented and signature-gated. On-demand expedite publishing is optional;
  `make_enqueuer(None)` returns the **sweep-backed** enqueuer, so soft-delete records intent
  and the scheduled sweep reclaims it. `register()` is called with no publisher in
  `main.py` and the app boots fine.
* **Action**: none required for correctness. Adding publish credentials + a publisher would
  be a *new feature* (out of scope for assembly). Tracked here only as a known limitation:
  deferred deletes are reclaimed by the sweep, not expedited on demand.

---

## Corrections to the 16A draft

| Item | 16A verdict | 16B correction |
|------|-------------|----------------|
| 1–6  | Drift (real) | **Confirmed real**, and additionally verified **internally consistent** (provider + every consumer agree) → app boots & serves. Added missed sub-deviations: the `auth.access_token` dependency (item 1) and the optional `bot_id` on `delete_message` (item 3). Also noted `get_db`/quota funcs are `async`. |
| 7    | Drift (missing error code) | **Dropped — hallucinated.** SPEC §5.1 never lists `range_not_satisfiable`; the 416-via-`validation_error` choice is SPEC-compliant and self-documented. |
| 8    | Drift to fix (add publish creds) | **Downgraded.** Real config gap but an intentional sweep-backed design; SPEC §7.4 doesn't mandate on-demand publish. Not a contract break; no fix. |
| 16A HANDOFF "drift items to resolve" 1–5 | Edit frozen SPEC / add code | **Rejected.** Editing the frozen `SPEC.md` and adding error codes / config fields violate the assembly hard rules (frozen SPEC, no new features, flag-don't-fix). The correct resolution is: accept the flagged, internally-consistent deviations as-is. |

## Reconciliation conclusion

- **No unresolved provider/consumer break exists.** Items 1–6 are accepted, already-flagged
  deviations from SPEC's prose; the code is self-consistent and the app boots, mounts all
  routers, and serves `/health` and `/s/{token}` (verified in 16B).
- **No glue fix was required in `main.py`** for any drift item; `main.py` imports and wires
  the real (deviating) signatures correctly.
- `SPEC.md` remains **frozen**. If the project later wants the SPEC prose to match the
  shipped signatures, that is a deliberate spec-amendment decision for the owner — not an
  assembly action.
