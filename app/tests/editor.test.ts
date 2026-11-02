import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { open } from '../src/lib/db.ts';
import { seed } from '../src/lib/seed.ts';
import { sanitizeStory } from '../src/lib/sanitize.ts';

// The editor extensions render through the DOM, so give Node one before importing them.
const win = new Window();
Object.assign(globalThis, { window: win, document: win.document, DOMParser: win.DOMParser, Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement });
const { generateJSON, generateHTML } = await import('@tiptap/html');
const { storyExtensions, toStoryHtml, cleanFragment } = await import('../src/editor/extensions.ts');

const roundTrip = (html: string) => sanitizeStory(toStoryHtml(generateHTML(generateJSON(html, storyExtensions()), storyExtensions())));
const squash = (h: string) => h.replace(/\s+/g, ' ').replace(/> </g, '><').trim();

test('every seeded story keeps its blocks through the editor', () => {
  const d = open(':memory:');
  seed(d, { ownerEmail: 'a@b.dev', ownerPassword: 'x'.repeat(12), uploadDir: mkdtempSync(join(tmpdir(), 'vie-ed-')) });
  const stories = (d.prepare('SELECT story_html h FROM projects').all() as { h: string }[]).map((r) => r.h).filter(Boolean);
  assert.ok(stories.length >= 6);
  for (const html of stories) {
    const out = roundTrip(html);
    for (const sel of [/<h2/g, /<h3/g, /<figure/g, /class="shots"/g, /class="rt-table"/g, /aside class="callout"/g, /<blockquote/g, /<hr/g, /<pre class="code"/g, /<li>/g]) {
      assert.equal((out.match(sel) ?? []).length, (html.match(sel) ?? []).length, `${sel} count differs`);
    }
    assert.equal(squash(roundTrip(out)), squash(out), 'second round trip must be stable');
  }
});

test('stat quotes, callout kinds and code languages survive', () => {
  const out = roundTrip('<blockquote class="stat"><strong>40%</strong> faster</blockquote><aside class="callout" data-kind="warn"><p>careful</p></aside><pre class="code" data-lang="ts"><code>a\nb</code></pre>');
  assert.match(out, /<blockquote class="stat"><p><strong>40%<\/strong> faster<\/p><\/blockquote>/);
  assert.match(out, /<aside class="callout" data-kind="warn"><p>careful<\/p><\/aside>/);
  assert.match(out, /<pre class="code" data-lang="ts"><code>a\nb<\/code><\/pre>/);
});

test('blank paragraphs are not stored', () => {
  assert.equal(roundTrip('<p>a</p><p></p><h2>b</h2><p></p>'), '<p>a</p><h2>b</h2>');
});

test('verbatim media blocks lose scripts and inline handlers', () => {
  const el = win.document.createElement('div');
  el.innerHTML = '<figure class="rt-img"><img src="/media/a.jpg" alt="x" onerror="alert(1)"><script>alert(2)</script></figure>';
  const out = cleanFragment(el.firstElementChild as unknown as Element);
  assert.ok(!/onerror|script/i.test(out), out);
  assert.match(out, /src="\/media\/a\.jpg"/);
});

test('picture and gallery blocks built by the picker survive the editor and escape their text', async () => {
  const { imageHtml, galleryHtml } = await import('../src/editor/blocks.ts');
  const pic = { url: '/media/abc123abc123-a.webp', alt: 'A "quoted" <b>alt</b>', original_name: 'a.png' };
  const html = imageHtml(pic) + galleryHtml([pic, { ...pic, alt: '' }]);
  assert.doesNotMatch(html, /<b>alt/, 'alt is escaped');
  const out = roundTrip(html);
  assert.equal((out.match(/<figure/g) ?? []).length, 3);
  assert.match(out, /class="shots"/);
  assert.match(out, /<img src="\/media\/abc123abc123-a\.webp" alt="A &quot;quoted&quot; &lt;b&gt;alt&lt;\/b&gt;" ?\/?>/);
});

const { editFigure, readFigure, figuresOf } = await import('../src/editor/picture.ts');
const fig = '<figure class="rt-img"><div class="win"><div class="win-bar"><i></i><i></i><i></i><span>a.jpg</span></div><img src="/media/a.webp" alt="old"></div><figcaption>old cap</figcaption></figure>';
const shots = `<div class="shots">${fig.replace('a.jpg', 'one.jpg')}${fig.replace('a.jpg', 'two.jpg').replace('<figcaption>old cap</figcaption>', '')}</div>`;

test('picture editing: alt and caption change, empty caption removes it, new caption is added', () => {
  const r = readFigure(figuresOf(document.createElement('div').appendChild(Object.assign(document.createElement('div'), { innerHTML: fig })) as unknown as ParentNode)[0]!);
  assert.deepEqual(r, { alt: 'old', caption: 'old cap', hasAlt: true, name: 'a.jpg' });
  assert.match(editFigure(fig, 0, { alt: 'new', caption: 'fresh' }), /alt="new"[^>]*><\/div><figcaption>fresh<\/figcaption>/);
  assert.doesNotMatch(editFigure(fig, 0, { caption: '  ' }), /figcaption/);
  assert.match(editFigure(shots, 1, { caption: 'added' }), /two\.jpg[\s\S]*<figcaption>added<\/figcaption>/);
  assert.equal((editFigure(shots, 1, { caption: 'added' }).match(/old cap/g) ?? []).length, 1, 'only the chosen figure changed');
});

test('picture editing: replace swaps file and label, keeps caption; markup in text stays text; sanitiser still accepts the result', () => {
  const out = editFigure(fig, 0, { replace: { url: '/media/b.webp', alt: 'b alt', original_name: 'b.jpg' } });
  assert.match(out, /src="\/media\/b\.webp"/);
  assert.match(out, /<span>b\.jpg<\/span>/);
  assert.match(out, /alt="b alt"/);
  assert.match(out, /<figcaption>old cap<\/figcaption>/);
  const evil = editFigure(fig, 0, { caption: '<img src=x onerror=alert(1)>', alt: '"><script>x</script>' });
  const probe = document.createElement('div'); probe.innerHTML = evil;
  assert.equal(probe.querySelectorAll('script').length, 0, 'no script element');
  assert.equal(probe.querySelectorAll('img').length, 1, 'caption text did not become an image');
  assert.doesNotMatch(sanitizeStory(evil), /<script/);
  assert.match(sanitizeStory(evil), /<figure class="rt-img">/);
  assert.equal(editFigure(fig, 5, { alt: 'x' }), fig, 'unknown figure leaves html alone');
});

test('video embeds only get a caption, never a description', () => {
  const emb = '<figure class="rt-embed"><div class="win"><div class="win-bar"><i></i><span>yt</span></div><a class="embed" href="https://youtu.be/x"><img src="/m/t.webp" alt=""></a></div><figcaption>tour</figcaption></figure>';
  const host = document.createElement('div'); host.innerHTML = emb;
  assert.equal(readFigure(figuresOf(host)[0]!).hasAlt, false);
  const out = editFigure(emb, 0, { alt: 'nope', caption: 'tour 2' });
  assert.match(out, /alt=""/);
  assert.match(out, /tour 2/);
});
