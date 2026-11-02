# Handoff notes (for the next dev session)

Read `BACKLOG.md` for ticket status and the requirements doc in the folder above this repo for scope.
Reference UI: `../../chosen-5-plaintext/*.html` (static mockups; `editor.html` has a working vanilla-JS block editor prototype to port to TipTap).

## Run it

```bash
cd app
npm install
cp .env.example .env        # dev .env already exists locally (gitignored): owner@vie.local / dev-owner-password
npm run seed                # fills an EMPTY db: 6 published + 2 sample-draft projects, profile, settings, owner
npm run build && node --env-file=.env dist/server/entry.mjs   # http://127.0.0.1:4321
npm test                    # builds, then unit + HTTP API tests (boots the built server on a temp db per file)
```

To reset dev data: stop the server, delete `app/data/`, run `npm run seed`.

## Architecture (see BACKLOG "Decisions")

- `app/` = the whole product: Astro 7 SSR (node adapter), one process. `node:sqlite` (no ORM), SQL migrations in `app/migrations`.
- `src/lib/`: `db.ts` (open/migrate/tx), `auth.ts` (hashed-token sessions, lockout), `queries.ts` (public reads), `sanitize.ts` (story HTML allow-list), `seed.ts`, `text.ts`, `http.ts`.
- `src/middleware.ts` is the single choke point: `/admin/*` needs a session; `/api/*` (except `/api/auth/*`) needs a session AND any non-GET needs role `owner` (guests get 403 `guest_read_only`). New write endpoints are protected automatically — still filter guest GET data per endpoint (guests see only `is_sample=1` drafts, never the owner email).
- `src/styles/site.css` = the mockup stylesheet (public + editor + rich-text `.rt` styles). `app.css` = small additions.
- Story HTML shape (what TipTap must read/write): `h2,h3,p,ul,ol,blockquote(.stat),aside.callout[data-kind],pre.code[data-lang],figure.rt-img|rt-embed,div.shots,div.rt-table,hr`. Anything else is stripped by `sanitizeStory`.

## Conventions

- One ticket = one commit, tests included. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (per session reminder).
- API tests: `tests/*.test.ts` using `tests/helpers.ts` (`startServer()` seeds a temp db and boots `dist/`). After changing app code run `npm run build` (or `npm test`, which builds).
- Browser checks: serve with `node --env-file=.env dist/server/entry.mjs`, use the in-app browser at 127.0.0.1:4321.

## Gotchas learned

- Test DB edits from a second process: backdate timestamps by a minute, not 1 ms (cross-process clock skew made a test flaky).
- Astro's `Astro.url.host` is not the real Host behind a proxy; CSRF check compares `Origin` to the `Host` header / `SITE_URL` / `X-Forwarded-Host`.
- Set `TRUST_PROXY=1` behind Caddy so lockout keys use `X-Forwarded-For`.
- Don't `taskkill node.exe` broadly; stop the dev server by port (PowerShell `Get-NetTCPConnection -LocalPort 4321`).
- Google Fonts are loaded from the CDN (mockup parity); self-host them in T10 for privacy/speed.

## Status at end of session 1

Done and committed (all tests green, 38): **T1** foundation, **T2** public pages, **T3** auth, **T4a** projects API.
Working tree clean at commit `T4a`. Run `cd app && npm test` first to confirm the baseline.

## Next up: T4b admin shell + UI (start here)

Port `../../chosen-5-plaintext/dashboard.html` (sidebar `.ed-side`, header, `.stats`, `.dash-grid`, `.table` project list — all CSS already in `app/src/styles/site.css`).

1. `layouts/AdminShell.astro` wrapping `AdminBase`: sidebar (Home, Projects, Profile, Pictures & files, Settings; unbuilt ones link to `#` with `data-soon` → toast), "View live site", theme toggle, user chip (role-aware: owner shows email, guest shows "Guest / View-only visit").
   - Guest banner (`.ed-banner`, "Guest mode — view only" + timer from `locals.auth.expiresAt` + "Leave guest mode" → `POST /api/auth/logout`) and the one-time welcome `<dialog>` belong to **T8** but the shell should render a slot for them now. Locked buttons use `data-locked` (CSS exists); in the shell, render owner-only controls with `data-locked` when `auth.role === 'guest'` and wire a client script that toasts "Saving is turned off in guest mode." (server already returns 403 regardless).
2. `pages/admin/index.astro` = dashboard: counts from `lib/projects.ts#counts`, "Recently edited" from `recent()` (show relative times), quick actions. Replace the T3 stub (`Signed in as …`).
3. `pages/admin/projects/index.astro` (or the section on the dashboard, as in the mockup): table from `listAdmin(role)`, search box → `GET /api/projects?q=`, status filter, featured toggle (`PATCH featured`), duplicate, delete with `confirm` dialog ("Are you sure?"), drag-to-reorder → `POST /api/projects/reorder` with ALL ids (API requires the full list), "New project" → `POST /api/projects {title}` then go to `/admin/projects/:id`.
4. Tests: HTTP tests that `/admin` renders counts/recent for owner and guest, that a guest page contains `data-locked` on New/Delete/Duplicate and no real-draft titles; browser-check at desktop + phone width (`.ed-body` collapses <860px).

## After that (see BACKLOG for detail)

T5 TipTap editor at `/admin/projects/:id` (port `../../chosen-5-plaintext/editor.html` UX: slash menu, bubble toolbar, block gutter, Edit/Split/Preview, autosave via `PATCH /api/projects/:id`; live preview = render `ProjectView.astro`'s output from unsaved state in an iframe, `srcdoc` approach used in the mockup works), T6 media (sharp), T7 profile+settings, T8 guest polish, T9 devops (Dockerfile, compose, Caddy, Litestream, CI), T10 hardening (CSP, self-host fonts, a11y, README).

Known follow-ups: add `lastmod`/`ETag` caching for `/media`; hash filenames for uploads (T6) then switch to `immutable` cache; Astro prints "Enabling sessions with filesystem storage" at build — harmless (we use our own sessions) but can be silenced by configuring the adapter session driver.
