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
