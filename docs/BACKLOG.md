# Backlog

Source of truth for scope: `../../Personal Portfolio + Mini CMS — Requirements.md`.
UI reference mockups: `../../chosen-5-plaintext/` (Plaintext theme, chosen design).

Each ticket = one small deliverable: code + tests (API/browser/regression) + one commit.
Status: `[ ]` todo · `[~]` in progress · `[x]` done.

## Phase 1 — Public site

- [x] **T1 Foundation** — Astro (SSR, node adapter) app, SQLite via `node:sqlite`, SQL migrations, seed (6 projects + 2 sample drafts + profile + settings from the mockups), `node --test` unit tests (db, seed, scrypt, sanitiser, text).
- [x] **T2 Public pages** — layout + theme (light/dark, no flash), landing (intro/about/featured/skills/experience/contact), `/projects` with tag filter, `/projects/:slug` with rich story + next project, OG/meta tags, sitemap, robots, 404. Drafts never visible.

## Phase 2 — Owner editor

- [ ] **T3 Auth** — sign-in (email+password, scrypt), 7-day session cookie, sign-out, 5 wrong tries → 15 min lockout, CSRF (same-origin check), role middleware (`visitor|guest|owner`).
- [ ] **T4 Admin shell + projects API** — `/admin` shell, dashboard (counts, recent edits), project list + search, CRUD API (create, update, duplicate, delete, publish/unpublish, reorder, featured). Owner-only writes.
- [ ] **T5 Story editor** — TipTap block editor (slash menu, markdown shortcuts, tables, callouts, big number, code, image, gallery, video), server-side sanitising → stored JSON + HTML, autosave every few seconds, Edit/Split/Preview with live preview (phone/computer).
- [ ] **T6 Media** — upload (owner only), `sharp` resize/WebP, alt text, media library screen, picker used by cover/gallery/photo/CV.
- [ ] **T7 Profile + settings** — profile editor (name, headline, photo, about, skills, experience, links, CV, section order/visibility), site settings (title, description, share picture, accent, default theme, guest on/off).

## Phase 3 — Guest + ops

- [ ] **T8 Guest mode** — one-click guest session (1 h expiry), guest banner + timer, locked controls, sample drafts only (real drafts/email hidden), server-side 403 on every guest write, guest toggle in settings.
- [ ] **T9 DevOps** — Dockerfile, compose (app + Caddy + Litestream), Caddyfile, backup/restore runbook, GitHub Actions CI (build + test + image), env template.
- [ ] **T10 Hardening** — security headers/CSP, a11y pass, Lighthouse-style size/speed budget, final regression run, README.

## Decisions

- Single Astro app serves public pages, admin UI and JSON API (one process, one container).
- `node:sqlite` (built into Node 24) instead of a native module: nothing to compile on Windows or Alpine.
- No ORM: plain SQL, numbered migrations in `app/migrations`.
- Passwords: `crypto.scrypt` with per-user salt.
- Story = sanitised HTML only (TipTap parses and emits it via custom nodes); no second JSON copy to drift.
- Open questions from the requirements doc, defaulting for now: guests may type but never save (yes); contact form omitted until SES is wired (email, links and CV shown); tags are free-form; domain via Caddy env var; experience timeline shown on landing.
