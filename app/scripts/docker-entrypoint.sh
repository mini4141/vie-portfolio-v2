#!/bin/sh
# First boot: fill an empty database (safe to re-run; it never overwrites). Then start the server.
set -e
if [ -n "$OWNER_EMAIL" ] && [ -n "$OWNER_PASSWORD" ]; then
  node scripts/seed.ts
else
  echo "OWNER_EMAIL/OWNER_PASSWORD not set: skipping seed (fine once the database already exists)."
fi
exec node dist/server/entry.mjs
