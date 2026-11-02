# Backlog

Source of truth for scope: `../../Personal Portfolio + Mini CMS — Requirements.md`.
UI reference mockups: `../../chosen-5-plaintext/` (Plaintext theme, chosen design).

Each ticket = one small deliverable: code + tests (API/browser/regression) + one commit.
Status: `[ ]` todo · `[~]` in progress · `[x]` done.

## Phase 1 — Public site

- [x] **T1 Foundation** — Astro (SSR, node adapter) app, SQLite via `node:sqlite`, SQL migrations, seed (6 projects + 2 sample drafts + profile + settings from the mockups), `node --test` unit tests (db, seed, scrypt, sanitiser, text).
- [x] **T2 Public pages** — layout + theme (light/dark, no flash), landing (intro/about/featured/skills/experience/contact), `/projects` with tag filter, `/projects/:slug` with rich story + next project, OG/meta tags, sitemap, robots, 404. Drafts never visible.

## Phase 2 — Owner editor

- [x] **T3 Auth** — sign-in (email+password, scrypt), 7-day session cookie, sign-out, 5 wrong tries → 15 min lockout, CSRF (same-origin check), role middleware (`visitor|guest|owner`).
- [x] **T4a Projects API** — `/api/projects` list+search (guest-filtered), create, PATCH (validated; story sanitised), publish/unpublish, duplicate, delete, reorder. 38 tests incl. guest read-only regression.
- [x] **T4b Admin shell + UI** — `AdminShell` layout (sidebar, theme, role-aware user chip, `banner` slot for T8), dashboard with counts/recent edits, projects table on the dashboard (search, status filter, featured toggle, duplicate, delete with dialog, drag reorder, New project dialog), guest controls rendered `data-locked`. `/admin/projects/:id` is a stub until T5. 46 tests.
- [x] **T5 Story editor** — TipTap editor at `/admin/projects/:id`: toolbar, bubble toolbar + links, slash/insert menu (heading, lists, quote, big number, callouts, code, table, divider), markdown shortcuts, autosave (1.5 s debounce, PATCH), title/summary/tags/details/featured, Publish/Unpublish/Duplicate/Delete, Edit/Split/Preview with phone/computer live preview of unsaved state, guest can type but never saves. Existing images, videos and galleries are kept verbatim as atom blocks. 56 tests.
- [x] **T5b-1 Picture editing** — double-click a picture, gallery figure or video in the editor to edit its description (alt) and caption, or replace the picture (`src/editor/picture.ts`, dialog in `main.ts`). Videos get caption only. 85 tests.
- [x] **T5b-2 Callout kind switcher + table controls** (done, 88 tests: a small dark bar appears above the callout or table holding the cursor) — switch note/tip/heads-up on an existing callout; add/remove table rows and columns, header toggle.
- [ ] **T5b-3 Block gutter** — drag handle to reorder blocks and a block menu (turn into, duplicate, delete), as in mockup `.gutter` (hidden on touch/narrow).
- [x] **T6 Media** — `/api/media` (list, upload, alt PATCH, delete; owner-only writes), sharp resize to WebP (max 2400px, EXIF dropped), content sniffing (JPG/PNG/WebP/GIF/PDF only, 15 MB / 10 MB), hashed filenames + immutable caching, de-dup by content, delete refused while in use; `/admin/media` library screen (filter, drag-drop upload, alt editing, copy link, delete); reusable picker (`src/editor/media-client.ts`) used for the project cover and for Picture/Gallery blocks in the story editor. Profile photo, CV and share picture pickers arrive with T7. 67 tests.
- [x] **T7 Profile + settings** — `GET/PATCH /api/profile` and `/api/settings` (validated; guests read-only), `lib/site.ts`. `/admin/profile` (basics, photo + CV pickers, about, skills, experience, links, section order/visibility) and `/admin/settings` (title, description, share picture, accent swatches/custom, default theme, guest on/off); both autosave (1.5 s) with Save button and Ctrl+S; guests can type but nothing is sent. Nav has no more coming-soon items. 76 tests.

## Phase 3 — Guest + ops

- [x] **T8 Guest mode** — (done; 88 tests: banner + real countdown from session expiry, welcome dialog once per visit, Leave guest mode ends the session, 401 → friendly redirect to `/admin/signin?expired=1`, guest sweep over every admin screen) one-click guest session (1 h expiry), guest banner + timer, locked controls, sample drafts only (real drafts/email hidden), server-side 403 on every guest write, guest toggle in settings.
- [x] **T9a Linux-parity prep (small, can be done any time, ideally before T5)** — add `.gitattributes` (`* text=auto eol=lf`), `.dockerignore` (node_modules, dist, data, .env), confirm exact-case filenames/imports and `path.sep`-safe code, Node 24 pin noted in `engines`. Done: `.gitattributes` (LF + binary assets), `.dockerignore`; all relative imports verified exact-case against tracked files; no hard-coded path separators in `src/`; `engines` already `>=24`.
- [ ] **T9 DevOps** — Dockerfile (`node:24`, runs `npm ci` inside the image — never copy Windows `node_modules` because `sharp` is per-OS; non-root user owning `/data`), compose (app + Caddy + Litestream) with `/data` on a **named volume** (SQLite WAL is unreliable on Windows/Docker bind mounts), Caddyfile, backup/restore runbook, GitHub Actions CI on **ubuntu-latest** (build + `npm test` + image build), env template, `TRUST_PROXY=1` in compose.
- [ ] **T10 Hardening** — security headers/CSP, a11y pass, Lighthouse-style size/speed budget, final regression run, README.

## Decisions

- **Dev vs prod environments:** develop natively on Windows (`npm run dev`, no Docker needed — SQLite is embedded and there are no external services). Docker is for production parity: the Linux image, Caddy and Litestream. Verify with `docker compose up` before each release, and let Ubuntu CI be the gate that catches Windows-only passes. Deploy target: Linux VPS (Lightsail/EC2).
- Single Astro app serves public pages, admin UI and JSON API (one process, one container).
- `node:sqlite` (built into Node 24) instead of a native module: nothing to compile on Windows or Alpine.
- No ORM: plain SQL, numbered migrations in `app/migrations`.
- Passwords: `crypto.scrypt` with per-user salt.
- Story = sanitised HTML only (TipTap parses and emits it via custom nodes); no second JSON copy to drift.
- Open questions from the requirements doc, defaulting for now: guests may type but never save (yes); contact form omitted until SES is wired (email, links and CV shown); tags are free-form; domain via Caddy env var; experience timeline shown on landing.
