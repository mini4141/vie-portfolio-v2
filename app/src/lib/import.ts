import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { db } from './db.ts';
import { createProject, deleteProject, updateProject } from './projects.ts';
import { saveUpload, setAlt, sniff, MAX_IMAGE_BYTES } from './media.ts';
import { blocksToHtml, collectImages, StoryError, type Img } from './story.ts';
import { slugify } from './text.ts';

/**
 * Create or update projects from plain JSON, for use on the server itself (no login: whoever can run the command
 * already controls the box). Re-running the same file updates the same projects (matched by slug), and
 * identical pictures are stored once. Every value goes through the same validation and sanitiser as the editor.
 */
export class ImportError extends Error {}

export interface ImportResult { slug: string; action: 'created' | 'updated' | 'checked'; id: number | null; status: string; pictures: number; warnings: string[] }
export interface ImportOptions { baseDir: string; dryRun?: boolean }

const FIELDS = new Set(['slug', 'title', 'summary', 'kind', 'role', 'stack', 'tags', 'live_url', 'src_url', 'started', 'finished', 'featured', 'status', 'cover', 'cover_alt', 'story', 'story_html']);
const PLAIN = ['title', 'summary', 'kind', 'role', 'stack', 'tags', 'live_url', 'src_url', 'started', 'finished', 'featured', 'status'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function closest(word: string): string | undefined {
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
    for (let j = 1; j <= b.length; j++) d[0]![j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length]![b.length]!;
  };
  return [...FIELDS].map((f) => [f, dist(word, f)] as const).sort((a, b) => a[1] - b[1]).find(([, n]) => n <= 2)?.[0];
}

/** One project, a list of projects, or {"projects": [...]}. */
export function projectsOf(input: unknown): Record<string, unknown>[] {
  const list = Array.isArray(input) ? input : isObj(input) && Array.isArray(input.projects) ? input.projects : [input];
  if (!list.length || list.length > 50) throw new ImportError('Give 1 to 50 projects.');
  list.forEach((p, i) => {
    if (!isObj(p)) throw new ImportError(`Project ${i + 1} must be a JSON object.`);
    for (const k of Object.keys(p)) {
      if (!FIELDS.has(k)) { const s = closest(k); throw new ImportError(`Project ${i + 1}: unknown field "${k}"${s ? ` (did you mean "${s}"?)` : ''}.`); }
    }
    if ('story' in p && 'story_html' in p) throw new ImportError(`Project ${i + 1}: use either "story" (blocks) or "story_html", not both.`);
  });
  return list as Record<string, unknown>[];
}

/** A picture is either already in the media library (by stored file name) or a file next to the JSON. */
async function store(ref: string, alt: string, opts: ImportOptions): Promise<Img & { id: number | null }> {
  const known = db().prepare('SELECT id, filename, original_name FROM media WHERE filename = ?').get(ref) as { id: number; filename: string; original_name: string } | undefined;
  if (known) return { id: known.id, url: `/media/${known.filename}`, name: known.original_name };

  const path = isAbsolute(ref) ? ref : resolve(opts.baseDir, ref);
  if (!existsSync(path) || !statSync(path).isFile()) throw new ImportError(`Picture "${ref}" not found (looked for ${path}).`);
  const bytes = readFileSync(path);
  if (opts.dryRun) {
    const t = sniff(bytes);
    if (!t || t === 'pdf') throw new ImportError(`"${ref}" is not a JPG, PNG, WebP or GIF picture.`);
    if (bytes.length > MAX_IMAGE_BYTES) throw new ImportError(`"${ref}" is over 15 MB.`);
    return { id: null, url: `/media/(dry-run)-${basename(path)}`, name: basename(path) };
  }
  const r = await saveUpload(bytes, basename(path), alt);
  if (!r.ok) throw new ImportError(`Picture "${ref}": ${r.message}`);
  return { id: r.value.id, url: r.value.url, name: r.value.original_name };
}

export async function importProject(p: Record<string, unknown>, opts: ImportOptions): Promise<ImportResult> {
  const title = typeof p.title === 'string' ? p.title : '';
  const slug = slugify(typeof p.slug === 'string' && p.slug.trim() ? p.slug : title);
  if (!slug || (typeof p.slug !== 'string' && !title.trim())) throw new ImportError('Each project needs a "title" (or a "slug" of an existing project).');
  const where = `"${slug}"`;
  const warnings: string[] = [];
  const patch: Record<string, unknown> = {};
  for (const k of PLAIN) if (k in p) patch[k] = p[k];

  // pictures first: a missing file should stop us before anything is written
  const images = new Map<string, Img>();
  let pictures = 0;
  try {
    for (const { ref, alt } of collectImages(p.story)) {
      if (!images.has(ref)) { images.set(ref, await store(ref, alt, opts)); pictures++; }
    }
    if ('story' in p) {
      const r = blocksToHtml(p.story, images);
      patch.story_html = r.html;
      warnings.push(...r.warnings);
    } else if ('story_html' in p) patch.story_html = p.story_html;
  } catch (e) {
    if (e instanceof StoryError || e instanceof ImportError) throw new ImportError(`${where}: ${e.message}`);
    throw e;
  }

  let coverId: number | null | undefined;
  if ('cover' in p) {
    if (p.cover === null) coverId = null;
    else if (typeof p.cover === 'string') {
      const c = await store(p.cover, typeof p.cover_alt === 'string' ? p.cover_alt : '', opts).catch((e) => { throw new ImportError(`${where}: ${(e as Error).message}`); });
      pictures++;
      if (c.id !== null) { coverId = c.id; if (typeof p.cover_alt === 'string' && p.cover_alt.trim()) setAlt(c.id, p.cover_alt); }
    } else throw new ImportError(`${where}: "cover" must be a picture file name (or null to remove it).`);
    if (coverId !== undefined) patch.cover_media_id = coverId;
  }

  const existing = db().prepare('SELECT id FROM projects WHERE slug = ?').get(slug) as { id: number } | undefined;
  if (opts.dryRun) {
    const status = typeof p.status === 'string' ? p.status : existing ? '(unchanged)' : 'draft';
    return { slug, action: 'checked', id: existing?.id ?? null, status, pictures, warnings };
  }

  if (existing) {
    const r = updateProject(existing.id, patch);
    if (!r.ok) throw new ImportError(`${where}: ${r.message}`);
    return { slug, action: 'updated', id: existing.id, status: r.value.status, pictures, warnings };
  }
  if (!title.trim()) throw new ImportError(`${where}: no project with this slug exists yet, so a "title" is required.`);
  const made = createProject(title);
  if (!made.ok) throw new ImportError(`${where}: ${made.message}`);
  const r = updateProject(made.value.id, { ...patch, slug });
  if (!r.ok) { deleteProject(made.value.id); throw new ImportError(`${where}: ${r.message}`); }
  return { slug, action: 'created', id: made.value.id, status: r.value.status, pictures, warnings };
}

export async function importAll(input: unknown, opts: ImportOptions): Promise<ImportResult[]> {
  const list = projectsOf(input);
  const out: ImportResult[] = [];
  for (const p of list) out.push(await importProject(p, opts));
  return out;
}
