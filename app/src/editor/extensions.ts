import { Node, mergeAttributes, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlock from '@tiptap/extension-code-block';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';

/** Remove anything executable from HTML we keep verbatim; the server sanitises again on save. */
export function cleanFragment(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const n of [copy, ...Array.from(copy.querySelectorAll('*'))]) {
    if (/^(script|style|iframe|object|embed)$/i.test(n.tagName)) { n.remove(); continue; }
    for (const a of Array.from(n.attributes)) {
      if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*(javascript|data):/i.test(a.value))) n.removeAttribute(a.name);
    }
  }
  return copy.outerHTML;
}

/** Images, videos and galleries are kept as-is until the media library (T6) can edit them. */
const MediaBlock = Node.create({
  name: 'mediaBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ html: { default: '', rendered: false } }),
  parseHTML: () => [
    { tag: 'figure', getAttrs: (el) => ({ html: cleanFragment(el as Element) }) },
    { tag: 'div.shots', getAttrs: (el) => ({ html: cleanFragment(el as Element) }) },
  ],
  renderHTML({ node }) {
    const t = document.createElement('template');
    t.innerHTML = node.attrs.html;
    return (t.content.firstElementChild?.cloneNode(true) ?? document.createElement('div')) as unknown as [string];
  },
});

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes: () => ({
    kind: {
      default: 'note',
      parseHTML: (el) => (['tip', 'warn'].includes(el.getAttribute('data-kind') ?? '') ? el.getAttribute('data-kind') : 'note'),
      renderHTML: (a) => ({ 'data-kind': a.kind }),
    },
  }),
  parseHTML: () => [{ tag: 'aside.callout' }],
  renderHTML: ({ HTMLAttributes }) => ['aside', mergeAttributes({ class: 'callout' }, HTMLAttributes), 0],
});

const Quote = Blockquote.extend({
  addAttributes() {
    return { stat: { default: false, parseHTML: (el) => el.classList.contains('stat'), renderHTML: (a) => (a.stat ? { class: 'stat' } : {}) } };
  },
});

const Code = CodeBlock.extend({
  addAttributes() {
    return { language: { default: null, parseHTML: (el) => el.getAttribute('data-lang') || null, renderHTML: (a) => (a.language ? { 'data-lang': a.language } : {}) } };
  },
  parseHTML: () => [{ tag: 'pre', preserveWhitespace: 'full' }],
  renderHTML: ({ HTMLAttributes }) => ['pre', mergeAttributes({ class: 'code' }, HTMLAttributes), ['code', 0]],
});

export const storyExtensions = (): Extensions => [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    blockquote: false,
    codeBlock: false,
    underline: false,
    link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: null, target: null } },
  }),
  Quote,
  Code,
  Highlight,
  Callout,
  MediaBlock,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

/** Editor output to the stored story shape: tables live inside div.rt-table, and blank paragraphs are dropped. */
export const toStoryHtml = (html: string): string =>
  html.replace(/<p><\/p>/g, '').replace(/<table\b/g, '<div class="rt-table"><table').replace(/<\/table>/g, '</table></div>');
