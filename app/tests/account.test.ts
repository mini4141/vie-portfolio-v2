import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, loginOwner, loginGuest, api, OWNER, type TestServer } from './helpers.ts';

let s: TestServer, own: ReturnType<typeof api>, ownCookie: string;
before(async () => { s = await startServer(); ownCookie = await loginOwner(s); own = api(s, ownCookie); });
after(async () => { await s.stop(); });

const login = (password: string) => s.req('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: OWNER.email, password }) });

test('change password: validation messages, wrong current password refused, nothing changes on failure', async () => {
  const short = await own('POST', '/api/account/password', { current: OWNER.password, next: 'short' });
  assert.equal(short.status, 400); assert.equal(short.body.error, 'too_short');
  assert.equal((await own('POST', '/api/account/password', { current: OWNER.password, next: OWNER.password })).body.error, 'same');
  assert.equal((await own('POST', '/api/account/password', {})).status, 400);
  const wrong = await own('POST', '/api/account/password', { current: 'not-the-password', next: 'a-brand-new-password' });
  assert.equal(wrong.status, 403); assert.equal(wrong.body.error, 'wrong_password');
  assert.equal((await login(OWNER.password)).status, 200, 'old password still works');
});

test('change password: new one works, old one stops, other sessions are signed out, this one stays', async () => {
  const other = await loginOwner(s);
  const r = await own('POST', '/api/account/password', { current: OWNER.password, next: 'a-brand-new-password' });
  assert.equal(r.status, 200);
  assert.equal((await login('a-brand-new-password')).status, 200);
  assert.equal((await login(OWNER.password)).status, 401);
  assert.equal((await api(s, other)('GET', '/api/projects')).status, 401, 'other device signed out');
  assert.equal((await own('GET', '/api/projects')).status, 200, 'current session kept');
  // put it back so later tests (and the shared helper) still work
  assert.equal((await own('POST', '/api/account/password', { current: 'a-brand-new-password', next: OWNER.password })).status, 200);
});

test('change password: guests and visitors cannot', async () => {
  const guest = api(s, await loginGuest(s));
  assert.equal((await guest('POST', '/api/account/password', { current: 'x', next: 'y'.repeat(12) })).status, 403);
  const anon = await s.req('/api/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(anon.status, 401);
});

test('settings screen: owner gets the password form, guest gets it locked and disabled', async () => {
  const o = await (await s.req('/admin/settings', { cookie: await loginOwner(s) })).text();
  assert.match(o, /data-pass-form/);
  assert.doesNotMatch(o, /id="pw-cur"[^>]*disabled/);
  const g = await (await s.req('/admin/settings', { cookie: await loginGuest(s) })).text();
  assert.match(g, /id="pw-cur"[^>]*disabled/);
  assert.match(g, /<button class="btn" type="submit" data-locked/);
});

test('guessing the current password is throttled like sign-in', async () => {
  // last on purpose: it trips the per-address lock that sign-in shares
  const c = await loginOwner(s), a = api(s, c);
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await a('POST', '/api/account/password', { current: `wrong-${i}`, next: 'another-new-password' })).status;
  assert.equal(last, 429);
});
