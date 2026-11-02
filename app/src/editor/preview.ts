import { dateRange, esc } from '../lib/text.ts';

export interface PreviewState {
  slug: string; title: string; summary: string; story: string; cover: string; coverAlt: string;
  kind: string; role: string; stack: string; tags: string[]; started: string; finished: string;
}

/** A standalone page that mirrors ProjectView.astro, built from unsaved editor state for the preview frame. */
export function buildPreview(s: PreviewState): string {
  const sheets = Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => `<link rel="stylesheet" href="${esc((l as HTMLLinkElement).href)}">`).join('');
  const theme = document.documentElement.dataset.theme ?? 'light';
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#12805C';
  const front = [
    '<span class="c">---</span>',
    `<span class="k">kind</span>:  ${esc(s.kind)}`,
    `<span class="k">role</span>:  ${esc(s.role)}`,
    `<span class="k">stack</span>: [${esc(s.stack)}]`,
    `<span class="k">dates</span>: ${esc(dateRange(s.started, s.finished))}`,
    `<span class="k">tags</span>:  [${esc(s.tags.join(', '))}]`,
    '<span class="c">---</span>',
  ].join('\n');
  const cover = s.cover
    ? `<div class="win cover"><div class="win-bar"><i></i><i></i><i></i><span>${esc(s.slug)}/cover.jpg</span></div><img src="${esc(s.cover)}" alt="${esc(s.coverAlt)}"></div>`
    : '';
  return `<!doctype html><html lang="en" data-theme="${esc(theme)}" class="js"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${sheets}<base target="_blank"><style>:root{--accent:${esc(accent)}}html{scroll-behavior:auto}.reveal{opacity:1!important;transform:none!important}</style></head>`
    + `<body class="pub"><div class="col"><section class="sec first"><p class="muted small">projects / ${esc(s.slug)} / README.md</p><h1># ${esc(s.title || 'Untitled')}</h1>`
    + (s.summary ? `<p class="headline">${esc(s.summary)}</p>` : '')
    + `<pre class="code front"><code>${front}</code></pre>${cover}<div class="rt">${s.story}</div></section></div></body></html>`;
}
