import { db, tx } from './db.ts';
import { safeUrl } from './text.ts';
import { getProfile, getSettings, type Profile, type Settings } from './queries.ts';
import type { Result } from './projects.ts';

const fail = (message: string): Result<never> => ({ ok: false, status: 400, error: 'invalid', message });
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v.trim() : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const SECTION_KEYS = ['about', 'featured', 'skills', 'experience', 'contact'] as const;
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** A picture or PDF reference must exist and be the right kind, or be null to clear it. */
function mediaRef(v: unknown, kind: 'image' | 'pdf', what: string): { id: number | null } | string {
  if (v === null) return { id: null };
  if (typeof v !== 'number') return `${what} must be one of your uploaded files.`;
  const row = db().prepare('SELECT mime FROM media WHERE id = ?').get(v) as { mime: string } | undefined;
  if (!row) return `That ${what.toLowerCase()} doesn’t exist.`;
  if (kind === 'image' ? !row.mime.startsWith('image/') : row.mime !== 'application/pdf') return kind === 'image' ? `${what} must be a picture.` : `${what} must be a PDF.`;
  return { id: v };
}

function list<T>(v: unknown, max: number, one: (x: unknown) => T | string, what: string): T[] | string {
  if (!Array.isArray(v) || v.length > max) return `${what}: up to ${max} entries.`;
  const out: T[] = [];
  for (const x of v) {
    const r = one(x);
    if (typeof r === 'string') return r;
    out.push(r);
  }
  return out;
}

/** Applies a partial update to the single profile row; unknown keys are ignored. */
export function updateProfile(patch: Record<string, unknown>): Result<Profile> {
  const set: Record<string, string | number | null> = {};
  for (const [k, max] of [['name', 80], ['headline', 200], ['status_line', 120], ['about', 3000], ['location', 80]] as const) {
    if (!(k in patch)) continue;
    const v = text(patch[k], max);
    if (v === null) return fail(`${k.replace('_', ' ')} must be text up to ${max} characters.`);
    if (k === 'name' && !v) return fail('Your name can’t be empty.');
    set[k] = k === 'about' && typeof patch[k] === 'string' ? (patch[k] as string).replace(/\r\n/g, '\n').trim() : v;
  }
  if ('email' in patch) {
    const v = text(patch.email, 120);
    if (v === null || (v && !EMAIL.test(v))) return fail('That email address doesn’t look right.');
    set.email = v;
  }
  for (const [k, kind, what] of [['photo_media_id', 'image', 'Photo'], ['cv_media_id', 'pdf', 'CV']] as const) {
    if (!(k in patch)) continue;
    const r = mediaRef(patch[k], kind, what);
    if (typeof r === 'string') return fail(r);
    set[k] = r.id;
  }
  if ('skills' in patch) {
    const r = list(patch.skills, 8, (g) => {
      if (!isObj(g)) return 'Each skill group needs a name and items.';
      const group = text(g.group, 40), items = Array.isArray(g.items) ? g.items : null;
      if (!group || !items || items.length > 20 || items.some((i) => text(i, 40) === null || !String(i).trim())) return 'Skill groups: a name up to 40 characters and up to 20 items.';
      return { group, items: items.map((i) => String(i).trim()) };
    }, 'Skills');
    if (typeof r === 'string') return fail(r);
    set.skills = JSON.stringify(r);
  }
  if ('experience' in patch) {
    const r = list(patch.experience, 12, (j) => {
      if (!isObj(j)) return 'Each experience entry needs a role.';
      const e = { years: text(j.years, 30), role: text(j.role, 80), org: text(j.org, 80), text: text(j.text, 400) };
      if (e.years === null || !e.role || e.org === null || e.text === null) return 'Experience: a role is required; years, place and notes have length limits.';
      return e as { years: string; role: string; org: string; text: string };
    }, 'Experience');
    if (typeof r === 'string') return fail(r);
    set.experience = JSON.stringify(r);
  }
  if ('links' in patch) {
    const r = list(patch.links, 8, (l) => {
      if (!isObj(l)) return 'Each link needs a label and address.';
      const label = text(l.label, 40), url = text(l.url, 300);
      if (!label || !url || !/^https?:\/\//i.test(url) || !safeUrl(url)) return 'Links need a label and an address starting with http:// or https://.';
      return { label, url: safeUrl(url) };
    }, 'Links');
    if (typeof r === 'string') return fail(r);
    set.links = JSON.stringify(r);
  }
  if ('sections' in patch) {
    const r = list(patch.sections, SECTION_KEYS.length, (s) => (isObj(s) && SECTION_KEYS.includes(s.key as never) && typeof s.visible === 'boolean' ? { key: s.key as string, visible: s.visible } : 'Each section needs a name and a visible switch.'), 'Sections');
    if (typeof r === 'string') return fail(r);
    if (new Set(r.map((s) => s.key)).size !== SECTION_KEYS.length) return fail('List every section exactly once.');
    set.sections = JSON.stringify(r);
  }
  const cols = Object.keys(set);
  if (cols.length) db().prepare(`UPDATE profile SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = 1`).run(...cols.map((c) => set[c]!));
  return { ok: true, value: getProfile() };
}

export function updateSettings(patch: Record<string, unknown>): Result<Settings> {
  const set: Record<string, string | number | null> = {};
  for (const [k, max] of [['site_title', 80], ['description', 300]] as const) {
    if (!(k in patch)) continue;
    const v = text(patch[k], max);
    if (v === null) return fail(`${k.replace('_', ' ')} must be text up to ${max} characters.`);
    if (k === 'site_title' && !v) return fail('The site needs a title.');
    set[k] = v;
  }
  if ('share_media_id' in patch) {
    const r = mediaRef(patch.share_media_id, 'image', 'Share picture');
    if (typeof r === 'string') return fail(r);
    set.share_media_id = r.id;
  }
  if ('accent' in patch) {
    if (typeof patch.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(patch.accent)) return fail('Pick a colour like #12805C.');
    set.accent = patch.accent.toUpperCase();
  }
  if ('default_theme' in patch) {
    if (!['system', 'light', 'dark'].includes(patch.default_theme as string)) return fail('Theme must be system, light or dark.');
    set.default_theme = patch.default_theme as string;
  }
  if ('guest_enabled' in patch) {
    if (typeof patch.guest_enabled !== 'boolean') return fail('guest_enabled must be true or false.');
    set.guest_enabled = patch.guest_enabled ? 1 : 0;
  }
  const cols = Object.keys(set);
  if (cols.length) tx(db(), () => db().prepare(`UPDATE settings SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = 1`).run(...cols.map((c) => set[c]!)));
  return { ok: true, value: getSettings() };
}
