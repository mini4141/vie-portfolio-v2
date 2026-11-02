import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, loginOwner, loginGuest, api, type TestServer } from './helpers.ts';

let s: TestServer, ownCookie: string, gstCookie: string, own: ReturnType<typeof api>, gst: ReturnType<typeof api>;
before(async () => {
  s = await startServer({ TRUST_PROXY: '1' });
  ownCookie = await loginOwner(s);
  gstCookie = await loginGuest(s);
  own = api(s, ownCookie);
  gst = api(s, gstCookie);
});
after(async () => { await s.stop(); });

const page = async (path: string, cookie?: string) => { const r = await s.req(path, { cookie }); return { status: r.status, html: await r.text() }; };
const embedded = (html: string) => JSON.parse(html.match(/<script type="application\/json" id="ed-data">([\s\S]*?)<\/script>/)![1]!);

test('editor page ships the editing surface, its bundle and the project data', async () => {
  const { status, html } = await page('/admin/projects/1', ownCookie);
  assert.equal(status, 200);
  for (const hook of ['data-rt', 'data-doc-title', 'data-doc-sum', 'data-block-type', 'data-mode-btn="split"', 'data-preview-frame', 'data-tags', 'data-autosave', 'data-ctx']) assert.ok(html.includes(hook), hook);
  assert.match(html, /double-click a picture to edit it/);
  assert.match(html, /<script type="module" src="\/_astro\/[^"]+\.js"/, 'editor bundle is referenced');
  const d = embedded(html);
  assert.equal(d.id, 1);
  assert.equal(d.role, 'owner');
  assert.match(d.story_html, /<h2>/);
  assert.match(html, /data-act="publish"[^>]*hidden/, 'published project hides Publish');
});

test('a story that tries to close the data script cannot break out of the page', async () => {
  const p = (await own('POST', '/api/projects', { title: 'Inject" autofocus onfocus="alert(1)' })).body.project;
  // the sanitiser strips script tags on save; the title is the raw-text vector
  await own('PATCH', `/api/projects/${p.id}`, { story_html: '<p>hi </script><script>alert(1)</script></p>', summary: '</script><script>alert(2)</script>' });
  const { html } = await page(`/admin/projects/${p.id}`, ownCookie);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /" onfocus="/, 'quotes in the title are escaped inside attributes');
  const d = embedded(html);
  assert.equal(d.title, 'Inject" autofocus onfocus="alert(1)');
  assert.doesNotMatch(d.story_html, /script/i);
});

test('drafts open for the owner, guests get 404 on real drafts and a locked editor on samples', async () => {
  const draft = (await own('POST', '/api/projects', { title: 'Private Plans' })).body.project;
  assert.equal((await page(`/admin/projects/${draft.id}`, gstCookie)).status, 404);
  const sample = (await gst('GET', '/api/projects')).body.projects.find((p: any) => p.is_sample);
  const { status, html } = await page(`/admin/projects/${sample.id}`, gstCookie);
  assert.equal(status, 200);
  assert.equal(embedded(html).role, 'guest');
  assert.doesNotMatch(html, /owner@test\.dev/, 'owner email stays hidden');
  assert.equal((html.match(/data-locked/g) ?? []).length >= 3, true, 'duplicate, delete and publish are locked');
});

test('autosave payload (everything the editor sends) saves, sanitises and is read back', async () => {
  const p = (await own('POST', '/api/projects', { title: 'Autosave Me' })).body.project;
  const body = {
    title: 'Autosave Me v2', summary: 'One line', tags: ['a', 'b'], kind: 'App', role: 'Solo', stack: 'Astro', live_url: '', src_url: 'https://example.com/x',
    started: '2026-01', finished: '', featured: true,
    story_html: '<h2>Hi</h2><div class="rt-table"><table><tbody><tr><th>a</th></tr></tbody></table></div><aside class="callout" data-kind="tip"><p onclick="x()">tip</p></aside>',
  };
  const r = await own('PATCH', `/api/projects/${p.id}`, body);
  assert.equal(r.status, 200);
  assert.equal(r.body.project.title, 'Autosave Me v2');
  assert.match(r.body.project.story_html, /<aside class="callout" data-kind="tip"><p>tip<\/p><\/aside>/);
  assert.match(r.body.project.story_html, /<div class="rt-table"><table>/);
  // a half-typed link is a friendly 400, not a crash
  const bad = await own('PATCH', `/api/projects/${p.id}`, { ...body, live_url: 'pocketwise.app' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /https?:\/\//);
});

test('publish and unpublish from the editor flip public visibility', async () => {
  const p = (await own('POST', '/api/projects', { title: 'Flip Me' })).body.project;
  assert.equal((await s.req(`/projects/${p.slug}`)).status, 404);
  assert.equal((await own('PATCH', `/api/projects/${p.id}`, { status: 'published' })).status, 200);
  assert.equal((await s.req(`/projects/${p.slug}`)).status, 200);
  assert.equal((await own('PATCH', `/api/projects/${p.id}`, { status: 'draft' })).status, 200);
  assert.equal((await s.req(`/projects/${p.slug}`)).status, 404);
});

test('guests can open the editor but every save, publish and delete is refused', async () => {
  const sample = (await gst('GET', '/api/projects')).body.projects.find((p: any) => p.is_sample);
  for (const [m, path, b] of [['PATCH', `/api/projects/${sample.id}`, { title: 'x' }], ['PATCH', `/api/projects/${sample.id}`, { status: 'published' }], ['DELETE', `/api/projects/${sample.id}`, undefined], ['POST', `/api/projects/${sample.id}/duplicate`, undefined]] as const) {
    const r = await gst(m, path, b);
    assert.equal(r.status, 403, `${m} ${path}`);
    assert.equal(r.body.error, 'guest_read_only');
  }
});
