import type { Media } from '../lib/media.ts';

export type { Media };

export const toast = (m: string) => {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
};

type Reply<T> = { ok: true; data: T } | { ok: false; message: string };

async function send<T>(method: string, url: string, body?: BodyInit, headers: Record<string, string> = {}): Promise<Reply<T>> {
  try {
    const r = await fetch(url, { method, body, headers });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: j as T } : { ok: false, message: j.message || 'Something went wrong. Please try again.' };
  } catch { return { ok: false, message: 'Can’t reach the server. Check your connection.' }; }
}

export const listMedia = (kind?: 'image' | 'file') => send<{ media: Media[] }>('GET', `/api/media${kind ? `?kind=${kind}` : ''}`);
export const setAlt = (id: number, alt: string) => send<{ media: Media }>('PATCH', `/api/media/${id}`, JSON.stringify({ alt }), { 'Content-Type': 'application/json' });
export const removeMedia = (id: number) => send<{ ok: true }>('DELETE', `/api/media/${id}`);
export function uploadFile(file: File, alt = '') {
  const f = new FormData();
  f.append('file', file); f.append('alt', alt);
  return send<{ media: Media }>('POST', '/api/media', f);
}

export const size = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Uploads several files in turn, reporting each failure kindly; returns what made it. */
export async function uploadMany(files: FileList | File[]): Promise<Media[]> {
  const done: Media[] = [];
  for (const f of Array.from(files)) {
    const r = await uploadFile(f);
    if (r.ok) done.push(r.data.media); else toast(`${f.name}: ${r.message}`);
  }
  return done;
}

export interface PickOptions { multiple?: boolean; kind?: 'image' | 'file'; title?: string; selected?: number }

/** Opens the picture picker; resolves with the chosen files (alt text already saved) or null when cancelled. */
export function pickMedia(opts: PickOptions = {}): Promise<Media[] | null> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'welcome picker';
    dlg.setAttribute('aria-label', opts.title ?? 'Choose a picture');
    dlg.innerHTML = `<div class="picker-head"><h2></h2><button type="button" class="btn btn-sm" data-up>Upload new</button><input type="file" hidden></div>
      <p class="err" role="alert"></p>
      <div class="picker-grid" role="listbox" aria-label="Pictures"></div>
      <div class="picker-foot"><label class="field" hidden><span class="flabel">Description <span class="hint">(for screen readers)</span></span><input class="input" maxlength="300"></label>
        <div class="actions"><button type="button" class="btn btn-primary" data-ok disabled>Use this</button><button type="button" class="btn" data-no>Cancel</button></div></div>`;
    (dlg.querySelector('h2') as HTMLElement).textContent = opts.title ?? 'Choose a picture';
    const grid = dlg.querySelector<HTMLElement>('.picker-grid')!, err = dlg.querySelector<HTMLElement>('.err')!;
    const file = dlg.querySelector<HTMLInputElement>('input[type=file]')!, up = dlg.querySelector<HTMLElement>('[data-up]')!;
    const altWrap = dlg.querySelector<HTMLElement>('label.field')!, altIn = altWrap.querySelector('input')!, ok = dlg.querySelector<HTMLButtonElement>('[data-ok]')!;
    file.accept = opts.kind === 'file' ? 'application/pdf' : 'image/*';
    file.multiple = !!opts.multiple;
    let items: Media[] = [], chosen: number[] = opts.selected ? [opts.selected] : [], settled = false;

    const finish = (v: Media[] | null) => { if (settled) return; settled = true; dlg.close(); dlg.remove(); resolve(v); };
    function render() {
      grid.replaceChildren();
      if (!items.length) { const p = document.createElement('p'); p.className = 'muted small'; p.textContent = 'Nothing here yet. Upload a picture to get started.'; grid.append(p); }
      for (const m of items) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pick'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(chosen.includes(m.id)));
        if (m.kind === 'image') { const i = document.createElement('img'); i.src = m.url; i.alt = m.alt; i.loading = 'lazy'; b.append(i); }
        else { const s = document.createElement('span'); s.className = 'pick-file'; s.textContent = 'PDF'; b.append(s); }
        const n = document.createElement('small'); n.textContent = m.original_name; b.append(n);
        b.addEventListener('click', () => {
          chosen = opts.multiple ? (chosen.includes(m.id) ? chosen.filter((x) => x !== m.id) : [...chosen, m.id]) : [m.id];
          render();
        });
        grid.append(b);
      }
      const last = items.find((m) => m.id === chosen[chosen.length - 1]);
      altWrap.hidden = !(last && last.kind === 'image' && chosen.length === 1);
      if (!altWrap.hidden && document.activeElement !== altIn) altIn.value = last!.alt;
      ok.disabled = !chosen.length;
      ok.textContent = opts.multiple && chosen.length > 1 ? `Use ${chosen.length} pictures` : 'Use this';
    }
    async function load() {
      const r = await listMedia(opts.kind);
      if (!r.ok) { err.textContent = r.message; err.classList.add('show'); return; }
      items = r.data.media; render();
    }
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      if (!file.files?.length) return;
      up.setAttribute('disabled', ''); up.textContent = 'Uploading…'; err.classList.remove('show');
      const added = await uploadMany(file.files);
      up.removeAttribute('disabled'); up.textContent = 'Upload new'; file.value = '';
      if (added.length) { items = [...added, ...items.filter((i) => !added.some((a) => a.id === i.id))]; chosen = opts.multiple ? [...chosen, ...added.map((a) => a.id)] : [added[0]!.id]; render(); }
    });
    ok.addEventListener('click', async () => {
      const picked = chosen.map((id) => items.find((m) => m.id === id)!).filter(Boolean);
      if (picked.length === 1 && picked[0]!.kind === 'image' && altIn.value.trim() !== picked[0]!.alt) {
        const r = await setAlt(picked[0]!.id, altIn.value);
        if (r.ok) picked[0] = r.data.media; else toast(r.message);
      }
      finish(picked);
    });
    dlg.querySelector('[data-no]')!.addEventListener('click', () => finish(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    document.body.append(dlg);
    dlg.showModal();
    void load();
  });
}
