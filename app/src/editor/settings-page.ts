import { pickMedia } from './media-client.ts';
import { makeSaver } from './form-save.ts';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const $$ = <T extends HTMLElement>(s: string) => Array.from(document.querySelectorAll<T>(s));
const data = JSON.parse($('#st-data').textContent!) as { guest: boolean; share_id: number | null; theme: string };
const field = (k: string) => $<HTMLInputElement>(`[data-f=${k}]`);
let shareId = data.share_id, theme = data.theme;

const saver = makeSaver({
  url: '/api/settings', guest: data.guest,
  payload: () => ({
    site_title: field('site_title').value, description: field('description').value, accent: field('accent').value,
    default_theme: theme, guest_enabled: $<HTMLInputElement>('[data-guest]').checked, share_media_id: shareId,
  }),
});

for (const k of ['site_title', 'description', 'accent']) field(k).addEventListener('input', saver.changed);
$('[data-guest]').addEventListener('change', saver.changed);
$$('[data-swatch]').forEach((b) => b.addEventListener('click', () => { field('accent').value = b.dataset.swatch!; saver.changed(); }));
$$('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => {
  theme = b.dataset.themeOpt!;
  $$('[data-theme-opt]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  saver.changed();
}));

const img = $<HTMLImageElement>('[data-share]'), clear = $('[data-clear=share]');
function showShare(id: number | null, url = '') {
  shareId = id; img.hidden = !url; clear.hidden = !url;
  if (url) img.src = url;
  saver.changed();
}
$('[data-pick=share]').addEventListener('click', async () => {
  if (data.guest) return;
  const got = await pickMedia({ kind: 'image', title: 'Choose the share picture', selected: shareId ?? undefined });
  if (got?.[0]) showShare(got[0].id, got[0].url);
});
clear.addEventListener('click', () => { if (!data.guest) showShare(null); });

saver.baseline();
