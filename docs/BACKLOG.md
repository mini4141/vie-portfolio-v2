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
- [ ] **T4b Admin shell + UI** — `/admin` shell (sidebar, guest banner slot, theme), dashboard (counts, recent edits, New project / View live site), projects list (status, search, duplicate/delete with confirm, featured toggle, drag reorder). Port from `chosen-5-plaintext/dashboard.html`.
- [ ] **T5 Story editor** — TipTap block editor (slash menu, markdown shortcuts, tables, callouts, big number, code, image, gallery, video), server-side sanitising → stored sanitised HTML only, autosave every few seconds, Edit/Split/Preview with live preview (phone/computer).
- [ ] **T6 Media** — upload (owner only), `sharp` resize/WebP, alt text, media library screen, picker used by cover/gallery/photo/CV.
- [ ] **T7 Profile + settings** — profile editor (name, headline, photo, about, skills, experience, links, CV, section order/visibility), site settings (title, description, share picture, accent, default theme, guest on/off).

## Phase 3 — Guest + ops

- [ ] **T8 Guest mode** — one-click guest session (1 h expiry), guest banner + timer, locked controls, sample drafts only (real drafts/email hidden), server-side 403 on every guest write, guest toggle in settings.
- [ ] **T9a Linux-parity prep (small, can be done any time, ideally before T5)** — add `.gitattributes` (`* text=auto eol=lf`), `.dockerignore` (node_modules, dist, data, .env), confirm exact-case filenames/imports and `path.sep`-safe code, Node 24 pin noted in `engines`.
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
