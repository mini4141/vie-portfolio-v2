import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { db, UPLOAD_DIR } from './db.ts';
import { slugify } from './text.ts';
import type { Result } from './projects.ts';

export interface Media {
  id: number; filename: string; original_name: string; mime: string; bytes: number;
  width: number | null; height: number | null; alt: string; created_at: number; kind: 'image' | 'file'; url: string;
}

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 2400;

const fail = (status: number, error: string, message: string): Result<never> => ({ ok: false, status, error, message });
type Row = Record<string, unknown>;
const toMedia = (r: Row): Media => ({ ...(r as unknown as Media), kind: String(r.mime).startsWith('image/') ? 'image' : 'file', url: `/media/${r.filename}` });

/** Identify the real type from the first bytes; the browser-supplied type and the file name are never trusted. */
export function sniff(b: Buffer): 'jpeg' | 'png' | 'gif' | 'webp' | 'pdf' | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
}

export function listMedia(kind?: 'image' | 'file'): Media[] {
  const where = kind === 'image' ? "WHERE mime LIKE 'image/%'" : kind === 'file' ? "WHERE mime NOT LIKE 'image/%'" : '';
  return db().prepare(`SELECT * FROM media ${where} ORDER BY created_at DESC, id DESC`).all().map(toMedia);
}

export function getMedia(id: number): Media | null {
  const r = db().prepare('SELECT * FROM media WHERE id = ?').get(id);
  return r ? toMedia(r) : null;
}

/** Validates, shrinks pictures to WebP (EXIF/GPS dropped), stores under a content-hashed name, and records it. */
export async function saveUpload(bytes: Buffer, originalName: string, alt = ''): Promise<Result<Media>> {
  const type = sniff(bytes);
  if (!type) return fail(400, 'unsupported_type', 'Please choose a JPG, PNG, WebP or GIF picture, or a PDF.');
  const base = slugify(originalName.replace(/\.[^.]*$/, '')).slice(0, 40) || 'file';
  let out = bytes, mime = 'application/pdf', ext = 'pdf', width: number | null = null, height: number | null = null;

  if (type === 'pdf') {
    if (bytes.length > MAX_PDF_BYTES) return fail(413, 'too_large', 'That PDF is over 10 MB. Please use a smaller file.');
  } else {
    if (bytes.length > MAX_IMAGE_BYTES) return fail(413, 'too_large', 'That picture is over 15 MB. Please use a smaller file.');
    try {
      const r = await sharp(bytes).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      out = r.data; width = r.info.width; height = r.info.height; mime = 'image/webp'; ext = 'webp';
    } catch {
      return fail(400, 'unreadable_image', 'We couldn’t read that picture. Try saving it again as JPG or PNG.');
    }
  }

  const hash = createHash('sha256').update(out).digest('hex').slice(0, 12);
  const filename = `${hash}-${base}.${ext}`;
  const existing = db().prepare("SELECT * FROM media WHERE filename LIKE ? || '-%' AND mime = ?").get(hash, mime);
  if (existing) return { ok: true, value: toMedia(existing) };
  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(resolve(UPLOAD_DIR, filename), out);
  const id = Number(db().prepare('INSERT INTO media (filename, original_name, mime, bytes, width, height, alt, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(filename, originalName.slice(0, 200), mime, out.length, width, height, alt.slice(0, 300), Date.now()).lastInsertRowid);
  return { ok: true, value: getMedia(id)! };
}

export function setAlt(id: number, alt: unknown): Result<Media> {
  if (!getMedia(id)) return fail(404, 'not_found', 'That file doesn’t exist.');
  if (typeof alt !== 'string' || alt.length > 300) return fail(400, 'invalid', 'The description must be text up to 300 characters.');
  db().prepare('UPDATE media SET alt = ? WHERE id = ?').run(alt.trim(), id);
  return { ok: true, value: getMedia(id)! };
}

/** Where a file is used, so deleting it can never silently break a page. */
export function usage(m: Media): string[] {
  const d = db(), n = (sql: string, ...a: (string | number)[]) => d.prepare(sql).all(...a) as { t: string }[];
  const used: string[] = [];
  for (const r of n('SELECT title AS t FROM projects WHERE cover_media_id = ?', m.id)) used.push(`cover of “${r.t}”`);
  for (const r of n('SELECT title AS t FROM projects WHERE instr(story_html, ?) > 0', `/media/${m.filename}`)) used.push(`story of “${r.t}”`);
  if (d.prepare('SELECT 1 FROM profile WHERE photo_media_id = ?').get(m.id)) used.push('your profile photo');
  if (d.prepare('SELECT 1 FROM profile WHERE cv_media_id = ?').get(m.id)) used.push('your CV');
  if (d.prepare('SELECT 1 FROM settings WHERE share_media_id = ?').get(m.id)) used.push('the share picture');
  return used;
}

export function deleteMedia(id: number): Result<null> {
  const m = getMedia(id);
  if (!m) return fail(404, 'not_found', 'That file doesn’t exist.');
  const used = usage(m);
  if (used.length) return fail(409, 'in_use', `Still in use as ${used.join(', ')}. Remove it there first.`);
  db().prepare('DELETE FROM media WHERE id = ?').run(id);
  try { unlinkSync(resolve(UPLOAD_DIR, m.filename)); } catch { /* already gone */ }
  return { ok: true, value: null };
}
