# Personal portfolio + mini CMS

A portfolio site with a built-in editor. Visitors read projects; the owner signs in to edit them; anyone can try the editor as a read-only **guest** for an hour.

- **Public site:** landing page, project list with tag filter, rich project stories, share previews, sitemap. Works without JavaScript; scripts only enhance.
- **Editor (`/admin`):** TipTap story editor (slash menu, drag-to-reorder blocks, tables, callouts, code, pictures, live phone/computer preview), media library, profile, settings, password change.
- **Guest mode:** every screen is open, nothing is saved, enforced on the server (every write returns 403).

One Astro (SSR, Node) process, SQLite via `node:sqlite`, no ORM. Node 24+.

## Run it locally

```bash
cd app
npm install
cp .env.example .env     # set OWNER_EMAIL / OWNER_PASSWORD (min 10 chars)
npm run seed             # fills an EMPTY database with sample content and the owner account
npm run build && node --env-file=.env dist/server/entry.mjs     # http://127.0.0.1:4321
```

`npm run dev` works for quick iteration. To reset: stop the server, delete `app/data/`, seed again.

## Test

```bash
cd app
npm test            # builds, then runs unit + HTTP tests against a built server on a throw-away database
npm run test:unit   # fast loop
```

CI runs the same on Ubuntu and smoke-tests the Docker image (`.github/workflows/ci.yml`).

## Deploy

Docker Compose with Caddy (automatic HTTPS) and optional Litestream backups: see [`devops/RUNBOOK.md`](devops/RUNBOOK.md). Short version:

```bash
cd devops && cp .env.example .env && docker compose up -d --build
```

## Security at a glance

- Passwords hashed with scrypt; sessions are random tokens stored hashed; 5 wrong sign-ins pause that address for 15 minutes; same-origin check on every write.
- All writes live under `/api/*`; one middleware decides who may write (owner only). Visitors never see drafts; guests never see real drafts or the owner email.
- Story HTML is sanitised on save and escaped on render.
- Strict headers on every response: CSP with `script-src 'self'` (no inline scripts), `frame-ancestors 'none'`, `nosniff`, referrer and permissions policies, HSTS over HTTPS. Fonts are self-hosted; the site makes no third-party requests.
- Uploads are sniffed by content (JPG/PNG/WebP/GIF/PDF only), re-encoded to WebP with metadata removed, and size-limited.

## Layout

| Path | What |
|---|---|
| `app/src/lib` | database, auth, sanitiser, queries, media, headers |
| `app/src/pages` | public pages, `/admin/*` screens, `/api/*` |
| `app/src/editor` | browser code for the editor and admin screens |
| `app/migrations` | numbered SQL migrations (never edit an applied one) |
| `app/tests` | unit, HTTP and regression tests |
| `devops` | Dockerfile, compose, Caddy, Litestream, runbook |
| `docs` | `PRACTICES.md`, `BACKLOG.md`, `HANDOFF.md`, `IMPORT.md` (add projects from JSON) |

## Known limits

- Uploaded files are not covered by Litestream (database only); see the runbook for snapshots.
- The Litestream restore procedure has not been rehearsed against a real bucket.
- No contact form (email, links and CV are shown); tags are free-form.
