import { pickMedia } from './media-client.ts';
import { makeSaver } from './form-save.ts';

interface Group { group: string; items: string[] }
interface Job { years: string; role: string; org: string; text: string }
interface Link { label: string; url: string }
interface Sec { key: string; visible: boolean }

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const $$ = <T extends HTMLElement>(s: string) => Array.from(document.querySelectorAll<T>(s));
const d = JSON.parse($('#pf-data').textContent!) as { guest: boolean; photo_id: number | null; cv_id: number | null; skills: Group[]; experience: Job[]; links: Link[]; sections: Sec[] };
const guest = d.guest;
let photoId = d.photo_id, cvId = d.cv_id;
const skills = d.skills, experience = d.experience, links = d.links, sections = d.sections;
const field = (k: string) => $<HTMLInputElement>(`[data-f=${k}]`);
const FIELDS = ['name', 'headline', 'status_line', 'location', 'email', 'about'];

const saver = makeSaver({
  url: '/api/profile', guest,
  payload: () => ({
    ...Object.fromEntries(FIELDS.map((k) => [k, field(k).value])),
    photo_media_id: photoId, cv_media_id: cvId,
    skills: skills.filter((g) => g.group.trim() || g.items.length).map((g) => ({ group: g.group, items: g.items })),
    experience: experience.filter((j) => j.role.trim()),
    links: links.filter((l) => l.label.trim() || l.url.trim()),
    sections,
  }),
});
FIELDS.forEach((k) => field(k).addEventListener('input', saver.changed));

/* ----- small DOM helpers ----- */
function input(label: string, value: string, max: number, on: (v: string) => void, opts: { type?: string; ph?: string } = {}) {
  const w = document.createElement('div'); w.className = 'field';
  const l = document.createElement('label'); l.textContent = label;
  const i = document.createElement('input'); i.className = 'input'; i.value = value; i.maxLength = max; i.type = opts.type ?? 'text';
  if (opts.ph) i.placeholder = opts.ph;
  const id = `f${Math.random().toString(36).slice(2, 8)}`; i.id = id; l.htmlFor = id;
  i.addEventListener('input', () => { on(i.value); saver.changed(); });
  w.append(l, i);
  return w;
}
function rowButtons<T>(arr: T[], i: number, redraw: () => void) {
  const box = document.createElement('div'); box.className = 'row-actions';
  const mk = (txt: string, label: string, run: () => void, disabled = false) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm btn-ghost'; b.textContent = txt; b.setAttribute('aria-label', label); b.disabled = disabled;
    b.addEventListener('click', () => { run(); redraw(); saver.changed(); });
    return b;
  };
  box.append(
    mk('↑', 'Move up', () => { [arr[i - 1], arr[i]] = [arr[i]!, arr[i - 1]!]; }, i === 0),
    mk('↓', 'Move down', () => { [arr[i + 1], arr[i]] = [arr[i]!, arr[i + 1]!]; }, i === arr.length - 1),
    mk('Remove', 'Remove', () => { arr.splice(i, 1); }),
  );
  return box;
}
function drawList<T>(name: string, arr: T[], row: (x: T, i: number) => HTMLElement[]) {
  const host = $(`[data-list=${name}]`);
  const draw = () => {
    host.replaceChildren();
    if (!arr.length) { const p = document.createElement('p'); p.className = 'muted small'; p.textContent = 'Nothing here yet.'; host.append(p); }
    arr.forEach((x, i) => { const r = document.createElement('div'); r.className = 'list-row'; r.append(...row(x, i), rowButtons(arr, i, draw)); host.append(r); });
  };
  draw();
  return draw;
}

const drawSkills = drawList('skills', skills, (g) => [
  input('Group', g.group, 40, (v) => (g.group = v), { ph: 'e.g. Languages' }),
  input('Items, separated by commas', g.items.join(', '), 600, (v) => (g.items = v.split(',').map((s) => s.trim()).filter(Boolean))),
]);
const drawExp = drawList('experience', experience, (j) => [
  input('Years', j.years, 30, (v) => (j.years = v), { ph: '2024–now' }),
  input('Role', j.role, 80, (v) => (j.role = v)),
  input('Where', j.org, 80, (v) => (j.org = v)),
  input('What you did', j.text, 400, (v) => (j.text = v)),
]);
const drawLinks = drawList('links', links, (l) => [
  input('Label', l.label, 40, (v) => (l.label = v), { ph: 'GitHub' }),
  input('Address', l.url, 300, (v) => (l.url = v), { type: 'url', ph: 'https://…' }),
]);
const add: Record<string, () => void> = {
  skills: () => { skills.push({ group: '', items: [] }); drawSkills(); },
  experience: () => { experience.push({ years: '', role: '', org: '', text: '' }); drawExp(); },
  links: () => { links.push({ label: '', url: '' }); drawLinks(); },
};
$$('[data-add]').forEach((b) => b.addEventListener('click', () => { add[b.dataset.add!]!(); saver.changed(); }));

/* ----- sections: order + visibility ----- */
const labels = JSON.parse($('[data-list=sections]').dataset.labels!) as Record<string, string>;
const secHost = $('[data-list=sections]');
function drawSections() {
  secHost.replaceChildren();
  sections.forEach((s, i) => {
    const li = document.createElement('li'); li.className = 'list-row sec-row';
    const lab = document.createElement('label'); lab.className = 'switch';
    const t = document.createElement('span'); t.textContent = labels[s.key] ?? s.key;
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = s.visible;
    cb.setAttribute('aria-label', `Show ${labels[s.key] ?? s.key}`);
    cb.addEventListener('change', () => { s.visible = cb.checked; saver.changed(); });
    lab.append(t, cb);
    li.append(lab, rowButtons(sections, i, drawSections));
    li.querySelector('.row-actions button:last-child')?.remove(); // sections can be hidden but not removed
    secHost.append(li);
  });
}
drawSections();

/* ----- photo + CV ----- */
const photo = $<HTMLImageElement>('[data-photo]'), noPhoto = $('[data-no-photo]'), clearPhoto = $('[data-clear=photo]');
function showPhoto(id: number | null, url = '', alt = '') {
  photoId = id; photo.hidden = !url; noPhoto.hidden = !!url; clearPhoto.hidden = !url;
  if (url) { photo.src = url; photo.alt = alt; }
  saver.changed();
}
$('[data-pick=photo]').addEventListener('click', async () => {
  if (guest) return;
  const got = await pickMedia({ kind: 'image', title: 'Choose your photo', selected: photoId ?? undefined });
  if (got?.[0]) showPhoto(got[0].id, got[0].url, got[0].alt);
});
clearPhoto.addEventListener('click', () => { if (!guest) showPhoto(null); });

const cvName = $('[data-cv-name]'), clearCv = $('[data-clear=cv]');
function showCv(id: number | null, name = 'No CV yet.') { cvId = id; cvName.textContent = name; clearCv.hidden = !id; saver.changed(); }
$('[data-pick=cv]').addEventListener('click', async () => {
  if (guest) return;
  const got = await pickMedia({ kind: 'file', title: 'Choose your CV (PDF)', selected: cvId ?? undefined });
  if (got?.[0]) showCv(got[0].id, got[0].filename);
});
clearCv.addEventListener('click', () => { if (!guest) showCv(null); });

saver.baseline();
