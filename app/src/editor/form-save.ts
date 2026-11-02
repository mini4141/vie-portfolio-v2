import { toast } from './media-client.ts';

interface Options { url: string; guest: boolean; payload: () => Record<string, unknown>; after?: (body: any) => void }

/** Debounced autosave plus a Save button for the profile and settings screens. Guests may type but nothing is sent. */
export function makeSaver({ url, guest, payload, after }: Options) {
  const status = document.querySelector<HTMLElement>('[data-autosave]')!;
  const text = status.querySelector<HTMLElement>('[data-autosave-text]')!;
  let timer: ReturnType<typeof setTimeout> | undefined, last = '', saving = false, dirty = false, told = false;
  const say = (t: string, typing = false) => { text.textContent = t; status.classList.toggle('typing', typing); };

  async function save(): Promise<boolean> {
    if (guest) { toast('Saving is turned off in guest mode.'); return false; }
    clearTimeout(timer);
    if (saving) { timer = setTimeout(save, 400); return false; }
    const body = JSON.stringify(payload());
    if (body === last) { dirty = false; say('All changes saved'); return true; }
    saving = true; say('Saving…', true);
    try {
      const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { say(j.message || 'Couldn’t save.', true); toast(j.message || 'Couldn’t save your changes.'); return false; }
      last = body; dirty = false;
      say(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
      after?.(j);
      return true;
    } catch { say('Offline — will retry', true); timer = setTimeout(save, 5000); return false; }
    finally { saving = false; }
  }

  function changed() {
    dirty = true;
    if (guest) { say('Not saved — guest mode', true); if (!told) { told = true; toast('Type away — nothing you change here will be saved.'); } return; }
    say('Unsaved changes…', true);
    clearTimeout(timer); timer = setTimeout(save, 1500);
  }

  document.querySelector('[data-save]')?.addEventListener('click', () => { void save(); });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } });
  window.addEventListener('beforeunload', (e) => { if (dirty && !guest) { e.preventDefault(); } });
  return { changed, baseline: () => { last = JSON.stringify(payload()); dirty = false; }, save };
}
