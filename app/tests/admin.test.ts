import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, loginOwner, loginGuest, api, type TestServer } from './helpers.ts';
import { relTime, relShort } from '../src/lib/text.ts';

let s: TestServer, ownCookie: string, gstCookie: string, own: ReturnType<typeof api>;
before(async () => {
  s = await startServer({ TRUST_PROXY: '1' });
  ownCookie = await loginOwner(s);
  gstCookie = await loginGuest(s);
  own = api(s, ownCookie);
});
after(async () => { await s.stop(); });

const page = async (path: string, cookie?: string) => { const r = await s.req(path, { cookie }); return { status: r.status, html: await r.text() }; };

test('relTime reads like a person', () => {
  const now = 1_000_000_000_000;
  assert.equal(relTime(now - 5_000, now), 'Just now');
  assert.equal(relTime(now - 12 * 60_000, now), '12 min ago');
  assert.equal(relTime(now - 3600_000, now), '1 hour ago');
  assert.equal(relTime(now - 30 * 3600_000, now), 'Yesterday');
  assert.equal(relTime(now - 3 * 86400_000, now), '3 days ago');
  assert.equal(relTime(now - 21 * 86400_000, now), '3 weeks ago');
  assert.equal(relTime(now - 90 * 86400_000, now), '3 months ago');
  assert.equal(relTime(now + 5_000, now), 'Just now', 'clock skew never shows the future');
  assert.deepEqual([5_000, 12 * 60_000, 5 * 3600_000, 3 * 86400_000, 21 * 86400_000, 90 * 86400_000].map((ms) => relShort(now - ms, now)), ['now', '12m', '5h', '3d', '3w', '3mo']);
});

test('admin pages need a session', async () => {
  assert.equal((await page('/admin')).status, 302);
  assert.equal((await page('/admin/projects/1')).status, 302);
});

test('owner dashboard shows counts, recent edits and every project incl. real drafts', async () => {
  const draft = (await own('POST', '/api/projects', { title: 'Secret <b>Draft</b>' })).body.project;
  const { status, html } = await page('/admin', ownCookie);
  assert.equal(status, 200);
  assert.match(html, /Published projects/);
  assert.match(html, /Recently edited/);
  assert.match(html, /data-new-project/);
  assert.doesNotMatch(html, /data-locked/, 'owner controls are live');
  assert.match(html, new RegExp(`data-id="${draft.id}"`));
  assert.match(html, /Secret &lt;b&gt;Draft&lt;\/b&gt;/, 'titles are escaped');
  assert.doesNotMatch(html, />Secret <b>/, 'no raw markup in text content');
  assert.match(html, /owner@test\.dev/);
  assert.match(html, /id="new-dlg"/);
});

test('guest dashboard locks every write control and hides real drafts and the owner email', async () => {
  const { html } = await page('/admin', gstCookie);
  assert.doesNotMatch(html, /Secret/, 'real draft not visible');
  assert.doesNotMatch(html, /owner@test\.dev/);
  assert.match(html, /Guest/);
  assert.match(html, /View-only visit/);
  for (const act of ['duplicate', 'delete', 'feature']) assert.match(html, new RegExp(`data-act="${act}"[^>]*data-locked`), `${act} locked`);
  assert.match(html, /data-new-project[^>]*data-locked/);
  assert.match(html, /data-handle data-locked/);
  assert.doesNotMatch(html, /id="new-dlg"|id="del-dlg"/, 'no live dialogs for guests');
  assert.doesNotMatch(html, /draggable/);
  assert.match(html, /Sample draft/);
});

test('project stub page: owner sees drafts, guests only samples, bad ids 404', async () => {
  const draft = (await own('POST', '/api/projects', { title: 'Owner Only Thing' })).body.project;
  assert.equal((await page(`/admin/projects/${draft.id}`, ownCookie)).status, 200);
  assert.equal((await page(`/admin/projects/${draft.id}`, gstCookie)).status, 404);
  assert.equal((await page('/admin/projects/99999', ownCookie)).status, 404);
  assert.equal((await page('/admin/projects/abc', ownCookie)).status, 404);
  const sample = (await api(s, gstCookie)('GET', '/api/projects')).body.projects.find((p: any) => p.is_sample);
  assert.equal((await page(`/admin/projects/${sample.id}`, gstCookie)).status, 200);
});

test('dashboard actions work through the API the UI uses (feature, duplicate, delete, reorder)', async () => {
  const p = (await own('POST', '/api/projects', { title: 'Round Trip' })).body.project;
  assert.equal((await own('PATCH', `/api/projects/${p.id}`, { featured: true })).status, 200);
  assert.match((await page('/admin', ownCookie)).html, new RegExp(`data-id="${p.id}"[\\s\\S]*?aria-pressed="true"`));
  const dup = (await own('POST', `/api/projects/${p.id}/duplicate`)).body.project;
  assert.equal(dup.title, 'Round Trip (copy)');
  const list = (await own('GET', '/api/projects')).body.projects.map((x: any) => x.id) as number[];
  assert.equal((await own('POST', '/api/projects/reorder', { ids: [...list].reverse() })).status, 200);
  const after = (await own('GET', '/api/projects')).body.projects.map((x: any) => x.id);
  assert.deepEqual(after, [...list].reverse());
  assert.equal((await own('DELETE', `/api/projects/${dup.id}`)).status, 200);
  assert.doesNotMatch((await page('/admin', ownCookie)).html, /Round Trip \(copy\)/);
});

test('hidden elements stay hidden despite component display rules', async () => {
  const css = await (await s.req((await page('/admin', ownCookie)).html.match(/href="(\/_astro\/[^"]+\.css)"/)![1]!)).text();
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/, 'the featured badge relies on [hidden]');
});

test('admin.js is served and the shell loads it', async () => {
  const r = await s.req('/admin.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /javascript/);
  assert.match((await page('/admin', ownCookie)).html, /src="\/admin\.js"/);
});
