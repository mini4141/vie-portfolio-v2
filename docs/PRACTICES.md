# Dev practices

How we work on this repo. Every session follows this file; the prompt should not need to repeat it.

## Ticket loop

1. Pick the next unchecked ticket in `BACKLOG.md` (or the order suggested in `HANDOFF.md`). One ticket = one small deliverable = one commit.
2. Read only what you need (mockup file for that screen, the relevant `src/lib` module). Don't re-derive decisions listed under "Decisions" in the backlog.
3. Implement, then test at all three layers below, then commit, then update the docs.
4. Never batch several tickets into one commit.

## Test layers (all required before a commit)

| Layer | Where | What it proves |
|---|---|---|
| **Unit** | `app/tests/*.test.ts` importing `src/lib/*` directly | Pure logic: sanitiser, validators, text helpers, password hashing, migrations. |
| **API / HTTP** | `app/tests/*.test.ts` using `tests/helpers.ts` (`startServer()`, `loginOwner`, `loginGuest`, `api`) | Real built server on a throw-away seeded DB: status codes, validation, auth, rendered HTML. |
| **Browser** | In-app browser against `node --env-file=.env dist/server/entry.mjs` at 127.0.0.1:4321 | It actually looks and behaves right: layout, forms, console errors, broken images, phone width (375) and desktop (1200+), light and dark. |

Commands (from `app/`):

```bash
npm test            # builds, then runs every test file (must be fully green)
npm run test:unit   # fast unit-only loop while developing
```

## Regression rules

- **Run the full `npm test` before every commit**, not just the new tests. A red test blocks the commit.
- Every bug found gets a test that fails first, then the fix (see the `!!!` slug and Origin-check fixes).
- **Guest safety is a permanent regression suite**: any new `/api` write endpoint must be covered by the guest-write test, and any new read endpoint must filter real drafts and the owner email for guests.
- Visitors must never see drafts: any new public query goes through `status = 'published'` and gets a 404 test for drafts.
- New HTML that comes from user input is sanitised on save (`sanitizeStory`) and escaped on render (`esc` / Astro expressions); add an injection test.
- If a test is flaky, find the cause; don't retry it until green (example: cross-process clock skew, backdate by a minute, not 1 ms).

## API and code conventions

- Errors are JSON `{ error: 'snake_code', message: 'Plain friendly sentence' }`; messages are shown to humans, keep them kind and specific.
- Validate on the server even if the UI also validates. Unknown fields are ignored; bad values return 400 with a message.
- All writes live under `/api/*`; the middleware enforces the role. Don't add write endpoints elsewhere.
- No ORM; SQL in `src/lib/*.ts`, schema changes via a **new** numbered file in `app/migrations/` (never edit an applied migration).
- Public pages: no JS needed to read content; scripts only enhance. Respect `prefers-reduced-motion`; keep contrast and keyboard access (labels, focus, `aria-*`).
- Windows→Linux: exact-case filenames, `node:path`, LF endings (see HANDOFF "Windows dev → Linux prod").

## Commits

- Message: `T<id>: <what changed>` + blank line + trailer shown in the session's system reminder (currently `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; use whatever the current session instructs).
- Commit only when tests are green. Don't push or open PRs unless asked.
- Don't add dependencies without a reason; prefer Node built-ins. Note any new dependency in the BACKLOG "Decisions".

## Safety when running things

- Stop the dev server by **port** (PowerShell `Get-NetTCPConnection -LocalPort 4321`), never `taskkill node.exe`.
- Dev credentials live only in the gitignored `app/.env`. Never commit secrets, never paste real credentials into tests or docs.
- Test servers use temp dirs and random ports (`startServer`); never run tests against `app/data/`.

## Definition of done (per ticket)

- [ ] Behaviour matches the requirements doc and the mockup for that screen.
- [ ] Unit + API tests added; full `npm test` green.
- [ ] Browser-checked (desktop + phone, no console errors, images load).
- [ ] `BACKLOG.md` ticket ticked/split; `HANDOFF.md` "Status" and "Next up" updated; new gotchas recorded.
- [ ] One commit.

## When to stop a session

Stop when **either** a reasonable boundary is reached (ticket done and committed, next step is a new large piece) **or** context is heavy enough that continuing risks half-finished work. Before stopping: tree clean, tests green, HANDOFF updated, dev server stopped. Never stop with uncommitted, untested changes.
