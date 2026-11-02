import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { sanitizeStory } from '../src/lib/sanitize.ts';

const win = new Window();
Object.assign(globalThis, { window: win, document: win.document, DOMParser: win.DOMParser, Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement, MutationObserver: win.MutationObserver, requestAnimationFrame: (f: () => void) => setTimeout(f, 0), getComputedStyle: win.getComputedStyle.bind(win) });
const { Editor } = await import('@tiptap/core');
const { storyExtensions, toStoryHtml } = await import('../src/editor/extensions.ts');
const g = await import('../src/editor/gutter.ts');

type Ed = InstanceType<typeof Editor>;
const make = (html: string) => new Editor({ element: document.createElement('div'), extensions: storyExtensions(), content: html });
const out = (e: Ed) => sanitizeStory(toStoryHtml(e.getHTML()));
const tags = (e: Ed) => Array.from({ length: g.blockCount(e) }, (_, i) => e.state.doc.child(i).textContent || e.state.doc.child(i).type.name);
const STORY = '<h2>One</h2><p>two</p><aside class="callout" data-kind="tip"><p>three</p></aside><p>four</p>';

test('move a block down, up, to the ends; no-ops and bad indexes are refused', () => {
  const e = make(STORY);
  assert.deepEqual(tags(e), ['One', 'two', 'three', 'four']);
  assert.ok(g.moveBlock(e, 0, 2)); assert.deepEqual(tags(e), ['two', 'three', 'One', 'four']);
  assert.ok(g.moveBlock(e, 3, 0)); assert.deepEqual(tags(e), ['four', 'two', 'three', 'One', 'paragraph'], 'the editor keeps an empty paragraph after a final heading; it is dropped on save');
  assert.equal(g.moveBlock(e, 1, 1), false);
  assert.equal(g.moveBlock(e, 9, 0), false);
  assert.equal(g.moveBlock(e, 0, -1), false);
  assert.doesNotMatch(out(e), /<p><\/p>/);
  assert.match(out(e), /<aside class="callout" data-kind="tip"><p>three<\/p><\/aside>/, 'block content intact after moves');
  e.destroy();
});

test('duplicate puts a copy right after; delete removes; last block is replaced by an empty paragraph', () => {
  const e = make(STORY);
  g.duplicateBlock(e, 2); assert.deepEqual(tags(e), ['One', 'two', 'three', 'three', 'four']);
  g.deleteBlock(e, 3); assert.deepEqual(tags(e), ['One', 'two', 'three', 'four']);
  for (let i = 0; i < 4; i++) g.deleteBlock(e, 0);
  assert.equal(g.blockCount(e), 1);
  assert.equal(e.state.doc.child(0).type.name, 'paragraph');
  assert.equal(g.deleteBlock(e, 7), false);
  e.destroy();
});

test('add paragraph below puts the cursor in the new block', () => {
  const e = make(STORY);
  g.addParagraphAfter(e, 1);
  assert.equal(g.blockCount(e), 5);
  assert.equal(e.state.doc.child(2).type.name, 'paragraph');
  assert.equal(e.state.doc.child(2).content.size, 0);
  assert.equal(e.state.selection.$from.index(0), 2, 'cursor is in block 2');
  e.destroy();
});

test('turn into: heading, list, quote on a chosen block; callouts are not text blocks', () => {
  const e = make(STORY);
  const run = (i: number, id: string) => { g.selectInside(e, i); g.TURN_INTO.find((t) => t.id === id)!.run(e); };
  run(1, 'h3'); assert.match(out(e), /<h3>two<\/h3>/);
  run(3, 'ul'); assert.match(out(e), /<ul><li><p>four<\/p><\/li><\/ul>/);
  run(0, 'quote'); assert.match(out(e), /<blockquote>/);
  assert.equal(g.isTextBlock(e, 2), false);
  assert.equal(g.isTextBlock(e, 1), true);
  e.destroy();
});
