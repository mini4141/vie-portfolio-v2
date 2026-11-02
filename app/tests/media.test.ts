import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { startServer, loginOwner, loginGuest, api, type TestServer } from './helpers.ts';
import { sniff } from '../src/lib/media.ts';

let s: TestServer, ownCookie: string, gstCookie: string, own: ReturnType<typeof api>, gst: ReturnType<typeof api>;
before(async () => {
  s = await startServer({ TRUST_PROXY: '1' });
  ownCookie = await loginOwner(s);
  gstCookie = await loginGuest(s);
  own = api(s, ownCookie);
  gst = api(s, gstCookie);
});
after(async () => { await s.stop(); });

const png = (w: number, h: number, color = '#336699') => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
async function upload(cookie: string | undefined, bytes: Buffer, name: string, alt?: string) {
  const f = new FormData();
  f.append('file', new File([new Uint8Array(bytes)], name));
  if (alt !== undefined) f.append('alt', alt);
  const r = await s.req('/api/media', { method: 'POST', body: f, cookie });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}

test('sniff identifies real types from bytes, not names', async () => {
  assert.equal(sniff(await png(4, 4)), 'png');
  assert.equal(sniff(Buffer.from('%PDF-1.7\n1 0 obj\n')), 'pdf');
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(sniff(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff')), null);
});

test('upload shrinks to WebP, hashes the name, serves it immutably and de-duplicates', async () => {
  const big = await png(3200, 1800);
  const r = await upload(ownCookie, big, 'My Big Shot.PNG', 'A blue rectangle');
  assert.equal(r.status, 201);
  const m = r.body.media;
  assert.equal(m.mime, 'image/webp');
  assert.ok(m.width <= 2400 && m.height <= 2400 && m.width === 2400, `resized to ${m.width}x${m.height}`);
  assert.match(m.filename, /^[0-9a-f]{12}-my-big-shot\.webp$/);
  assert.equal(m.alt, 'A blue rectangle');
  const file = await s.req(m.url);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/webp');
  assert.match(file.headers.get('cache-control')!, /immutable/);
  const again = await upload(ownCookie, big, 'whatever.png');
  assert.equal(again.body.media.id, m.id, 'same content is stored once');
});

test('only real pictures and PDFs are accepted; disguised or broken files get a kind message', async () => {
  const svg = await upload(ownCookie, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.png');
  assert.equal(svg.status, 400);
  assert.equal(svg.body.error, 'unsupported_type');
  const html = await upload(ownCookie, Buffer.from('<html><body>hi there friend</body></html>'), 'x.jpg');
  assert.equal(html.status, 400);
  const broken = await upload(ownCookie, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]), 'broken.png');
  assert.equal(broken.status, 400);
  assert.equal(broken.body.error, 'unreadable_image');
  const huge = await upload(ownCookie, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16 * 1024 * 1024)]), 'huge.jpg');
  assert.equal(huge.status, 413);
  const none = await s.req('/api/media', { method: 'POST', cookie: ownCookie, body: new FormData() });
  assert.equal(none.status, 400);
});

test('PDFs are stored as-is and served as PDF', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const r = await upload(ownCookie, pdf, 'My CV.pdf');
  assert.equal(r.status, 201);
  assert.equal(r.body.media.kind, 'file');
  const f = await s.req(r.body.media.url);
  assert.equal(f.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await f.arrayBuffer()), pdf);
});

test('alt text can be edited; bad values are refused', async () => {
  const m = (await upload(ownCookie, await png(40, 40, '#aa3333'), 'red.png')).body.media;
  const ok = await own('PATCH', `/api/media/${m.id}`, { alt: '  A red square  ' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.media.alt, 'A red square');
  assert.equal((await own('PATCH', `/api/media/${m.id}`, { alt: 'x'.repeat(301) })).status, 400);
  assert.equal((await own('PATCH', `/api/media/${m.id}`, { alt: 5 })).status, 400);
  assert.equal((await own('PATCH', '/api/media/99999', { alt: 'x' })).status, 404);
});

test('files in use cannot be deleted; unused ones are removed from disk', async () => {
  const used = (await upload(ownCookie, await png(50, 50, '#118811'), 'cover.png')).body.media;
  const proj = (await own('POST', '/api/projects', { title: 'Has Cover' })).body.project;
  assert.equal((await own('PATCH', `/api/projects/${proj.id}`, { cover_media_id: used.id })).status, 200);
  const blocked = await own('DELETE', `/api/media/${used.id}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /cover of “Has Cover”/);
  await own('PATCH', `/api/projects/${proj.id}`, { story_html: `<p>x</p><figure class="rt-img"><div class="win"><img src="${used.url}" alt=""></div></figure>`, cover_media_id: null });
  assert.match((await own('DELETE', `/api/media/${used.id}`)).body.message, /story of “Has Cover”/, 'a picture inside a story counts as used');
  await own('PATCH', `/api/projects/${proj.id}`, { story_html: '<p>x</p>' });
  const path = join(s.dir, 'uploads', used.filename);
  assert.ok(existsSync(path));
  assert.equal((await own('DELETE', `/api/media/${used.id}`)).status, 200);
  assert.ok(!existsSync(path), 'file removed from disk');
  assert.equal((await s.req(used.url)).status, 404);
  assert.equal((await own('DELETE', `/api/media/${used.id}`)).status, 404);
});

test('guests can browse the library but cannot upload, edit or delete (nothing changes)', async () => {
  const before = JSON.stringify((await own('GET', '/api/media')).body);
  const list = await gst('GET', '/api/media');
  assert.equal(list.status, 200);
  assert.ok(list.body.media.length >= 7, 'sees the seeded pictures');
  const id = list.body.media[0].id;
  assert.equal((await upload(gstCookie, await png(10, 10), 'g.png')).status, 403);
  assert.equal((await gst('PATCH', `/api/media/${id}`, { alt: 'hacked' })).status, 403);
  assert.equal((await gst('DELETE', `/api/media/${id}`)).status, 403);
  assert.equal(JSON.stringify((await own('GET', '/api/media')).body), before);
});

test('visitors get 401 from the media API; /media files stay public', async () => {
  assert.equal((await s.req('/api/media')).status, 401);
  assert.equal((await s.req('/api/media', { method: 'POST', body: new FormData() })).status, 401);
  assert.equal((await s.req('/media/p-pocketwise.jpg')).status, 200);
});

test('media screen: owner can act, guests see locked controls; admin nav links to it', async () => {
  const o = await (await s.req('/admin/media', { cookie: ownCookie })).text();
  assert.match(o, /Pictures &amp; files/);
  assert.match(o, /data-alt/);
  assert.doesNotMatch(o, /data-locked/);
  assert.match(o, /href="\/admin\/media"/);
  const g = await (await s.req('/admin/media', { cookie: gstCookie })).text();
  assert.match(g, /data-locked/);
  assert.doesNotMatch(g, /owner@test\.dev/);
  assert.equal((await s.req('/admin/media')).status, 302);
});

test('editor page exposes the cover picker and the stored cover id', async () => {
  const html = await (await s.req('/admin/projects/1', { cookie: ownCookie })).text();
  assert.match(html, /data-cover-pick/);
  assert.match(html, /"cover_id":\d+/);
});
