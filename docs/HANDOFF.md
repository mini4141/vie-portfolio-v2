# Handoff notes (for the next dev session)

Read `PRACTICES.md` first (how we test, commit and stop), then `BACKLOG.md` for ticket status and the requirements doc in the folder above this repo for scope.
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

## Windows dev → Linux prod (read before touching files/paths/Docker)

We develop on Windows but deploy to Linux. Rules: exact-case filenames and imports (Linux is case-sensitive); use `node:path` (`resolve`, `sep`), never hard-coded `\` or `/`; LF line endings (see ticket T9a); never copy `node_modules` into an image (`sharp` ships per-OS binaries); keep `/data` on a Docker named volume, not a Windows bind mount (SQLite WAL); pin Node 24 (`node:sqlite` is experimental); run containers as non-root. No Docker is needed for everyday dev. Full list in BACKLOG ("Decisions", T9a, T9).

## Gotchas learned

- `.badge{display:inline-flex}` beats the `hidden` attribute; `app.css` has a global `[hidden]{display:none!important}` (tested). Rebuilt CSS gets a new hashed filename: hard-reload the browser pane after `npm run build`.

- Test DB edits from a second process: backdate timestamps by a minute, not 1 ms (cross-process clock skew made a test flaky).
- Astro's `Astro.url.host` is not the real Host behind a proxy; CSRF check compares `Origin` to the `Host` header / `SITE_URL` / `X-Forwarded-Host`.
- Set `TRUST_PROXY=1` behind Caddy so lockout keys use `X-Forwarded-For`.
- Don't `taskkill node.exe` broadly; stop the dev server by port (PowerShell `Get-NetTCPConnection -LocalPort 4321`).
- Google Fonts are loaded from the CDN (mockup parity); self-host them in T10 for privacy/speed.

## Status at end of session 2

Done and committed (all tests green, 46): **T1** foundation, **T2** public pages, **T3** auth, **T4a** projects API, **T4b** admin shell + dashboard, **T9a** Linux-parity prep.
Run `cd app && npm test` first to confirm the baseline.

T4b notes: the shell is `layouts/AdminShell.astro` (`current` prop marks the nav item; named slot `banner` is where T8's guest banner goes, and the welcome `<dialog>` can live in the page). Client behaviour is plain JS in `public/admin.js` (sign-out, `data-locked` toasts, list search/filter/feature/duplicate/delete/reorder, which only run for `main[data-role=owner]`). Project list lives on the dashboard (`/admin#projects`) as in the mockup; search and status filter are client-side over the rendered rows. `/admin/projects/[id].astro` is a stub (404 for ids a guest may not see) for T5 to replace.

## Next up: T5 story editor

T5: port `../../chosen-5-plaintext/editor.html` to TipTap at `/admin/projects/:id` (replace the stub; keep the guest 404 rule via `getAdmin(id, role)`), autosave via `PATCH /api/projects/:id`, Edit/Split/Preview. The shell's sidebar `.ed-side` is `position:sticky;top:40px` for the banner; with no banner it is just a 40px gap-free offset, fine.

## After that (see BACKLOG for detail)

Suggested order: T9a (quick, 10 min) → T5 → T6 → T7 → T8 → T9 → T10.

T5 TipTap editor at `/admin/projects/:id` (port `../../chosen-5-plaintext/editor.html` UX: slash menu, bubble toolbar, block gutter, Edit/Split/Preview, autosave via `PATCH /api/projects/:id`; live preview = render `ProjectView.astro`'s output from unsaved state in an iframe, `srcdoc` approach used in the mockup works), T6 media (sharp), T7 profile+settings, T8 guest polish, T9 devops (Dockerfile, compose, Caddy, Litestream, CI), T10 hardening (CSP, self-host fonts, a11y, README).

Known follow-ups: add `lastmod`/`ETag` caching for `/media`; hash filenames for uploads (T6) then switch to `immutable` cache; Astro prints "Enabling sessions with filesystem storage" at build — harmless (we use our own sessions) but can be silenced by configuring the adapter session driver.
