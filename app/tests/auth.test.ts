import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, OWNER, type TestServer } from './helpers.ts';
import { open } from '../src/lib/db.ts';

let s: TestServer;
before(async () => { s = await startServer({ TRUST_PROXY: '1' }); });
after(async () => { await s.stop(); });

let ipN = 10;
const newIp = () => `10.0.0.${ipN++}`;
const post = (path: string, body?: unknown, extra: Record<string, string> = {}) =>
  s.req(path, { method: 'POST', body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-forwarded-for': newIp(), ...extra } });
const cookieOf = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c?.startsWith('vie_session=')) ?? '';

async function owner() {
  const r = await post('/api/auth/login', OWNER);
  assert.equal(r.status, 200);
  return cookieOf(r);
}
async function guest() {
  const r = await post('/api/auth/guest');
  assert.equal(r.status, 200);
  return cookieOf(r);
}

test('visitors are sent to sign-in and cannot call the API', async () => {
  const r = await s.req('/admin');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/admin/signin');
  assert.equal((await s.req('/admin/projects')).status, 302);
  assert.equal((await s.req('/admin/signin')).status, 200);
  const api = await s.req('/api/projects');
  assert.equal(api.status, 401);
  assert.equal((await api.json() as { error: string }).error, 'unauthenticated');
  assert.equal((await post('/api/projects', {})).status, 401);
});

test('sign-in page offers email, password and guest button', async () => {
  const h = await (await s.req('/admin/signin')).text();
  assert.match(h, /Sign in to the editor/);
  assert.match(h, /id="s-email"/);
  assert.match(h, /Continue as guest/);
  assert.match(h, /noindex/);
});

test('wrong password: 401, clear message, no session', async () => {
  const r = await post('/api/auth/login', { email: OWNER.email, password: 'nope' });
  assert.equal(r.status, 401);
  const b = await r.json() as { triesLeft: number; message: string };
  assert.equal(b.triesLeft, 4);
  assert.match(b.message, /4 tries left/);
  assert.equal(cookieOf(r), '');
  assert.equal((await post('/api/auth/login', { email: 'who@x.dev', password: 'x' })).status, 401);
  assert.equal((await post('/api/auth/login', {})).status, 400);
});

test('owner sign-in sets a 7-day httpOnly cookie and unlocks the editor', async () => {
  const r = await post('/api/auth/login', { email: OWNER.email.toUpperCase(), password: OWNER.password });
  assert.equal(r.status, 200);
  const raw = r.headers.getSetCookie().find((c) => c.startsWith('vie_session='))!;
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /SameSite=Lax/i);
  assert.match(raw, /Max-Age=604800/);
  const c = cookieOf(r);
  const me = await (await s.req('/api/auth/me', { cookie: c })).json() as { role: string; email: string };
  assert.deepEqual([me.role, me.email], ['owner', OWNER.email]);
  assert.equal((await s.req('/admin', { cookie: c })).status, 200);
  assert.equal((await s.req('/admin/signin', { cookie: c })).headers.get('location'), '/admin');
  assert.equal((await s.req('/admin', { cookie: c })).headers.get('cache-control'), 'no-store');
});

test('only a hash of the session token is stored', async () => {
  const c = await owner();
  const d = open(s.dbPath);
  const ids = d.prepare('SELECT id FROM sessions').all().map((r) => String(r.id));
  d.close();
  assert.ok(ids.length > 0 && !ids.some((id) => c.includes(id)));
});

test('5 wrong attempts pause sign-in for 15 minutes, even with the right password', async () => {
  const ip = '10.9.9.9';
  for (let i = 1; i <= 4; i++) assert.equal((await post('/api/auth/login', { email: OWNER.email, password: 'bad' }, { 'x-forwarded-for': ip })).status, 401);
  const fifth = await post('/api/auth/login', { email: OWNER.email, password: 'bad' }, { 'x-forwarded-for': ip });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.headers.get('retry-after'), '900');
  const right = await post('/api/auth/login', OWNER, { 'x-forwarded-for': ip });
  assert.equal(right.status, 429);
  assert.equal(cookieOf(right), '');
  // a different address is not locked out by a stranger's guesses
  assert.equal((await post('/api/auth/login', OWNER, { 'x-forwarded-for': '10.8.8.8' })).status, 200);
});

test('lock expires after 15 minutes and a good sign-in resets the counter', async () => {
  const ip = '10.7.7.7';
  for (let i = 0; i < 5; i++) await post('/api/auth/login', { email: OWNER.email, password: 'bad' }, { 'x-forwarded-for': ip });
  const d = open(s.dbPath);
  d.prepare('UPDATE login_attempts SET locked_until = ? WHERE key = ?').run(Date.now() - 60_000, `ip:${ip}`);
  d.close();
  assert.equal((await post('/api/auth/login', OWNER, { 'x-forwarded-for': ip })).status, 200);
  const r = await post('/api/auth/login', { email: OWNER.email, password: 'bad' }, { 'x-forwarded-for': ip });
  assert.equal(((await r.json()) as { triesLeft: number }).triesLeft, 4);
});

test('guest: one click, 1 hour, sees the editor, email hidden', async () => {
  const r = await post('/api/auth/guest');
  assert.match(r.headers.getSetCookie().find((c) => c.startsWith('vie_session='))!, /Max-Age=3600/);
  const c = cookieOf(r);
  const me = await (await s.req('/api/auth/me', { cookie: c })).json() as { role: string; email: string | null };
  assert.deepEqual([me.role, me.email], ['guest', null]);
  assert.equal((await s.req('/admin', { cookie: c })).status, 200);
});

test('guest can never write: every non-GET /api call is refused by the server', async () => {
  const c = await guest();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/api/projects', '/api/projects/1', '/api/media', '/api/settings', '/api/profile', '/api/anything-future']) {
      const r = await s.req(path, { method, cookie: c, body: method === 'DELETE' ? undefined : '{}', headers: { 'content-type': 'application/json' } });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal((await r.json() as { error: string }).error, 'guest_read_only');
    }
  }
});

test('guest sessions expire server-side', async () => {
  const c = await guest();
  const d = open(s.dbPath);
  d.prepare("UPDATE sessions SET expires_at = ? WHERE role = 'guest'").run(Date.now() - 60_000); // well in the past: two processes' clocks can differ by a few ms
  d.close();
  assert.equal((await s.req('/admin', { cookie: c })).status, 302);
  assert.equal(((await (await s.req('/api/auth/me', { cookie: c })).json()) as { role: string }).role, 'visitor');
});

test('sign-out ends the session on the server, not just in the browser', async () => {
  const c = await owner();
  assert.equal((await s.req('/admin', { cookie: c })).status, 200);
  const out = await s.req('/api/auth/logout', { method: 'POST', cookie: c });
  assert.equal(out.status, 200);
  assert.equal((await s.req('/admin', { cookie: c })).status, 302); // the old cookie is dead
});

test('cross-site writes are rejected', async () => {
  const r = await post('/api/auth/login', OWNER, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal(((await r.json()) as { error: string }).error, 'bad_origin');
  assert.equal((await post('/api/auth/login', OWNER, { origin: s.base })).status, 200);
  // same-origin must work even when SITE_URL names a different host (e.g. localhost vs 127.0.0.1 in dev)
  const other = await startServer({ TRUST_PROXY: '1', SITE_URL: 'https://example.test' });
  try {
    const ok = await other.req('/api/auth/login', { method: 'POST', body: JSON.stringify(OWNER), headers: { 'content-type': 'application/json', origin: other.base } });
    assert.equal(ok.status, 200);
  } finally { await other.stop(); }
});

test('turning guest login off blocks new and existing guests', async () => {
  const c = await guest();
  const d = open(s.dbPath);
  d.prepare('UPDATE settings SET guest_enabled = 0').run();
  try {
    assert.equal((await post('/api/auth/guest')).status, 403);
    assert.equal((await s.req('/admin', { cookie: c })).status, 302);
    assert.doesNotMatch(await (await s.req('/admin/signin')).text(), /Continue as guest/);
  } finally {
    d.prepare('UPDATE settings SET guest_enabled = 1').run();
    d.close();
  }
});
