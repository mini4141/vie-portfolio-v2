import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Cheap guards on the deployment files (the real proof is the CI image smoke test).
const root = resolve('..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

test('Dockerfile installs inside the image, runs as non-root on Node 24 with /data as a volume', () => {
  const d = read('devops/Dockerfile');
  assert.match(d, /FROM node:24/);
  assert.match(d, /RUN npm ci/);
  assert.doesNotMatch(d, /COPY (?!--from)[^\n]*node_modules/, 'never copy host node_modules');
  assert.match(d, /USER node/);
  assert.match(d, /VOLUME \/data/);
  assert.match(d, /HEALTHCHECK/);
});

test('.dockerignore keeps host node_modules, data and secrets out of the build context', () => {
  const i = read('.dockerignore').split('\n');
  for (const e of ['app/node_modules', 'app/data', '.env', '.git']) assert.ok(i.includes(e), e);
});

test('compose: /data is a named volume, proxy trusted, app not published, litestream optional', () => {
  const c = read('devops/docker-compose.yml');
  assert.match(c, /^\s+data:\s*$/m);
  assert.match(c, /- data:\/data/);
  assert.doesNotMatch(c, /\.\/data|\/var\/lib/, 'no bind mount for the database');
  assert.match(c, /TRUST_PROXY: "1"/);
  assert.match(c, /expose:\s*\n\s*- "4321"/);
  assert.doesNotMatch(c, /- "4321:4321"/, 'only Caddy is published');
  assert.match(c, /profiles: \["backup"\]/);
});

test('compose: uploads are copied to the bucket from a read-only mount, and only restored on request', () => {
  const c = read('devops/docker-compose.yml');
  assert.match(c, /uploads-backup:[\s\S]*?profiles: \["uploads-backup"\][\s\S]*?- data:\/data:ro/);
  assert.match(c, /uploads-restore:[\s\S]*?profiles: \["restore"\]/);
  assert.match(c, /command: copy \/data\/uploads :s3:/, 'copy, never sync: the bucket keeps files deleted in the app');
});

test('entrypoint, Caddyfile, litestream config, CI and runbook exist; scripts use LF', () => {
  for (const f of ['app/scripts/docker-entrypoint.sh', 'devops/Caddyfile', 'devops/litestream.yml', 'devops/.env.example', 'devops/RUNBOOK.md', '.github/workflows/ci.yml']) assert.ok(existsSync(resolve(root, f)), f);
  assert.doesNotMatch(read('app/scripts/docker-entrypoint.sh'), /\r/, 'LF only: CRLF breaks sh on Linux');
  assert.match(read('.github/workflows/ci.yml'), /runs-on: ubuntu-latest/);
  assert.match(read('devops/.env.example'), /OWNER_PASSWORD=change-me/, 'template holds no real secret');
});
