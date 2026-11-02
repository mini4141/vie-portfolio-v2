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

const text = async (path: string, cookie?: string) => (await s.req(path, { cookie })).text();
const media = async () => (await own('GET', '/api/media')).body.media as { id: number; mime: string; filename: string }[];

test('profile: edits show up on the landing page, escaped', async () => {
  const r = await own('PATCH', '/api/profile', { name: 'Ada <b>Lovelace</b>', headline: 'Builds engines', location: 'London', email: 'ada@example.com', about: 'First para.\n\nSecond <i>para</i>.' });
  assert.equal(r.status, 200);
  assert.equal(r.body.profile.name, 'Ada <b>Lovelace</b>');
  const home = await text('/');
  assert.match(home, /Ada &lt;b&gt;Lovelace&lt;\/b&gt;/);
  assert.doesNotMatch(home, /<b>Lovelace/);
  assert.match(home, /ada@example\.com/);
  assert.match(home, /Second &lt;i&gt;para&lt;\/i&gt;/);
});

test('profile: validation gives kind messages and changes nothing on failure', async () => {
  const before = JSON.stringify((await own('GET', '/api/profile')).body);
  const bad: Record<string, unknown>[] = [
    { name: '' }, { name: 'x'.repeat(81) }, { email: 'not-an-email' }, { about: 5 },
    { links: [{ label: 'Evil', url: 'javascript:alert(1)' }] }, { links: [{ label: '', url: 'https://a.dev' }] },
    { skills: [{ group: 'X', items: [''] }] }, { experience: [{ years: '1', role: '', org: '', text: '' }] },
    { sections: [{ key: 'about', visible: true }] }, { sections: ['about'] },
    { photo_media_id: 99999 }, { photo_media_id: 'abc' },
  ];
  for (const b of bad) {
    const r = await own('PATCH', '/api/profile', b);
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.ok(r.body.message.length > 10);
  }
  assert.equal(JSON.stringify((await own('GET', '/api/profile')).body), before);
});

test('profile: photo must be a picture and CV a PDF', async () => {
  const m = await media();
  const img = m.find((x) => x.mime.startsWith('image/'))!, pdf = m.find((x) => x.mime === 'application/pdf')!;
  assert.equal((await own('PATCH', '/api/profile', { photo_media_id: pdf.id })).status, 400);
  assert.equal((await own('PATCH', '/api/profile', { cv_media_id: img.id })).status, 400);
  const ok = await own('PATCH', '/api/profile', { photo_media_id: img.id, cv_media_id: pdf.id });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.profile.photo_file, img.filename);
  assert.equal((await own('PATCH', '/api/profile', { photo_media_id: null, cv_media_id: null })).body.profile.cv_file, null);
  assert.doesNotMatch(await text('/'), /download/, 'no CV link once cleared');
});

test('profile: skills, experience, links and section order/visibility drive the landing page', async () => {
  const r = await own('PATCH', '/api/profile', {
    skills: [{ group: 'Languages', items: ['Zig', 'OCaml'] }],
    experience: [{ years: '2030–now', role: 'Time Traveller', org: 'Nowhere Inc', text: 'Arrived early.' }],
    links: [{ label: 'Site', url: 'https://example.org/me' }],
    sections: [{ key: 'contact', visible: true }, { key: 'skills', visible: true }, { key: 'about', visible: false }, { key: 'featured', visible: true }, { key: 'experience', visible: false }],
  });
  assert.equal(r.status, 200);
  const home = await text('/');
  assert.match(home, /OCaml/);
  assert.match(home, /example\.org\/me/);
  assert.doesNotMatch(home, /Time Traveller/, 'hidden section is not rendered');
  assert.ok(home.indexOf('id="contact"') < home.indexOf('id="skills"'), 'order follows the setting');
  assert.doesNotMatch(home, /id="about"/);
});

test('settings: title, description, accent, theme and share picture apply to the public site', async () => {
  const img = (await media()).find((x) => x.mime.startsWith('image/'))!;
  const r = await own('PATCH', '/api/settings', { site_title: 'Ada’s Site', description: 'Engines & more', accent: '#2f6fed', default_theme: 'dark', share_media_id: img.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.settings.accent, '#2F6FED');
  const home = await text('/');
  assert.match(home, /<title>Ada’s Site<\/title>|Ada’s Site/);
  assert.match(home, /--accent:#2F6FED/);
  assert.match(home, /og:image" content="[^"]*\/media\//);
  assert.match(home, /var def = "dark"|def = "dark"|"dark"/);
  assert.equal((await s.req('/projects')).status, 200);
});

test('settings: bad values are refused', async () => {
  for (const b of [{ site_title: '' }, { accent: 'red' }, { accent: '#12345' }, { default_theme: 'neon' }, { guest_enabled: 'yes' }, { share_media_id: 99999 }, { description: 'x'.repeat(301) }]) {
    assert.equal((await own('PATCH', '/api/settings', b)).status, 400, JSON.stringify(b));
  }
});

test('settings: switching guest mode off ends guest sessions and hides the button; on restores it', async () => {
  assert.equal((await own('PATCH', '/api/settings', { guest_enabled: false })).status, 200);
  assert.equal((await gst('GET', '/api/profile')).status, 401, 'existing guest session stops working');
  assert.doesNotMatch(await text('/admin/signin'), /id="guest"/);
  assert.equal((await s.req('/api/auth/guest', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status, 403);
  assert.equal((await own('PATCH', '/api/settings', { guest_enabled: true })).status, 200);
  assert.match(await text('/admin/signin'), /id="guest"/);
});

test('guests can read profile and settings but every write is refused, nothing changes', async () => {
  const g = await loginGuest(s), gs = api(s, g);
  const before = JSON.stringify([(await own('GET', '/api/profile')).body, (await own('GET', '/api/settings')).body]);
  assert.equal((await gs('GET', '/api/profile')).status, 200);
  assert.equal((await gs('GET', '/api/settings')).status, 200);
  assert.doesNotMatch(JSON.stringify((await gs('GET', '/api/settings')).body), /owner@test\.dev/);
  for (const [path, body] of [['/api/profile', { name: 'hacked' }], ['/api/settings', { site_title: 'hacked' }], ['/api/settings', { guest_enabled: false }]] as const) {
    const r = await gs('PATCH', path, body);
    assert.equal(r.status, 403, path);
    assert.equal(r.body.error, 'guest_read_only');
  }
  assert.equal(JSON.stringify([(await own('GET', '/api/profile')).body, (await own('GET', '/api/settings')).body]), before);
  assert.equal((await s.req('/api/profile')).status, 401, 'visitors are signed out');
  assert.equal((await s.req('/api/settings', { method: 'PATCH', body: '{}' })).status, 401);
});

test('profile and settings screens: owner gets live controls, guest gets locked ones, visitors are redirected', async () => {
  for (const [path, hook] of [['/admin/profile', 'pf-data'], ['/admin/settings', 'st-data']] as const) {
    const o = await text(path, ownCookie), g = await text(path, gstCookie);
    assert.match(o, new RegExp(`id="${hook}"`));
    assert.doesNotMatch(o, /data-locked/);
    assert.match(g, /data-locked/);
    assert.doesNotMatch(g, /owner@test\.dev/);
    assert.equal((await s.req(path)).status, 302);
  }
  const html = await text('/admin/profile', ownCookie);
  assert.match(html, /href="\/admin\/settings"/);
  assert.doesNotMatch(html, /data-soon/, 'no coming-soon nav items remain');
});
