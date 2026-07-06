# TeleCloud — Frontend Brief (FRONTEND_BRIEF.md)

Brief for generating the TeleCloud frontend (e.g. with Gemini). Use this **together
with** two inputs you must provide alongside it:

1. **`openapi.json`** — the exported API contract (endpoints, request/response shapes,
   auth scheme). **This is the source of truth for every API call.** Do not invent or
   guess routes, field names, or status codes — read them from `openapi.json`. If
   something here and `openapi.json` ever disagree, the OpenAPI spec wins for API
   mechanics; this brief wins for behavior/UX intent.
2. **Reference images** — screenshots of the intended look for each screen/state. Match
   their layout, spacing, and visual style. The images define *appearance*; this brief
   defines *behavior*. Where an image is missing for a state listed below, follow the
   described behavior and keep the visual language consistent with the images provided.

---

## 0. Hard constraints (do not violate)

- **Single file.** The entire frontend is **one `index.html`** with inline JS and CSS.
  **No build step, no framework scaffold** (no React/Vite/Next). Vanilla JS only; if you
  need a helper, use a CDN `<script>` import — but prefer zero dependencies.
- **All API calls go through `openapi.json`.** Read paths, methods, request bodies, and
  response schemas from it. Don't hardcode shapes this brief doesn't mention.
- **API base URL is configurable** — put it in one constant at the top of the file
  (e.g. `const API_BASE = "http://localhost:8000"`), so it can be switched to the
  Fly.io deploy. Assume CORS is handled by the backend.

---

## 1. Auth & token lifecycle

- Auth is **JWT bearer**. The exact login/signup/logout paths and payloads are in
  `openapi.json` — use those.
- Flow:
  1. **Signup** → creates an account (unverified). After signup, show the
     **"verify your email" pending** state (see §4).
  2. **Login** → returns a **JWT**. Store it in `localStorage`.
  3. On **every authenticated request**, attach the header
     `Authorization: Bearer <jwt>`.
  4. On any **`401`** response, clear the stored token and route back to the login view.
  5. **Logout** → clear the token, return to login.
- On app load, if a token exists in `localStorage`, treat the user as logged in and go
  straight to the file browser (let a `401` bounce them out if it's stale).

---

## 2. Error handling (uniform)

Every API error returns this envelope:

```json
{ "error": { "code": "<string>", "message": "<string>" } }
```

Parse this shape on **all** failed responses and surface `message` to the user (a toast
or inline message). Handle these `code`s with specific UX where it helps:

| code              | UX                                                        |
|-------------------|-----------------------------------------------------------|
| `unauthorized`    | clear token, go to login                                  |
| `forbidden`       | show message (e.g. action needs a verified email)         |
| `quota_exceeded`  | show quota-full message; point at the usage bar           |
| `file_too_large`  | show the 30 MiB unverified-user limit message             |
| `rate_limited`    | show "try again shortly"                                  |
| `share_expired` / `share_revoked` | on the public share page, show a clear "link no longer available" state |
| everything else   | generic error toast with `message`                        |

---

## 3. Quota display (SPEC §3)

- Show a **storage usage bar** in the app chrome.
- Rules:
  - **Unverified user:** total quota **500 MiB**, max **30 MiB per file**. Show
    `used / 500 MiB`.
  - **Verified user:** **unlimited** — show used amount with no cap (e.g. "X used,
    unlimited").
- Read the user's verification status and `storage_used_bytes` from the profile endpoint
  in `openapi.json`. Reflect quota changes after uploads/deletes.
- For unverified users, **block the upload client-side** if the selected file exceeds
  30 MiB (with a clear message) — but the server enforces it too; handle a
  `file_too_large` / `quota_exceeded` response regardless.

---

## 4. Screens & states (cover all of these)

Provide a reference image where you have one; otherwise follow the behavior described.

1. **Login** — email/password, link to signup.
2. **Signup** — email/password, then →
3. **Verify-email pending** — "we sent a verification link" state; explain that until
   verified, limits are 500 MiB total / 30 MiB per file. Offer a "resend" if the API
   supports it (check `openapi.json`).
4. **File / folder browser** (the main app):
   - Folder tree / breadcrumb navigation (folders are a virtual hierarchy; root =
     no parent).
   - File list with name, size, created date; actions: download, share, delete, rename;
     folder actions: create, rename, move, delete.
   - The quota usage bar (§3).
5. **Upload** — file picker (and/or drag-drop). Show **per-file upload progress**
   (multi-chunk uploads can be large). On success, the file appears in the list.
6. **Share modal** — create a share link for a file; show the resulting public URL with
   a copy button; allow **revoke**. If the API exposes optional `expires_at` /
   `download_limit`, surface them as optional inputs (check `openapi.json`).
7. **Public share page** (`/s/{token}`) — **unauthenticated**, visually distinct from the
   logged-in app. Shows the file name + a download button; **no owner info**. Handle
   `share_expired` / `share_revoked` / over-limit with a clear "unavailable" state.
8. **Empty states** — empty folder, no files yet.
9. **Error states** — inline/toast per §2.

---

## 5. Downloads

- Use the download endpoint from `openapi.json`. The backend supports **HTTP Range /
  `206 Partial Content`** for resumable downloads — for normal browser downloads,
  triggering the download URL is enough; the browser handles resume. Don't reimplement
  chunking on the client (the server reassembles).
- The public share page downloads via the **token** route (no auth header).

---

## 6. Output expected

- A single **`index.html`** containing markup, inline CSS, and JS, that:
  - reads all API mechanics from `openapi.json`,
  - matches the reference images visually,
  - implements the auth lifecycle (§1), error envelope (§2), quota display (§3), all
    screens/states (§4), and downloads (§5),
  - exposes `API_BASE` as a single top-of-file constant.
- Keep it readable and dependency-light. No backend changes — the frontend consumes the
  existing API as-is.
