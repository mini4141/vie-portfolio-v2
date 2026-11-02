import { cleanFragment } from './extensions.ts';

export interface PicFields { alt: string; caption: string; hasAlt: boolean; name: string }
interface NewPic { url: string; alt: string; original_name: string }

const template = (html: string) => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };

/** Figures inside one picture, video or gallery block (a gallery has several). */
export const figuresOf = (root: ParentNode): Element[] => Array.from(root.querySelectorAll('figure'));

/** What the "Edit picture" dialog shows for one figure. Videos have no description, only a caption. */
export function readFigure(fig: Element): PicFields {
  const img = fig.querySelector('img');
  return {
    alt: img?.getAttribute('alt') ?? '',
    caption: fig.querySelector('figcaption')?.textContent ?? '',
    hasAlt: !fig.classList.contains('rt-embed') && !!img,
    name: fig.querySelector('.win-bar span')?.textContent ?? '',
  };
}

/** Applies edits to the figure at `index` in a block's html and returns the new html. `replace` swaps the picture file. */
export function editFigure(html: string, index: number, edit: { alt?: string; caption?: string; replace?: NewPic }): string {
  const frag = template(html);
  const root = frag.firstElementChild;
  if (!root) return html;
  const fig = figuresOf(frag)[index];
  if (!fig) return html;
  const img = fig.querySelector('img');
  if (edit.replace && img && !fig.classList.contains('rt-embed')) {
    img.setAttribute('src', edit.replace.url);
    const label = fig.querySelector('.win-bar span');
    if (label) label.textContent = edit.replace.original_name;
    if (edit.alt === undefined) img.setAttribute('alt', edit.replace.alt);
  }
  if (edit.alt !== undefined && img && !fig.classList.contains('rt-embed')) img.setAttribute('alt', edit.alt);
  if (edit.caption !== undefined) {
    let cap = fig.querySelector('figcaption');
    const text = edit.caption.trim();
    if (!text) cap?.remove();
    else {
      if (!cap) { cap = document.createElement('figcaption'); fig.appendChild(cap); }
      cap.textContent = text;
    }
  }
  return cleanFragment(root);
}
