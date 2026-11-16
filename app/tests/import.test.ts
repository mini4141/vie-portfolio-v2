import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// the lib talks to one shared database; point it at a throw-away one before anything loads it
const dir = mkdtempSync(join(tmpdir(), 'vie-import-'));
process.env.DB_PATH = join(dir, 'app.db');
process.env.UPLOAD_DIR = join(dir, 'uploads');
const { db } = await import('../src/lib/db.ts');
const { inline, blocksToHtml, collectImages, StoryError } = await import('../src/lib/story.ts');
const { importAll, importProject, projectsOf, ImportError } = await import('../src/lib/import.ts');

const assets = new URL('../seed-assets/', import.meta.url);
const asset = (n: string) => new URL(n, assets);
const row = (slug: string) => db().prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as Record<string, any> | undefined;
const count = (t: string) => (db().prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
const files = () => { try { return readdirSync(process.env.UPLOAD_DIR!).length; } catch { return 0; } };

// a folder like the one you would upload: project.json next to images/
const work = join(dir, 'import');
before(() => {
  mkdirSync(join(work, 'images'), { recursive: true });
  copyFileSync(asset('p-pocketwise.jpg'), join(work, 'images', 'cover.jpg'));
  copyFileSync(asset('g4.jpg'), join(work, 'images', 'sketch.jpg'));
  copyFileSync(asset('g1.jpg'), join(work, 'images', 'screen-1.jpg'));
  copyFileSync(asset('g2.jpg'), join(work, 'images', 'screen-2.jpg'));
});
const example = () => JSON.parse(readFileSync(new URL('../../docs/examples/project.example.json', import.meta.url), 'utf8'));

test('inline text: plain text is escaped, a few Markdown marks work, unsafe links lose their link', () => {
  assert.equal(inline('a < b & "c"'), 'a &lt; b &amp; &quot;c&quot;');
  assert.equal(inline('**bold** *it* ~~old~~ ==hot== `x < y`'), '<strong>bold</strong> <em>it</em> <s>old</s> <mark>hot</mark> <code>x &lt; y</code>');
  assert.equal(inline('[a](https://x.dev/?a=1&b=2)'), '<a href="https://x.dev/?a=1&amp;b=2">a</a>');
  assert.equal(inline('[bad](javascript:evil)'), 'bad');
  assert.equal(inline('[bad](data:text/html,x)'), 'bad');
  assert.equal(inline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(inline('2 * 3 * 4'), '2 * 3 * 4', 'spaced asterisks stay as they are');
});

test('blocks become the markup the editor makes', () => {
  const imgs = new Map([['a.jpg', { url: '/media/abc-a.webp', name: 'a.jpg' }]]);
  const r = blocksToHtml([
    { h2: 'T' }, { p: 'x' }, { ul: ['a', 'b'] }, { ol: ['1'] }, { quote: 'q' }, { stat: '40%', text: 'more' },
    { callout: 'c', kind: 'tip' }, { code: 'a < b', lang: 'ts' }, { image: 'a.jpg', alt: 'alt', caption: 'cap', narrow: true },
    { gallery: ['a.jpg', { image: 'a.jpg', alt: 'g' }] }, { table: { head: ['H'], rows: [['v']] } }, { rule: true },
  ], imgs);
  for (const part of [
    '<h2>T</h2>', '<ul><li>a</li><li>b</li></ul>', '<blockquote>q</blockquote>', '<blockquote class="stat"><strong>40%</strong> more</blockquote>',
    '<aside class="callout" data-kind="tip"><p>c</p></aside>', '<pre class="code" data-lang="ts"><code>a &lt; b\n</code></pre>',
    '<figure class="rt-img is-narrow"><div class="win"><div class="win-bar"><i></i><i></i><i></i><span>a.jpg</span></div><img src="/media/abc-a.webp" alt="alt"></div><figcaption>cap</figcaption></figure>',
    '<div class="shots"><figure>', '<div class="rt-table"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table></div>', '<hr>',
  ]) assert.ok(r.html.includes(part), part);
  assert.equal(r.warnings.length, 1, 'the gallery picture without text is flagged');
  assert.deepEqual(collectImages([{ image: 'a.jpg' }, { gallery: ['b.jpg', { image: 'c.jpg' }] }, { p: 'x' }]).map((i) => i.ref), ['a.jpg', 'b.jpg', 'c.jpg']);
});

test('bad blocks say where and why', () => {
  const imgs = new Map();
  const msg = (b: unknown) => { try { blocksToHtml(b, imgs); } catch (e) { assert.ok(e instanceof StoryError); return (e as Error).message; } return ''; };
  assert.match(msg([{ p: 'ok' }, { h4: 'x' }]), /story\[1\].*exactly one of/);
  assert.match(msg([{ p: 'x', h2: 'y' }]), /story\[0\].*exactly one/);
  assert.match(msg([{ p: 'x', alt: 'y' }]), /"alt" is not an option of "p"/);
  assert.match(msg([{ p: '' }]), /story\[0\].p needs text/);
  assert.match(msg([{ callout: 'x', kind: 'loud' }]), /note, tip or warn/);
  assert.match(msg([{ image: 'nope.jpg' }]), /picture "nope.jpg" was not found/);
  assert.match(msg([{ table: { head: ['a', 'b'], rows: [['1']] } }]), /rows\[0\] needs exactly 2 cells/);
  assert.match(msg([{ code: 'x', lang: 'no spaces!' }]), /lang/);
  assert.match(msg('nope'), /list of up to 500 blocks/);
});

test('the example file imports: a published project, one copy of each picture, scripts and unsafe markup stripped', async () => {
  const media0 = count('media');
  const [r] = await importAll(example(), { baseDir: work });
  assert.deepEqual([r!.action, r!.slug, r!.status], ['created', 'pocketwise', 'published']);
  const p = row('pocketwise')!;
  assert.equal(p.title, 'Pocketwise');
  assert.deepEqual(JSON.parse(p.tags), ['Mobile app', 'Open source']);
  assert.equal(p.featured, 1);
  assert.ok(p.cover_media_id && p.published_at);
  assert.equal(count('media') - media0, 4, 'cover, sketch and two gallery pictures');
  for (const part of ['<h2>The problem</h2>', 'class="stat"', 'data-kind="tip"', 'data-lang="ts"', 'class="shots"', 'class="rt-table"', '/media/']) assert.ok(p.story_html.includes(part), part);
  assert.ok(p.story_html.includes('rel="noopener noreferrer"'), 'links pass through the normal sanitiser');
});

test('running it again updates the same project and stores nothing twice', async () => {
  const before = { projects: count('projects'), media: count('media'), files: files() };
  const input = example();
  input.summary = 'A new summary.';
  const [r] = await importAll(input, { baseDir: work });
  assert.equal(r!.action, 'updated');
  assert.equal(row('pocketwise')!.summary, 'A new summary.');
  assert.deepEqual({ projects: count('projects'), media: count('media'), files: files() }, before);
});

test('a partial file only changes what it names, and can unpublish', async () => {
  const [r] = await importAll({ slug: 'pocketwise', status: 'draft' }, { baseDir: work });
  assert.deepEqual([r!.action, r!.status], ['updated', 'draft']);
  assert.equal(row('pocketwise')!.summary, 'A new summary.');
  assert.ok(row('pocketwise')!.story_html.includes('The problem'), 'the story was not touched');
});

test('new projects start as drafts and need a title', async () => {
  const [r] = await importAll({ title: 'Quiet Draft', story: [{ p: 'hello' }] }, { baseDir: work });
  assert.deepEqual([r!.action, r!.slug, r!.status], ['created', 'quiet-draft', 'draft']);
  await assert.rejects(importAll({ slug: 'does-not-exist-yet', summary: 'x' }, { baseDir: work }), /title.*required/);
  assert.equal(row('does-not-exist-yet'), undefined);
});

test('a typo in a field name is refused with a suggestion; so is giving the story twice', () => {
  assert.throws(() => projectsOf({ title: 'X', smmary: 'y' }), /unknown field "smmary" \(did you mean "summary"\?\)/);
  assert.throws(() => projectsOf({ title: 'X', story: [], story_html: '<p>x</p>' }), /either "story"/);
  assert.throws(() => projectsOf([]), /1 to 50/);
  assert.equal(projectsOf({ projects: [{ title: 'A' }, { title: 'B' }] }).length, 2);
});

test('problems stop the import before anything is written, with the project named', async () => {
  const n = count('projects');
  await assert.rejects(importAll({ title: 'Broken', story: [{ image: 'images/missing.jpg' }] }, { baseDir: work }), /"broken": Picture "images\/missing.jpg" not found/);
  await assert.rejects(importAll({ title: 'Bad Date', started: 'March' }, { baseDir: work }), /"bad-date": Dates must be a month/);
  assert.equal(row('bad-date'), undefined, 'a project that fails validation is not left behind');
  assert.equal(count('projects'), n);
  writeFileSync(join(work, 'notes.txt'), 'not a picture, just some text here');
  await assert.rejects(importAll({ title: 'Text Pic', cover: 'notes.txt' }, { baseDir: work }), /"text-pic".*picture/i);
});

test('dry run reads and converts everything but writes nothing', async () => {
  const before = { projects: count('projects'), media: count('media'), files: files() };
  const input = example(); input.slug = 'dry-run-only'; input.title = 'Dry Run Only';
  const [r] = await importAll(input, { baseDir: work, dryRun: true });
  assert.deepEqual([r!.action, r!.slug], ['checked', 'dry-run-only']);
  assert.deepEqual({ projects: count('projects'), media: count('media'), files: files() }, before);
  await assert.rejects(importAll({ title: 'X', cover: 'images/nope.jpg' }, { baseDir: work, dryRun: true }), /not found/);
});

test('a picture can also be named by its stored file name', async () => {
  const stored = (db().prepare('SELECT filename FROM media LIMIT 1').get() as { filename: string }).filename;
  const r = await importProject({ title: 'Reuse', story: [{ image: stored, alt: 'again' }] }, { baseDir: work });
  assert.equal(r.pictures, 1);
  assert.ok(row('reuse')!.story_html.includes(`/media/${stored}`));
});
