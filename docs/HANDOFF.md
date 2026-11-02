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

## Status at end of session 3

T5 done and committed (56 tests green). Editor code lives in `app/src/editor/`: `extensions.ts` (TipTap schema matching the story HTML shape: callout, stat quote, code with `data-lang`, tables wrapped in `div.rt-table`, verbatim `mediaBlock` for figure/shots, `toStoryHtml` post-processing), `blocks.ts` (slash/insert menu items), `preview.ts` (builds the preview iframe `srcdoc` from unsaved state, mirrors `ProjectView.astro`), `main.ts` (wiring, autosave, toolbar, menus). The page `pages/admin/projects/[id].astro` embeds project data as a JSON script (`#ed-data`, `<` escaped) and loads the bundle with an Astro `<script>`.

T5 notes: editor round-trips every seeded story (tested with happy-dom); blank paragraphs are dropped on save. Cover picking and inserting images/galleries/videos are deferred to T6/T5b (see BACKLOG). Preview iframe is `sandbox="allow-same-origin"` (no scripts).

## Status at end of session 3 (continued)

T6 done and committed (67 tests). Server: `src/lib/media.ts` (sniff, `saveUpload`, `setAlt`, `usage`, `deleteMedia`), `pages/api/media/index.ts` + `[id].ts`. Client: `src/editor/media-client.ts` (`pickMedia({multiple, kind, selected})` dialog, `uploadMany`, helpers) and `src/editor/media-page.ts`; screen `pages/admin/media.astro`. The picker is ready for T7 (photo, CV, share picture): call `pickMedia({kind:'image'|'file'})` and PATCH the id.

T7 done and committed (76 tests). `src/lib/site.ts` validates profile/settings patches; screens are `pages/admin/profile.astro` + `settings.astro` with client code in `src/editor/{profile-page,settings-page,form-save}.ts` (`makeSaver` = shared autosave/Save/Ctrl+S). Accent contrast is not validated (any #rrggbb allowed).

## Status at end of session 4

T8 done (tests green incl. `tests/guest.test.ts`). `AdminShell` renders the guest banner (`data-guest-timer data-expires=<session expiry ms>`) and the welcome `<dialog data-guest-note>` for guests only. `public/admin.js` wraps `window.fetch`: any 401 from `/api/*` (not `/api/auth/*`) or the countdown hitting zero redirects to `/admin/signin?expired=1`, which shows "Your session has ended". "Leave guest mode" POSTs logout then goes to `/`. Welcome note is remembered in `sessionStorage` (`vie-guest-seen`).

T5b-1 done: `src/editor/picture.ts` (`readFigure`, `editFigure`, pure DOM helpers, unit-tested in `tests/editor.test.ts`); `main.ts` opens the "Edit picture" dialog on double-click of any `figure` inside a `mediaBlock`. Gotcha: for a single picture the block *is* the figure (index 0); galleries are `div.shots` with several figures.

T5b-2 done: `src/editor/context.ts` (`contextFor(editor)` returns the callout/table around the cursor plus its actions; unit-tested with a real TipTap `Editor` in happy-dom in `tests/context.test.ts`, which needs a `requestAnimationFrame` shim). `main.ts` renders them into `[data-ctx]` (reuses `.bubble` styling, `.ctxbar` in `app.css`), hidden while the text bubble shows or the block is scrolled out of view. Browser testing tip: synthetic selections don't focus the editor; use real clicks via element refs, since coordinates drift after `scrollIntoView`.

T5b-3 done: `src/editor/gutter.ts` (pure block ops by top-level index: `moveBlock`, `duplicateBlock`, `deleteBlock`, `addParagraphAfter`, `TURN_INTO`; tested with a real `Editor` in `tests/gutter.test.ts`). `main.ts` wires the hover gutter (`[data-gutter]` in the page), drag/drop with `.drop-line`, and the block menu (a `.pop` appended to body). Gotchas: the gutter is hidden below 860px (the browser pane is often narrower; use `resize_window` to 1400); the editor keeps an empty trailing paragraph after a final heading (dropped on save); a tall block's top can sit under the sticky `.rt-toolbar`, so the gutter is clamped into the visible part. T5b is complete.

## Next up: T9 devops (Dockerfile, compose, Caddy, Litestream, CI), then T10 hardening

## After that (see BACKLOG for detail)

Suggested order: T9 → T10.

T9 devops (Dockerfile, compose, Caddy, Litestream, CI), T10 hardening (CSP, self-host fonts, a11y, README).

Known follow-ups: add `lastmod`/`ETag` caching for `/media`; Astro prints "Enabling sessions with filesystem storage" at build — harmless (we use our own sessions) but can be silenced by configuring the adapter session driver.
