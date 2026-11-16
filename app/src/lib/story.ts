import { esc, safeUrl } from './text.ts';

/**
 * Turns a list of simple typed blocks into the exact HTML the story editor produces, so a project written as JSON
 * opens and edits like one typed by hand. The result still goes through sanitizeStory() when it is saved.
 *
 *   {"h2": "Title"}  {"h3": "…"}  {"p": "text with **bold**, *italic*, `code`, [link](https://x.dev)"}
 *   {"ul": ["a", "b"]}  {"ol": ["a", "b"]}  {"quote": "…"}  {"stat": "40%", "text": "fewer drop-offs"}
 *   {"callout": "…" | ["…", "…"], "kind": "note" | "tip" | "warn"}  {"code": "…", "lang": "ts"}
 *   {"image": "file.jpg", "alt": "…", "caption": "…", "narrow": true}  {"gallery": ["a.jpg", {"image": "b.jpg", "alt": "…"}]}
 *   {"table": {"head": ["A", "B"], "rows": [["1", "2"]]}}  {"rule": true}  {"html": "<p>escape hatch</p>"}
 */
export class StoryError extends Error {}

export interface Img { url: string; name: string }
export interface StoryResult { html: string; warnings: string[] }

type Block = Record<string, unknown>;
const PRIMARY = ['h2', 'h3', 'p', 'ul', 'ol', 'quote', 'stat', 'callout', 'code', 'image', 'gallery', 'table', 'rule', 'html'] as const;
const MODIFIERS: Record<string, readonly string[]> = {
  stat: ['text'], callout: ['kind'], code: ['lang'], image: ['alt', 'caption', 'narrow'],
};
const MAX_STORY = 200_000;

const isObj = (v: unknown): v is Block => !!v && typeof v === 'object' && !Array.isArray(v);

/** Small inline Markdown: `code`, [text](url), **bold**, ~~strike~~, ==mark==, *italic*. Everything else is plain text. */
export function inline(text: string): string {
  const codes: string[] = [];
  let s = text.replace(/`([^`\n]+)`/g, (_, c: string) => `\u0000${codes.push(`<code>${esc(c)}</code>`) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
    const href = safeUrl(url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    return /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${esc(href)}">${label}</a>` : label;
  });
  // like Markdown: the opening mark must touch the text, so "2 * 3 * 4" stays arithmetic
  s = s.replace(/\*\*(?=\S)([^*\n]*?[^*\s])\*\*/g, '<strong>$1</strong>')
    .replace(/~~(?=\S)([^~\n]*?[^~\s])~~/g, '<s>$1</s>')
    .replace(/==(?=\S)([^=\n]*?[^=\s])==/g, '<mark>$1</mark>')
    .replace(/\*(?=\S)([^*\n]*?[^*\s])\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]!);
}

function primary(b: unknown, at: string): [(typeof PRIMARY)[number], Block] {
  if (!isObj(b)) throw new StoryError(`${at}: a block must be an object like {"p": "text"}.`);
  const keys = Object.keys(b);
  const main = PRIMARY.filter((k) => k in b);
  if (main.length !== 1) throw new StoryError(`${at}: use exactly one of ${PRIMARY.join(', ')} (found ${main.length ? main.join(' + ') : keys.join(', ') || 'nothing'}).`);
  const key = main[0]!;
  const extra = keys.filter((k) => k !== key && !(MODIFIERS[key] ?? []).includes(k));
  if (extra.length) throw new StoryError(`${at}: "${extra[0]}" is not an option of "${key}"${MODIFIERS[key] ? ` (options: ${MODIFIERS[key]!.join(', ')})` : ''}.`);
  return [key, b];
}

const text = (v: unknown, at: string, max = 5000): string => {
  if (typeof v !== 'string' || !v.trim()) throw new StoryError(`${at} needs text.`);
  if (v.length > max) throw new StoryError(`${at} is too long (${max} characters at most).`);
  return v;
};
const list = (v: unknown, at: string): string[] => {
  if (!Array.isArray(v) || !v.length || v.length > 100) throw new StoryError(`${at} needs a list of 1 to 100 items.`);
  return v.map((x, i) => text(x, `${at}[${i}]`));
};

function imageRef(v: unknown, at: string): { ref: string; alt: string } {
  if (typeof v === 'string') return { ref: text(v, at, 300), alt: '' };
  if (isObj(v) && typeof v.image === 'string') return { ref: text(v.image, at, 300), alt: typeof v.alt === 'string' ? v.alt : '' };
  throw new StoryError(`${at} must be a file name or {"image": "file.jpg", "alt": "…"}.`);
}

/** Every picture a story refers to, in order, so the caller can store them before the HTML is built. */
export function collectImages(blocks: unknown): { ref: string; alt: string }[] {
  if (!Array.isArray(blocks)) return [];
  const out: { ref: string; alt: string }[] = [];
  blocks.forEach((b, i) => {
    if (!isObj(b)) return;
    if (typeof b.image === 'string') out.push({ ref: b.image, alt: typeof b.alt === 'string' ? b.alt : typeof b.caption === 'string' ? b.caption : '' });
    if (Array.isArray(b.gallery)) b.gallery.forEach((g, j) => { try { out.push(imageRef(g, `story[${i}].gallery[${j}]`)); } catch { /* reported when the HTML is built */ } });
  });
  return out;
}

export function blocksToHtml(blocks: unknown, images: ReadonlyMap<string, Img>): StoryResult {
  if (!Array.isArray(blocks) || blocks.length > 500) throw new StoryError('story must be a list of up to 500 blocks.');
  const warnings: string[] = [];
  const img = (ref: string, at: string): Img => {
    const i = images.get(ref);
    if (!i) throw new StoryError(`${at}: picture "${ref}" was not found.`);
    return i;
  };
  const figure = (ref: string, alt: string, caption: string, cls: string, at: string) => {
    const i = img(ref, at);
    if (!alt && !caption) warnings.push(`${at}: "${ref}" has no alt text (screen readers get nothing).`);
    const a = alt || caption;
    return `<figure${cls ? ` class="${cls}"` : ''}><div class="win"><div class="win-bar"><i></i><i></i><i></i><span>${esc(i.name)}</span></div><img src="${esc(i.url)}" alt="${esc(a)}"></div>${caption ? `<figcaption>${inline(caption)}</figcaption>` : ''}</figure>`;
  };

  const html = blocks.map((raw, n) => {
    const at = `story[${n}]`;
    const [key, b] = primary(raw, at);
    switch (key) {
      case 'h2': case 'h3': return `<${key}>${inline(text(b[key], `${at}.${key}`, 200))}</${key}>`;
      case 'p': return `<p>${inline(text(b.p, `${at}.p`))}</p>`;
      case 'ul': case 'ol': return `<${key}>${list(b[key], `${at}.${key}`).map((x) => `<li>${inline(x)}</li>`).join('')}</${key}>`;
      case 'quote': return `<blockquote>${inline(text(b.quote, `${at}.quote`))}</blockquote>`;
      case 'stat': return `<blockquote class="stat"><strong>${inline(text(b.stat, `${at}.stat`, 40))}</strong> ${inline(text(b.text, `${at}.text`, 300))}</blockquote>`;
      case 'callout': {
        const kind = b.kind ?? 'note';
        if (kind !== 'note' && kind !== 'tip' && kind !== 'warn') throw new StoryError(`${at}.kind must be note, tip or warn.`);
        const paras = typeof b.callout === 'string' ? [text(b.callout, `${at}.callout`)] : list(b.callout, `${at}.callout`);
        return `<aside class="callout" data-kind="${kind}">${paras.map((x) => `<p>${inline(x)}</p>`).join('')}</aside>`;
      }
      case 'code': {
        const lang = b.lang === undefined ? '' : String(b.lang);
        if (!/^[a-z0-9+#.-]{0,20}$/i.test(lang)) throw new StoryError(`${at}.lang must be a short name like ts, sh or python.`);
        return `<pre class="code" data-lang="${esc(lang)}"><code>${esc(text(b.code, `${at}.code`, 20000))}\n</code></pre>`;
      }
      case 'image': return figure(text(b.image, `${at}.image`, 300), typeof b.alt === 'string' ? b.alt.trim() : '', typeof b.caption === 'string' ? b.caption.trim() : '', b.narrow === true ? 'rt-img is-narrow' : 'rt-img', at);
      case 'gallery': {
        const g = b.gallery;
        if (!Array.isArray(g) || !g.length || g.length > 12) throw new StoryError(`${at}.gallery needs 1 to 12 pictures.`);
        return `<div class="shots">${g.map((x, j) => { const r = imageRef(x, `${at}.gallery[${j}]`); return figure(r.ref, r.alt.trim(), '', '', `${at}.gallery[${j}]`); }).join('')}</div>`;
      }
      case 'table': {
        const t = b.table;
        if (!isObj(t) || !Array.isArray(t.head) || !Array.isArray(t.rows) || !t.head.length || t.head.length > 8 || !t.rows.length || t.rows.length > 50) {
          throw new StoryError(`${at}.table needs {"head": [up to 8 titles], "rows": [[…], …up to 50]}.`);
        }
        const cols = t.head.length;
        const cell = (c: unknown, where: string) => inline(typeof c === 'string' || typeof c === 'number' ? String(c) : (() => { throw new StoryError(`${where} must be text.`); })());
        const rows = t.rows.map((r, i) => {
          if (!Array.isArray(r) || r.length !== cols) throw new StoryError(`${at}.table.rows[${i}] needs exactly ${cols} cells.`);
          return `<tr>${r.map((c, j) => `<td>${cell(c, `${at}.table.rows[${i}][${j}]`)}</td>`).join('')}</tr>`;
        }).join('');
        return `<div class="rt-table"><table><thead><tr>${t.head.map((h, j) => `<th>${cell(h, `${at}.table.head[${j}]`)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      case 'rule': return '<hr>';
      case 'html': return text(b.html, `${at}.html`, MAX_STORY);
    }
  }).join('');

  if (html.length > MAX_STORY) throw new StoryError('The story is too long (200,000 characters at most).');
  return { html, warnings };
}
