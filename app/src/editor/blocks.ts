import type { ChainedCommands, Editor } from '@tiptap/core';
import { esc } from '../lib/text.ts';

interface Pic { url: string; alt: string; original_name: string }

const figure = (m: Pic, cls: string) =>
  `<figure${cls ? ` class="${cls}"` : ''}><div class="win"><div class="win-bar"><i></i><i></i><i></i><span>${esc(m.original_name)}</span></div><img src="${esc(m.url)}" alt="${esc(m.alt)}"></div>${m.alt ? `<figcaption>${esc(m.alt)}</figcaption>` : ''}</figure>`;
/** Story HTML for one picture or a gallery; same shape the seed and the public page use. */
export const imageHtml = (m: Pic) => figure(m, 'rt-img');
export const galleryHtml = (ms: Pic[]) => `<div class="shots">${ms.map((m) => figure(m, '')).join('')}</div>`;

export interface InsertItem {
  group: string;
  label: string;
  hint: string;
  glyph: string;
  keys: string;
  run: (c: ChainedCommands, e: Editor) => ChainedCommands;
  /** needs the picture picker first, handled by the editor page */
  pick?: 'image' | 'gallery';
}

const item = (group: string, label: string, hint: string, glyph: string, keys: string, run: InsertItem['run']): InsertItem => ({ group, label, hint, glyph, keys, run });

export const INSERTS: InsertItem[] = [
  item('Text', 'Heading', 'A big section title', 'H2', 'heading h2 title', (c) => c.setHeading({ level: 2 })),
  item('Text', 'Subheading', 'A smaller title inside a section', 'H3', 'subheading h3', (c) => c.setHeading({ level: 3 })),
  item('Text', 'Bulleted list', 'A simple list', '-', 'bullet list ul', (c) => c.toggleBulletList()),
  item('Text', 'Numbered list', 'Steps in order', '1.', 'numbered list ol', (c) => c.toggleOrderedList()),
  item('Text', 'Quote', 'Something someone said', '“', 'quote blockquote', (c) => c.toggleBlockquote()),
  item('Highlights', 'Big number', 'One number to remember, with a line of context', '40%', 'big number stat', (c) =>
    c.insertContent({ type: 'blockquote', attrs: { stat: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '40%', marks: [{ type: 'bold' }] }, { type: 'text', text: ' faster than before' }] }] })),
  item('Highlights', 'Callout: note', 'A boxed aside', 'i', 'callout note', (c) => c.insertContent({ type: 'callout', attrs: { kind: 'note' }, content: [{ type: 'paragraph' }] })),
  item('Highlights', 'Callout: tip', 'A helpful pointer', 'tip', 'callout tip', (c) => c.insertContent({ type: 'callout', attrs: { kind: 'tip' }, content: [{ type: 'paragraph' }] })),
  item('Highlights', 'Callout: heads up', 'A warning or caveat', '!', 'callout warning heads up warn', (c) => c.insertContent({ type: 'callout', attrs: { kind: 'warn' }, content: [{ type: 'paragraph' }] })),
  { ...item('Media', 'Picture', 'One picture from your library', 'img', 'picture image photo screenshot', (c) => c), pick: 'image' },
  { ...item('Media', 'Gallery', 'Several pictures side by side', '▤', 'gallery pictures photos screenshots', (c) => c), pick: 'gallery' },
  item('Build', 'Code', 'A block of code', '</>', 'code snippet pre', (c) => c.setCodeBlock()),
  item('Build', 'Table', 'Rows and columns', '▦', 'table grid', (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
  item('Build', 'Divider', 'A line between sections', '—', 'divider line hr', (c) => c.setHorizontalRule()),
];

export function filterInserts(q: string): InsertItem[] {
  const s = q.trim().toLowerCase();
  return s ? INSERTS.filter((i) => `${i.label} ${i.keys}`.toLowerCase().includes(s)) : INSERTS;
}
