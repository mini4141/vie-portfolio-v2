import type { Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

/** Top-level blocks of the story, addressed by their index in the document. */
export const blockCount = (e: Editor) => e.state.doc.childCount;

function offsets(doc: Editor['state']['doc'], index: number): { from: number; to: number } | null {
  if (index < 0 || index >= doc.childCount) return null;
  let from = 0;
  for (let i = 0; i < index; i++) from += doc.child(i).nodeSize;
  return { from, to: from + doc.child(index).nodeSize };
}
export const blockPos = (e: Editor, index: number) => offsets(e.state.doc, index);

/** Index of the block under a page y coordinate (the nearest one when between two). */
export function blockIndexAtY(e: Editor, y: number): number {
  const kids = Array.from(e.view.dom.children);
  for (let i = 0; i < kids.length; i++) if (y < kids[i]!.getBoundingClientRect().bottom + 8) return i;
  return kids.length - 1;
}

/** Moves a block so it ends up at index `to` of the final order. */
export function moveBlock(e: Editor, from: number, to: number): boolean {
  const n = blockCount(e);
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return false;
  const doc = e.state.doc;
  const order = Array.from({ length: n }, (_, i) => i);
  order.splice(to, 0, order.splice(from, 1)[0]!);
  const tr = e.state.tr.replaceWith(0, doc.content.size, Fragment.fromArray(order.map((i) => doc.child(i))));
  const at = offsets(tr.doc, to)!;
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at.from + 1, tr.doc.content.size)), 1));
  e.view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlock(e: Editor, index: number): boolean {
  const p = blockPos(e, index);
  if (!p) return false;
  e.view.dispatch(e.state.tr.insert(p.to, e.state.doc.child(index)));
  return true;
}

/** Deletes a block; the story never ends up with no blocks at all. */
export function deleteBlock(e: Editor, index: number): boolean {
  const p = blockPos(e, index);
  if (!p) return false;
  const tr = e.state.tr.delete(p.from, p.to);
  if (!tr.doc.childCount) tr.insert(0, e.schema.nodes.paragraph!.create());
  e.view.dispatch(tr);
  return true;
}

/** Adds an empty paragraph under a block and puts the cursor in it. */
export function addParagraphAfter(e: Editor, index: number): boolean {
  const p = blockPos(e, index);
  if (!p) return false;
  const tr = e.state.tr.insert(p.to, e.schema.nodes.paragraph!.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(p.to + 1)));
  e.view.dispatch(tr);
  return true;
}

export const TURN_INTO: { id: string; label: string; run: (e: Editor) => void }[] = [
  { id: 'p', label: 'Paragraph', run: (e) => void e.chain().focus().setParagraph().run() },
  { id: 'h2', label: 'Heading', run: (e) => void e.chain().focus().setHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Subheading', run: (e) => void e.chain().focus().setHeading({ level: 3 }).run() },
  { id: 'ul', label: 'Bulleted list', run: (e) => void e.chain().focus().toggleBulletList().run() },
  { id: 'ol', label: 'Numbered list', run: (e) => void e.chain().focus().toggleOrderedList().run() },
  { id: 'quote', label: 'Quote', run: (e) => void e.chain().focus().toggleBlockquote().run() },
  { id: 'pre', label: 'Code', run: (e) => void e.chain().focus().toggleCodeBlock().run() },
];

const TEXTY = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock']);
export const isTextBlock = (e: Editor, index: number) => TEXTY.has(e.state.doc.child(index).type.name);

/** Cursor inside a block so the usual "turn into" commands apply to it. */
export function selectInside(e: Editor, index: number): void {
  const p = blockPos(e, index);
  if (p) e.commands.setTextSelection(Math.min(p.from + 1, e.state.doc.content.size));
}
