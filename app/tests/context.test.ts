import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { sanitizeStory } from '../src/lib/sanitize.ts';

const win = new Window();
Object.assign(globalThis, { window: win, document: win.document, DOMParser: win.DOMParser, Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement, MutationObserver: win.MutationObserver, requestAnimationFrame: (f: () => void) => setTimeout(f, 0), getComputedStyle: win.getComputedStyle.bind(win) });
const { Editor } = await import('@tiptap/core');
const { storyExtensions, toStoryHtml } = await import('../src/editor/extensions.ts');
const { contextFor } = await import('../src/editor/context.ts');

const make = (html: string) => new Editor({ element: document.createElement('div'), extensions: storyExtensions(), content: html });
const out = (e: InstanceType<typeof Editor>) => sanitizeStory(toStoryHtml(e.getHTML()));
const action = (e: InstanceType<typeof Editor>, id: string) => contextFor(e)!.actions.find((a) => a.id === id)!;
const inside = (e: InstanceType<typeof Editor>, text: string) => {
  let at = -1; e.state.doc.descendants((n, pos) => { if (n.isText && n.text!.includes(text) && at < 0) at = pos + 1; });
  e.commands.setTextSelection(at);
};

test('no bar outside callouts and tables', () => {
  const e = make('<p>plain</p>'); inside(e, 'plain'); assert.equal(contextFor(e), null); e.destroy();
});

test('callout bar shows the current kind and switches it', () => {
  const e = make('<aside class="callout" data-kind="tip"><p>hello</p></aside><p>after</p>');
  inside(e, 'hello');
  const ctx = contextFor(e)!;
  assert.equal(ctx.kind, 'callout');
  assert.deepEqual(ctx.actions.map((a) => [a.id, !!a.pressed]), [['note', false], ['tip', true], ['warn', false]]);
  action(e, 'warn').run();
  assert.match(out(e), /<aside class="callout" data-kind="warn"><p>hello<\/p><\/aside>/);
  assert.equal(contextFor(e)!.actions.find((a) => a.pressed)!.id, 'warn');
  action(e, 'note').run();
  assert.match(out(e), /data-kind="note"/);
  e.destroy();
});

test('table bar adds and removes rows and columns, toggles the header, deletes the table', () => {
  const e = make('<div class="rt-table"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div><p>after</p>');
  inside(e, '1');
  const count = (re: RegExp) => (out(e).match(re) ?? []).length;
  assert.equal(contextFor(e)!.kind, 'table');
  assert.equal(action(e, 'header').pressed, true);
  action(e, 'row-add').run(); assert.equal(count(/<tr>/g), 3);
  action(e, 'col-add').run(); assert.equal(count(/<td>/g), 6, '2 body rows x 3 columns');
  assert.equal(count(/<th>/g), 3);
  action(e, 'row-del').run(); assert.equal(count(/<tr>/g), 2);
  action(e, 'col-del').run(); assert.equal(count(/<th>/g), 2);
  action(e, 'header').run(); assert.equal(count(/<th>/g), 0, 'header row turned into normal cells');
  action(e, 'table-del').run(); assert.doesNotMatch(out(e), /table/);
  assert.match(out(e), /after/);
  e.destroy();
});
