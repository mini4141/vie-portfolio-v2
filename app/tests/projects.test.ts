import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, loginOwner, loginGuest, api, type TestServer } from './helpers.ts';

let s: TestServer, own: ReturnType<typeof api>, gst: ReturnType<typeof api>;
before(async () => {
  s = await startServer({ TRUST_PROXY: '1' });
  own = api(s, await loginOwner(s));
  gst = api(s, await loginGuest(s));
});
after(async () => { await s.stop(); });

const pub = async (p: string) => s.req(p);
const create = async (title: string) => (await own('POST', '/api/projects', { title })).body.project as { id: number; slug: string; status: string };

test('create makes a private draft with a clean unique slug', async () => {
  const r = await own('POST', '/api/projects', { title: '  Café Tracker!  ' });
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.project.slug, r.body.project.status, r.body.project.title], ['cafe-tracker', 'draft', 'Café Tracker!']);
  assert.equal((await create('Café Tracker!')).slug, 'cafe-tracker-2');
  assert.equal((await pub('/projects/cafe-tracker')).status, 404, 'drafts are invisible to visitors');
  assert.equal((await own('POST', '/api/projects', { title: '   ' })).status, 400);
  assert.equal((await own('POST', '/api/projects', {})).status, 400);
});

test('update validates input and ignores unknown fields', async () => {
  const p = await create('Validation Lab');
  const ok = await own('PATCH', `/api/projects/${p.id}`, {
    summary: 'Short one.', kind: 'Web app', role: 'Solo', stack: 'Go, SQLite', tags: ['Web app', 'Open source', 'Web app'],
    live_url: 'https://example.com', src_url: '', started: '2026-01', finished: '2026-03', featured: true, id: 999, status_x: 1,
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.project.tags, ['Web app', 'Open source'], 'tags are trimmed and de-duplicated');
  assert.equal(ok.body.project.id, p.id, 'unknown/protected fields are ignored');
  const bad: [string, unknown][] = [
    ['title', ''], ['summary', 'x'.repeat(141)], ['live_url', 'javascript:alert(1)'], ['live_url', 'ftp://x.dev'], ['started', '2026-13'],
    ['started', 'March'], ['tags', 'nope'], ['tags', Array(13).fill('t')], ['tags', ['']], ['featured', 'yes'], ['status', 'archived'], ['cover_media_id', 99999], ['slug', '!!!'],
  ];
  for (const [k, v] of bad) assert.equal((await own('PATCH', `/api/projects/${p.id}`, { [k]: v })).status, 400, `${k}=${JSON.stringify(v)}`);
  assert.equal((await own('PATCH', '/api/projects/99999', { title: 'x' })).status, 404);
  assert.equal((await own('PATCH', '/api/projects/abc', { title: 'x' })).status, 404);
});

test('publish / unpublish controls public visibility, sitemap and landing', async () => {
  const p = await create('Visible Thing');
  await own('PATCH', `/api/projects/${p.id}`, { summary: 'Now you see me.', tags: ['Backend'], featured: true });
  assert.equal((await pub('/projects/visible-thing')).status, 404);
  const r = await own('PATCH', `/api/projects/${p.id}`, { status: 'published' });
  assert.equal(r.status, 200);
  assert.ok(r.body.project.published_at);
  const page = await pub('/projects/visible-thing');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Now you see me\./);
  assert.match(await (await pub('/projects')).text(), /<a href="\/projects\/visible-thing">/);
  assert.match(await (await pub('/sitemap.xml')).text(), /visible-thing/);
  assert.match(await (await pub('/')).text(), /href="\/projects\/visible-thing"/, 'featured + published shows on the landing page');
  await own('PATCH', `/api/projects/${p.id}`, { status: 'draft' });
  assert.equal((await pub('/projects/visible-thing')).status, 404);
  assert.doesNotMatch(await (await pub('/projects')).text(), /visible-thing/);
  assert.doesNotMatch(await (await pub('/sitemap.xml')).text(), /visible-thing/);
});

test('story is sanitised on save, so injected markup never reaches visitors', async () => {
  const p = await create('Safe Story');
  const r = await own('PATCH', `/api/projects/${p.id}`, {
    story_html: '<h2>Hi</h2><script>alert(1)</script><p onclick="x()">t <a href="javascript:alert(2)">l</a></p><img src=x onerror=alert(3)><iframe src="//evil"></iframe>',
    status: 'published',
  });
  assert.equal(r.status, 200);
  const html = await (await pub('/projects/safe-story')).text();
  const story = html.slice(html.indexOf('<div class="rt">')).split('<footer')[0]!;
  assert.ok(story.includes('<h2>Hi</h2>'));
  assert.doesNotMatch(story, /<script|onclick|onerror|javascript:|<iframe/i);
});

test('slug can be changed but never duplicated', async () => {
  const a = await create('Alpha One'), b = await create('Beta One');
  assert.equal((await own('PATCH', `/api/projects/${b.id}`, { slug: 'alpha-one' })).status, 409);
  const ok = await own('PATCH', `/api/projects/${b.id}`, { slug: 'My Custom Page' });
  assert.equal(ok.body.project.slug, 'my-custom-page');
  assert.equal((await own('PATCH', `/api/projects/${a.id}`, { slug: 'alpha-one' })).status, 200, 'keeping your own slug is fine');
});

test('duplicate creates an unpublished, unfeatured copy', async () => {
  const src = await own('GET', '/api/projects?q=pocketwise');
  const orig = src.body.projects.find((p: { slug: string }) => p.slug === 'pocketwise');
  const r = await own('POST', `/api/projects/${orig.id}/duplicate`);
  assert.equal(r.status, 201);
  const c = r.body.project;
  assert.deepEqual([c.title, c.status, c.featured, c.story_html === orig.story_html], ['Pocketwise (copy)', 'draft', false, true]);
  assert.notEqual(c.slug, 'pocketwise');
  assert.equal((await own('POST', '/api/projects/99999/duplicate')).status, 404);
});

test('reorder changes the public order; partial or bogus lists are refused', async () => {
  const list = (await own('GET', '/api/projects')).body.projects as { id: number; slug: string; status: string }[];
  const ids = list.map((p) => p.id);
  assert.equal((await own('POST', '/api/projects/reorder', { ids: ids.slice(1) })).status, 400);
  assert.equal((await own('POST', '/api/projects/reorder', { ids: [...ids.slice(1), 99999] })).status, 400);
  assert.equal((await own('POST', '/api/projects/reorder', { ids: 'x' })).status, 400);
  const reversed = [...ids].reverse();
  assert.equal((await own('POST', '/api/projects/reorder', { ids: reversed })).status, 200);
  const slugs = [...(await (await pub('/projects')).text()).matchAll(/<a href="\/projects\/([\w-]+)">/g)].map((m) => m[1]);
  const expected = reversed.map((id) => list.find((p) => p.id === id)!).filter((p) => p.status === 'published').map((p) => p.slug);
  assert.deepEqual(slugs, expected);
});

test('delete removes the project and its public page; 404 the second time', async () => {
  const p = await create('Doomed');
  await own('PATCH', `/api/projects/${p.id}`, { status: 'published' });
  assert.equal((await pub('/projects/doomed')).status, 200);
  assert.equal((await own('DELETE', `/api/projects/${p.id}`)).status, 200);
  assert.equal((await pub('/projects/doomed')).status, 404);
  assert.equal((await own('DELETE', `/api/projects/${p.id}`)).status, 404);
});

test('search filters by title, summary and tags', async () => {
  const r = async (q: string) => ((await own('GET', `/api/projects?q=${encodeURIComponent(q)}`)).body.projects as { slug: string }[]).map((p) => p.slug);
  assert.ok((await r('budget')).includes('pocketwise'));
  assert.deepEqual(await r('zzzz-no-match'), []);
  assert.ok((await r('open source')).includes('kanal'));
});

test('guests see published work and sample drafts only, never real drafts', async () => {
  const secret = await create('Secret Client Work');
  await own('PATCH', `/api/projects/${secret.id}`, { summary: 'confidential' });
  const g = (await gst('GET', '/api/projects')).body.projects as { id: number; slug: string; status: string; is_sample: boolean }[];
  assert.ok(g.length >= 8);
  assert.ok(!g.some((p) => p.slug === 'secret-client-work'));
  assert.ok(g.every((p) => p.status === 'published' || p.is_sample));
  assert.equal((await gst('GET', `/api/projects/${secret.id}`)).status, 404);
  assert.equal((await gst('GET', '/api/projects?q=confidential')).body.projects.length, 0);
  const sample = g.find((p) => p.is_sample)!;
  assert.equal((await gst('GET', `/api/projects/${sample.id}`)).status, 200);
  assert.equal((await own('GET', `/api/projects/${secret.id}`)).status, 200);
});

test('guests cannot mutate through any project endpoint, and nothing changed', async () => {
  const before = JSON.stringify((await own('GET', '/api/projects')).body);
  const sample = ((await gst('GET', '/api/projects')).body.projects as { id: number }[])[0]!;
  const attempts: [string, string, unknown?][] = [
    ['POST', '/api/projects', { title: 'hack' }], ['PATCH', `/api/projects/${sample.id}`, { title: 'hacked' }], ['DELETE', `/api/projects/${sample.id}`],
    ['POST', `/api/projects/${sample.id}/duplicate`], ['POST', '/api/projects/reorder', { ids: [] }],
  ];
  for (const [m, p, b] of attempts) assert.equal((await gst(m, p, b)).status, 403, `${m} ${p}`);
  assert.equal(JSON.stringify((await own('GET', '/api/projects')).body), before);
});
