# Deploy, back up and restore

Target: one Linux VPS (Lightsail/EC2) running Docker. Everyday development stays native on Windows; this stack is for production parity.

## First deploy

```bash
git clone <repo> && cd vie-portfolio/devops
cp .env.example .env        # set SITE_DOMAIN, OWNER_EMAIL, a long unique OWNER_PASSWORD
docker compose up -d --build
```

- Point the domain's DNS A record at the server first; Caddy then gets a certificate on its own (ports 80 and 443 must be open).
- On the first start the app fills the empty database (sample projects, profile, settings and the owner account). After that the seed step is skipped, so you may delete `OWNER_PASSWORD` from `.env`.
- With `SITE_DOMAIN=localhost` Caddy uses its own local certificate (browser warning is expected).
- Check: `curl https://<domain>/healthz` prints `ok`; `docker compose ps` shows `healthy`.

## Update

```bash
git pull && docker compose up -d --build
```

Migrations run on start. The `data` volume (database and uploads) is untouched.

## Backups

Two things live in the `data` volume and need different handling:

| What | Where | How it is protected |
|---|---|---|
| Database (`/data/app.db`) | SQLite | **Litestream** streams it to S3 continuously. |
| Pictures and files (`/data/uploads`) | plain files | **Not covered by Litestream.** Snapshot the volume or sync it (see below). |

Turn on continuous database backup: fill the `LITESTREAM_*` values in `.env` (bucket, region, key pair with access to that bucket only), then

```bash
docker compose --profile backup up -d
docker compose logs litestream      # should say it is replicating /data/app.db
```

Uploads, simplest safe option: take a provider snapshot of the server disk daily. Or a nightly copy:

```bash
docker run --rm -v vie_data:/data -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data uploads
```

Copy that file off the server (S3, another machine). Uploads are content-addressed, so restoring an older copy never breaks a newer database; at worst a picture is missing and you re-upload it.

## Restore the database

> Status: the compose, Caddy and image were tested locally; the Litestream restore commands below have **not** been rehearsed against a real bucket. Do that rehearsal once before relying on them.

Disaster (new server, lost volume):

```bash
cd vie-portfolio/devops && cp .env.example .env     # same bucket settings as before
docker compose up --no-start app                    # creates the empty volume
docker compose --profile backup run --rm --no-deps --entrypoint "" litestream \
  litestream restore -config /etc/litestream.yml -if-db-not-exists /data/app.db
docker compose --profile backup run --rm --no-deps --entrypoint "" litestream chown 1000:1000 /data/app.db  # app runs as uid 1000
# restore uploads too, then:
docker compose --profile backup up -d
```

Point in time: add `-timestamp 2026-01-31T09:00:00Z` to the `restore` command. Always test a restore once after enabling backups (restore to a throw-away path with `-o /tmp/test.db` and open it with `sqlite3`).

## Everyday operations

- Logs: `docker compose logs -f app`
- Restart: `docker compose restart app`
- Stop everything (keeps data): `docker compose down`. **Never** add `-v`: it deletes the volumes.
- Owner password: there is no change-password screen yet (gap to close in T10). Until then, to change it, stop the app and update the `users` row with a new scrypt hash (`hashPassword` in `app/src/lib/password.ts`).

## Notes

- The compose file sets `TRUST_PROXY=1` so login lockouts use the real visitor IP from Caddy. Do not publish port 4321 directly, or visitors could fake that header.
- `/data` is a Docker named volume on purpose: SQLite's WAL mode is unreliable on Windows bind mounts.
- CI (`.github/workflows/ci.yml`) runs the full test suite on Ubuntu and builds the image with a start-up smoke test.
