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
