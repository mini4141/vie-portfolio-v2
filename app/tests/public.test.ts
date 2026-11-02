import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, type TestServer } from './helpers.ts';

let s: TestServer;
before(async () => { s = await startServer(); });
after(async () => { await s.stop(); });

const text = async (p: string) => (await s.req(p)).text();

test('landing page renders profile, featured projects, skills, experience, contact', async () => {
  const r = await s.req('/');
  assert.equal(r.status, 200);
  const h = await r.text();
  assert.match(h, /<title>Muhamad Alvie — Software Engineer<\/title>/);
  assert.match(h, /<h1[^>]*>Muhamad Alvie<\/h1>/);
  for (const t of ['pocketwise/', 'laju/', 'kanal/', 'sehat/']) assert.ok(h.includes(t), t);
  assert.ok(!h.includes('arsip/') || h.includes('see all 6'), 'only featured on the landing page');
  assert.ok(h.includes('see all 6'));
  assert.match(h, /"frontend"/);
  assert.match(h, /Senior Software Engineer/);
  assert.match(h, /mailto:hello@vie\.dev/);
  assert.match(h, /href="\/media\/cv-muhamad-alvie\.pdf"/);
  assert.match(h, /<a href="\/admin\/signin">Try the editor/);
});

test('share metadata is present for LinkedIn / WhatsApp / X', async () => {
  const h = await text('/projects/pocketwise');
  assert.match(h, /<meta property="og:title" content="Pocketwise — Muhamad Alvie">/);
  assert.match(h, /<meta property="og:description" content="A budget tracker/);
  assert.match(h, new RegExp(`<meta property="og:image" content="${s.base}/media/p-pocketwise\\.jpg">`));
  assert.match(h, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(h, new RegExp(`<link rel="canonical" href="${s.base}/projects/pocketwise">`));
});

test('all projects page lists only published projects with tag filters', async () => {
  const h = await text('/projects');
  for (const t of ['pocketwise/', 'laju/', 'kanal/', 'sehat/', 'arsip/', 'mini-cms/']) assert.ok(h.includes(`<strong>${t}</strong>`), t);
  assert.ok(!h.includes('sample-draft'), 'drafts must not leak');
  for (const f of ['--backend', '--data', '--mobile-app', '--open-source', '--web-app']) assert.ok(h.includes(f), f);
  assert.match(h, /6 projects/);
});

test('project detail renders the rich story and links to the next project', async () => {
  const h = await text('/projects/pocketwise');
  assert.match(h, /<h1[^>]*># Pocketwise<\/h1>/);
  assert.match(h, /<div class="rt">/);
  for (const frag of ['<h2>The problem</h2>', 'class="stat"', 'class="callout"', 'class="rt-table"', 'class="shots"', '<pre class="code"']) assert.ok(h.includes(frag), frag);
  assert.match(h, /kind<\/span>:  Budget tracker app/);
  assert.match(h, /dates<\/span>: Jan — Apr 2026/);
  assert.match(h, /href="https:\/\/pocketwise\.app"/);
  assert.match(h, /cd \.\.\/laju/);
});

test('drafts and unknown slugs are 404, even by guessing the slug', async () => {
  for (const p of ['/projects/sample-draft-weather', '/projects/nope', '/projects/..%2F..%2Fetc']) {
    const r = await s.req(p);
    assert.equal(r.status, 404, p);
    assert.ok(!(await r.text()).includes('Sample draft'));
  }
});

test('media is served with the right type; traversal and unknown files are refused', async () => {
  const ok = await s.req('/media/g1.jpg');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  assert.ok(ok.headers.get('cache-control')?.includes('max-age'));
  assert.equal((await s.req('/media/cv-muhamad-alvie.pdf')).headers.get('content-type'), 'application/pdf');
  for (const p of ['/media/missing.jpg', '/media/..%2Fapp.db', '/media/%2e%2e%2f%2e%2e%2fapp.db', '/media/app.db', '/media/a.jpg/../../x']) {
    assert.ok([400, 404].includes((await s.req(p)).status), p);
  }
});

test('robots.txt and sitemap.xml', async () => {
  assert.match(await text('/robots.txt'), /Disallow: \/admin/);
  const x = await text('/sitemap.xml');
  assert.match(x, new RegExp(`<loc>${s.base}/projects/pocketwise</loc>`));
  assert.ok(!x.includes('sample-draft'));
  assert.equal((x.match(/<url>/g) ?? []).length, 8);
});

test('404 page', async () => {
  const r = await s.req('/nothing-here');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /404 — not found/);
});
