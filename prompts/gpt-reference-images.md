# GPT Image Generation Prompt — TeleCloud Reference Screenshots

Generate **4 web UI reference screenshots** for a cloud storage app called **TeleCloud**.
These are reference designs, not final — they will be used as visual guides for a
frontend developer. Render each as a realistic browser screenshot at **1440×900px**,
desktop layout, light theme.

The visual style across all 4 images must be **consistent**:
- Clean, minimal SaaS aesthetic — think Linear or Vercel's dashboard.
- Color palette: deep navy/dark blue primary (`#0f172a`), white backgrounds, light grey
  borders (`#e2e8f0`), blue accent for actions (`#3b82f6`), red for destructive actions.
- Typography: sans-serif (Inter or similar), clear hierarchy.
- Subtle shadows on cards/modals. Rounded corners (8–12px). Generous whitespace.
- TeleCloud logo/wordmark in top-left of every authenticated screen — just the text
  "TeleCloud" in the navy primary color, bold.

---

## Image 1 — Login / Signup screen

A centered auth card on a light grey page background. The card contains:
- "TeleCloud" wordmark at the top of the card.
- A short tagline below it: "Cloud storage, powered by Telegram."
- Two tabs at the top of the form: "Log in" (active) and "Sign up".
- **Log in** form fields: Email, Password, and a "Log in" button (blue, full width).
- Below the button, a small note: "Don't have an account? Sign up."
- Very bottom of the page: a small footer line — "Files stored securely via Telegram."
- No sidebar. No navigation. Card is centered both vertically and horizontally.

---

## Image 2 — Main file browser (authenticated, verified user)

A full dashboard layout:
- **Left sidebar** (narrow, ~220px): TeleCloud wordmark at top; a folder tree below it
  showing a root "My Files" entry with 2–3 nested example folders ("Documents",
  "Photos", "Projects"); a storage usage bar at the very bottom of the sidebar showing
  "2.3 GB used — Unlimited" with a thin blue fill bar (roughly 30% full for visual
  balance, but labeled unlimited).
- **Top bar**: breadcrumb navigation ("My Files / Documents"), a "+ New Folder" button
  (outlined), and an "Upload" button (blue, filled) on the right.
- **Main content area**: a file list table with columns — Name, Size, Modified, and
  Actions. Show 5–6 example rows mixing folders (folder icon) and files (generic file
  icon): a folder "Reports", files like "proposal.pdf" (4.2 MB), "demo-video.mp4"
  (312 MB), "notes.txt" (18 KB). Each row has three action icons on the right:
  download, share (link icon), and delete (trash, red on hover shown on one row).
- One row should be highlighted (hover state) showing the action icons clearly.

---

## Image 3 — Upload in progress

Same dashboard layout as Image 2, but with an **upload panel** overlaid at the bottom
of the main content area (like a bottom drawer / toast tray, not a modal blocking the
whole screen):
- The panel shows "Uploading 1 file" as a header with an X to dismiss (greyed out
  while in progress).
- A single file row: file icon, filename "vacation-footage.mp4", file size "1.8 GB".
- Below the filename, a **progress bar** (blue fill, ~65% complete) and a status label
  "Uploading… chunk 7 of 11".
- A percentage label on the right: "65%".
- The rest of the dashboard (sidebar, file list) is visible and slightly dimmed behind
  the panel to show the app is still accessible.
- No spinning loaders elsewhere — only the progress bar in the upload panel.

---

## Image 4 — Public share page (unauthenticated)

A completely different, minimal layout — **no sidebar, no nav, no login chrome**. This
is a standalone public page anyone with the link can open:
- Centered card on a light grey background, slightly wider than the auth card.
- At the top of the card: "TeleCloud" wordmark (small, grey — subdued, not primary).
- A large file icon in the center of the card.
- Filename below the icon in large bold text: "demo-video.mp4"
- File size below that in grey: "1.8 GB"
- A big blue "Download" button (full width of card).
- A thin divider, then a very small grey line at the bottom: "Shared via TeleCloud ·
  This link may expire." — no owner name, no email, nothing identifying the uploader.
- The card has a clean drop shadow. Background is plain light grey (#f8fafc).
- No footer, no navigation, no "sign up" prompt — intentionally bare.

---

## Output instructions

Produce all 4 images. Each should look like a real browser screenshot (include the
browser chrome — address bar, tabs) to help communicate responsive layout and realistic
proportions. Keep visual style identical across all 4. Do not add any UI elements not
described above.
