import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { startServer, loginOwner, loginGuest, type TestServer } from './helpers.ts';
import { CSP, securityHeaders, withSecurityHeaders } from '../src/lib/headers.ts';

let s: TestServer, ownCookie: string, gstCookie: string;
before(async () => { s = await startServer(); ownCookie = await loginOwner(s); gstCookie = await loginGuest(s); });
after(async () => { await s.stop(); });

test('CSP forbids inline and third-party scripts, framing, plugins and foreign forms', () => {
  assert.match(CSP, /script-src 'self'(;|$)/);
  assert.doesNotMatch(CSP.split('; ').find((d) => d.startsWith('script-src'))!, /unsafe/);
  for (const d of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(CSP.includes(d), d);
  assert.doesNotMatch(CSP, /https?:\/\//, 'no remote hosts allowed anywhere');
});

test('headers: HSTS only over https; immutable responses are copied, not crashed on', () => {
  assert.ok(!('Strict-Transport-Security' in securityHeaders(false)));
  assert.ok('Strict-Transport-Security' in securityHeaders(true));
  const redirect = Response.redirect('http://x.test/y', 302);
  assert.equal(withSecurityHeaders(redirect, false).headers.get('x-content-type-options'), 'nosniff');
});

test('every kind of response carries the security headers: pages, 404, redirects, API, errors', async () => {
  const cases: [string, string | undefined][] = [
    ['/', undefined], ['/projects', undefined], ['/projects/pocketwise', undefined], ['/nope', undefined], ['/robots.txt', undefined],
    ['/healthz', undefined], ['/admin', undefined], ['/admin/signin', undefined], ['/admin', ownCookie], ['/admin/settings', gstCookie],
    ['/api/projects', undefined], ['/api/projects', ownCookie],
  ];
  for (const [path, cookie] of cases) {
    const r = await s.req(path, { cookie });
    assert.equal(r.headers.get('content-security-policy'), CSP, `${path} CSP`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', path);
    assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
    assert.match(r.headers.get('permissions-policy') ?? '', /camera=\(\)/, path);
    await r.arrayBuffer();
  }
});

test('no inline scripts and no third-party hosts on any page (public, sign-in, owner and guest admin)', async () => {
  const pages: [string, string | undefined][] = [
    ['/', undefined], ['/projects', undefined], ['/projects/pocketwise', undefined], ['/nope', undefined], ['/admin/signin', undefined],
    ['/admin', ownCookie], ['/admin/profile', ownCookie], ['/admin/media', ownCookie], ['/admin/settings', ownCookie], ['/admin/projects/1', ownCookie],
    ['/admin', gstCookie], ['/admin/projects/1', gstCookie],
  ];
  for (const [path, cookie] of pages) {
    const html = await (await s.req(path, { cookie })).text();
    for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
      assert.match(m[1]!, /\bsrc=|type="application\/json"/, `${path}: inline script ${m[0]}`);
    }
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, `${path}: inline event handler`);
    assert.doesNotMatch(html, /javascript:/i, `${path}: javascript: url`);
    assert.doesNotMatch(html, /<(?:script|link(?![^>]*rel="canonical")|img|iframe)\b[^>]*\s(?:src|href)="https?:\/\//i, `${path}: remote asset (links to other sites in <a> are fine)`);
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, `${path}: Google Fonts`);
  }
});

test('fonts are served from our own origin with the right type; every url() in fonts.css exists', async () => {
  const css = await (await s.req('/fonts/fonts.css')).text();
  const urls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]!);
  assert.ok(urls.length >= 10);
  for (const u of urls) {
    const r = await s.req(u);
    assert.equal(r.status, 200, u);
    assert.match(r.headers.get('content-type') ?? '', /font\/woff2|application\/octet-stream/, u);
    await r.arrayBuffer();
  }
  assert.doesNotMatch(css, /https?:\/\//);
});

test('theme script is a file, reads the default theme from the page, and never throws without storage', async () => {
  const js = await (await s.req('/theme.js')).text();
  assert.match(js, /data-default-theme/);
  assert.match(js, /try \{ t = localStorage/);
  assert.match(await (await s.req('/')).text(), /<html[^>]*data-default-theme="(light|dark|system)"/);
});

test('size budget: HTML, stylesheet and scripts stay small', async () => {
  const home = await (await s.req('/')).text();
  assert.ok(home.length < 60_000, `landing html ${home.length} bytes`);
  const css = [...home.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]!);
  for (const c of css) assert.ok((await (await s.req(c)).text()).length < 90_000, `${c} too big`);
  assert.ok((await (await s.req('/site.js')).text()).length < 8_000, 'site.js');
  const fonts = existsSync('public/fonts') ? readFileSync('public/fonts/plex-sans-400-latin.woff2').length : 0;
  assert.ok(fonts > 0 && fonts < 60_000, 'the main body font file is small enough to preload');
});
