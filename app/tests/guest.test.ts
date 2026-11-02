import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer, loginOwner, loginGuest, api, type TestServer } from './helpers.ts';

let s: TestServer, ownCookie: string, gstCookie: string, own: ReturnType<typeof api>, realDraft: { id: number };
before(async () => {
  s = await startServer();
  ownCookie = await loginOwner(s);
  gstCookie = await loginGuest(s);
  own = api(s, ownCookie);
  realDraft = (await own('POST', '/api/projects', { title: 'Private launch plan' })).body.project;
});
after(async () => { await s.stop(); });

const page = async (path: string, cookie?: string) => { const r = await s.req(path, { cookie }); return { status: r.status, html: await r.text() }; };
const sampleId = async () => {
  const list = (await api(s, gstCookie)('GET', '/api/projects')).body.projects as { id: number; status: string }[];
  return list.find((p) => p.status === 'draft')!.id;
};

test('every admin screen shows the guest banner, countdown and welcome note, and leaks nothing', async () => {
  const id = await sampleId();
  for (const path of ['/admin', '/admin/media', '/admin/profile', '/admin/settings', `/admin/projects/${id}`]) {
    const { status, html } = await page(path, gstCookie);
    assert.equal(status, 200, path);
    assert.match(html, /class="ed-banner"/, `${path} banner`);
    assert.match(html, /Guest mode — view only/, path);
    assert.match(html, /data-guest-timer data-expires="\d{13}"/, `${path} timer has the session expiry`);
    assert.match(html, /data-leave-guest/, path);
    assert.match(html, /<dialog class="welcome" data-guest-note/, `${path} welcome note`);
    assert.doesNotMatch(html, /owner@test\.dev/, `${path} hides the owner email`);
    assert.doesNotMatch(html, /Private launch plan/, `${path} hides real drafts`);
  }
});

test('guests cannot open a real draft in the editor', async () => {
  assert.equal((await page(`/admin/projects/${realDraft.id}`, gstCookie)).status, 404);
});

test('owner never sees the guest banner or welcome note', async () => {
  for (const path of ['/admin', '/admin/settings']) {
    const { html } = await page(path, ownCookie);
    assert.doesNotMatch(html, /class="ed-banner"|data-guest-note|data-guest-timer/, path);
  }
});

test('the countdown matches the real session expiry (about one hour)', async () => {
  const html = (await page('/admin', gstCookie)).html;
  const exp = Number(/data-expires="(\d+)"/.exec(html)![1]);
  const left = exp - Date.now();
  assert.ok(left > 55 * 60_000 && left <= 60 * 60_000 + 5_000, `left=${left}`);
});

test('an expired guest is sent to sign-in on pages and gets 401 from the API (the client turns that into a friendly redirect)', async () => {
  const c = await loginGuest(s);
  const d = new DatabaseSync(s.dbPath);
  d.prepare("UPDATE sessions SET expires_at = ? WHERE role = 'guest'").run(Date.now() - 60_000);
  d.close();
  const r = await s.req('/admin', { cookie: c });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/admin/signin');
  assert.equal((await api(s, c)('GET', '/api/projects')).status, 401);
});

test('shipped client script handles expiry and the sign-in page explains it', async () => {
  const js = await (await s.req('/admin.js')).text();
  assert.match(js, /expired=1/);
  assert.match(js, /status === 401/);
  const signin = await (await s.req('/admin/signin')).text();
  const src = /<script type="module" src="([^"]+)"/.exec(signin)![1]!; // the sign-in logic ships as a file (CSP allows no inline scripts)
  assert.match(await (await s.req(src)).text(), /Your session has ended/);
});
