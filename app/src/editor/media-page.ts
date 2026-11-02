import { removeMedia, setAlt, toast, uploadMany } from './media-client.ts';

const $ = <T extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
const guest = $('main')?.dataset.role !== 'owner';
const grid = $('[data-grid]')!, empty = $('[data-empty]')!, count = $('[data-count]')!;
let kind = 'all';

function apply() {
  let n = 0;
  for (const c of $$('.media-card', grid)) { const show = kind === 'all' || c.dataset.kind === kind; c.hidden = !show; if (show) n++; }
  empty.style.display = n ? 'none' : 'block';
  count.textContent = `${n} ${n === 1 ? 'item' : 'items'}`;
}
$$('[data-kind]').filter((b) => b.tagName === 'BUTTON').forEach((b) => b.addEventListener('click', () => {
  kind = b.dataset.kind!;
  $$('[data-kind]').filter((o) => o.tagName === 'BUTTON').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  apply();
}));
apply();

/* upload: button, file picker or drag and drop */
const fileIn = $<HTMLInputElement>('[data-file]')!, drop = $('[data-drop]')!;
async function upload(files: FileList | File[]) {
  if (guest) { toast('Saving is turned off in guest mode.'); return; }
  const done = await uploadMany(files);
  if (done.length) { toast(done.length === 1 ? 'Uploaded.' : `${done.length} files uploaded.`); location.reload(); }
}
$('[data-upload]')?.addEventListener('click', () => { if (!guest) fileIn.click(); else toast('Saving is turned off in guest mode.'); });
fileIn.addEventListener('change', () => { if (fileIn.files?.length) void upload(fileIn.files); });
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); if ((e as DragEvent).dataTransfer?.files.length) void upload((e as DragEvent).dataTransfer!.files); });

/* per-card actions */
const dlg = $<HTMLDialogElement>('#del-dlg')!;
let delCard: HTMLElement | null = null;
grid.addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-copy],[data-del]');
  const card = b?.closest<HTMLElement>('.media-card');
  if (!b || !card) return;
  if (b.hasAttribute('data-copy')) {
    try { await navigator.clipboard.writeText(location.origin + card.dataset.url); toast('Link copied.'); } catch { toast(location.origin + card.dataset.url); }
  } else if (!guest) {
    delCard = card;
    $('#del-msg')!.textContent = `“${card.dataset.name}” will be removed for good. This can’t be undone.`;
    dlg.showModal();
  } else toast('Saving is turned off in guest mode.');
});
$('#del-yes')!.addEventListener('click', async () => {
  dlg.close();
  if (!delCard) return;
  const r = await removeMedia(Number(delCard.dataset.id));
  if (!r.ok) { toast(r.message); return; }
  delCard.remove(); delCard = null; apply(); toast('Deleted.');
});
grid.addEventListener('change', async (e) => {
  const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-alt]');
  const card = input?.closest<HTMLElement>('.media-card');
  if (!input || !card) return;
  if (guest) { toast('Saving is turned off in guest mode.'); return; }
  const r = await setAlt(Number(card.dataset.id), input.value);
  if (!r.ok) { toast(r.message); return; }
  card.querySelector('img')?.setAttribute('alt', r.data.media.alt);
  toast('Description saved.');
});
