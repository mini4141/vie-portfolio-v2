import { db, tx } from './db.ts';
import type { Role } from './auth.ts';
import { sanitizeStory } from './sanitize.ts';
import { safeUrl, slugify, parseJson } from './text.ts';
import type { Project } from './queries.ts';

const SELECT = `SELECT p.*, m.filename AS cover_file, COALESCE(m.alt, '') AS cover_alt FROM projects p LEFT JOIN media m ON m.id = p.cover_media_id`;
type Row = Record<string, unknown>;
const toProject = (r: Row): Project => ({ ...(r as unknown as Project), tags: parseJson<string[]>(String(r.tags), []), featured: !!r.featured, is_sample: !!r.is_sample });

/** Guests see everything the owner sees except the owner's real drafts; only sample drafts are visible to them. */
const visible = (role: Role) => (role === 'owner' ? '1=1' : "(p.status = 'published' OR p.is_sample = 1)");

export function listAdmin(role: Role, q = ''): Project[] {
  const like = `%${q.trim().toLowerCase()}%`;
  const rows = db().prepare(`${SELECT} WHERE ${visible(role)} AND (? = '%%' OR lower(p.title || ' ' || p.summary || ' ' || p.tags) LIKE ?) ORDER BY p.position, p.id`).all(like, like);
  return rows.map(toProject);
}

export function getAdmin(id: number, role: Role): Project | null {
  const r = db().prepare(`${SELECT} WHERE p.id = ? AND ${visible(role)}`).get(id);
  return r ? toProject(r) : null;
}

export function counts(role: Role): { published: number; drafts: number; media: number } {
  const d = db();
  const c = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  return {
    published: c("SELECT COUNT(*) n FROM projects WHERE status = 'published'"),
    drafts: c(role === 'owner' ? "SELECT COUNT(*) n FROM projects WHERE status = 'draft'" : "SELECT COUNT(*) n FROM projects WHERE status = 'draft' AND is_sample = 1"),
    media: c('SELECT COUNT(*) n FROM media'),
  };
}

export function recent(role: Role, limit = 5): Project[] {
  return db().prepare(`${SELECT} WHERE ${visible(role)} ORDER BY p.updated_at DESC LIMIT ?`).all(limit).map(toProject);
}

function uniqueSlug(base: string, exceptId = 0): string {
  let slug = slugify(base) || 'untitled', n = 2;
  const taken = (s: string) => !!db().prepare('SELECT 1 FROM projects WHERE slug = ? AND id != ?').get(s, exceptId);
  const root = slug;
  while (taken(slug)) slug = `${root}-${n++}`;
  return slug;
}

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): Result<never> => ({ ok: false, status, error, message });

export function createProject(title: string): Result<Project> {
  const t = title.trim();
  if (!t || t.length > 120) return fail(400, 'invalid_title', 'Give the project a title (up to 120 characters).');
  const now = Date.now();
  const id = tx(db(), () => {
    const pos = ((db().prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM projects').get() as { n: number }).n);
    return Number(db().prepare(`INSERT INTO projects (slug, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(uniqueSlug(t), t, pos, now, now).lastInsertRowid);
  });
  return { ok: true, value: getAdmin(id, 'owner')! };
}

const MONTH = /^(\d{4}-(0[1-9]|1[0-2]))?$/;
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);

/** Applies a partial update; unknown keys are ignored, bad values are rejected with a readable message. */
export function updateProject(id: number, patch: Record<string, unknown>): Result<Project> {
  const cur = getAdmin(id, 'owner');
  if (!cur) return fail(404, 'not_found', 'That project doesn’t exist.');
  const set: Record<string, string | number | null> = {};
  const bad = (m: string) => fail(400, 'invalid', m);

  for (const [k, max] of [['title', 120], ['summary', 140], ['kind', 120], ['role', 120], ['stack', 200]] as const) {
    if (!(k in patch)) continue;
    const v = str(patch[k], max);
    if (v === null) return bad(`${k} must be text up to ${max} characters.`);
    if (k === 'title' && !v.trim()) return bad('Title can’t be empty.');
    set[k] = v.trim();
  }
  if ('slug' in patch) {
    const raw = str(patch.slug, 80);
    if (raw === null || !/[a-z0-9]/i.test(raw.normalize('NFKD'))) return bad('Page address must be letters, numbers and dashes.');
    const slug = slugify(raw);
    if (db().prepare('SELECT 1 FROM projects WHERE slug = ? AND id != ?').get(slug, id)) return fail(409, 'slug_taken', 'Another project already uses that page address.');
    set.slug = slug;
  }
  if ('story_html' in patch) {
    const v = str(patch.story_html, 200_000);
    if (v === null) return bad('The story is too long.');
    set.story_html = sanitizeStory(v);
  }
  for (const k of ['live_url', 'src_url'] as const) {
    if (!(k in patch)) continue;
    const v = str(patch[k], 500);
    if (v === null || (v.trim() && !/^https?:\/\//i.test(v.trim()))) return bad('Links must start with http:// or https://.');
    set[k] = safeUrl(v);
  }
  for (const k of ['started', 'finished'] as const) {
    if (!(k in patch)) continue;
    const v = str(patch[k], 7);
    if (v === null || !MONTH.test(v)) return bad('Dates must be a month, like 2026-04.');
    set[k] = v;
  }
  if ('tags' in patch) {
    const t = patch.tags;
    if (!Array.isArray(t) || t.length > 12 || t.some((x) => typeof x !== 'string' || !x.trim() || x.length > 30)) return bad('Tags: up to 12, each up to 30 characters.');
    set.tags = JSON.stringify([...new Set(t.map((x) => (x as string).trim()))]);
  }
  if ('featured' in patch) {
    if (typeof patch.featured !== 'boolean') return bad('featured must be true or false.');
    set.featured = patch.featured ? 1 : 0;
  }
  if ('cover_media_id' in patch) {
    const m = patch.cover_media_id;
    if (m !== null && (typeof m !== 'number' || !db().prepare('SELECT 1 FROM media WHERE id = ?').get(m))) return bad('That cover picture doesn’t exist.');
    set.cover_media_id = m as number | null;
  }
  if ('status' in patch) {
    if (patch.status !== 'draft' && patch.status !== 'published') return bad('status must be draft or published.');
    set.status = patch.status;
    if (patch.status === 'published') {
      const title = String(set.title ?? cur.title);
      if (!title.trim()) return bad('Add a title before publishing.');
      if (!cur.published_at) set.published_at = Date.now();
    }
  }

  const keys = Object.keys(set);
  if (!keys.length) return { ok: true, value: cur };
  set.updated_at = Date.now();
  const cols = Object.keys(set);
  db().prepare(`UPDATE projects SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => set[c]!), id);
  return { ok: true, value: getAdmin(id, 'owner')! };
}

export function duplicateProject(id: number): Result<Project> {
  const src = getAdmin(id, 'owner');
  if (!src) return fail(404, 'not_found', 'That project doesn’t exist.');
  const now = Date.now();
  const newId = tx(db(), () => {
    const pos = ((db().prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM projects').get() as { n: number }).n);
    const title = `${src.title} (copy)`.slice(0, 120);
    return Number(db().prepare(`INSERT INTO projects (slug, title, summary, story_html, cover_media_id, kind, role, stack, tags, live_url, src_url, started, finished,
      featured, status, is_sample, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'draft',0,?,?,?)`)
      .run(uniqueSlug(title), title, src.summary, src.story_html, src.cover_media_id, src.kind, src.role, src.stack, JSON.stringify(src.tags), src.live_url, src.src_url, src.started, src.finished, pos, now, now).lastInsertRowid);
  });
  return { ok: true, value: getAdmin(newId, 'owner')! };
}

export function deleteProject(id: number): boolean {
  return db().prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}

export function reorder(ids: number[]): Result<number> {
  const all = (db().prepare('SELECT id FROM projects').all() as { id: number }[]).map((r) => r.id);
  if (ids.length !== all.length || new Set(ids).size !== ids.length || ids.some((i) => !all.includes(i))) return fail(400, 'invalid', 'The order must list every project exactly once.');
  tx(db(), () => ids.forEach((id, i) => db().prepare('UPDATE projects SET position = ? WHERE id = ?').run(i, id)));
  return { ok: true, value: ids.length };
}
