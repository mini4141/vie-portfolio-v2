import { db } from './db.ts';
import { parseJson } from './text.ts';

export interface Project {
  id: number; slug: string; title: string; summary: string; story_html: string;
  cover_media_id: number | null; cover_file: string | null; cover_alt: string;
  kind: string; role: string; stack: string; tags: string[]; live_url: string; src_url: string;
  started: string; finished: string; featured: boolean; status: 'draft' | 'published';
  is_sample: boolean; position: number; created_at: number; updated_at: number; published_at: number | null;
}
export interface SkillGroup { group: string; items: string[] }
export interface Job { years: string; role: string; org: string; text: string }
export interface Link { label: string; url: string }
export interface Section { key: 'about' | 'featured' | 'skills' | 'experience' | 'contact'; visible: boolean }
export interface Profile {
  name: string; headline: string; status_line: string; about: string; location: string; email: string;
  photo_file: string | null; photo_alt: string; cv_file: string | null;
  skills: SkillGroup[]; experience: Job[]; links: Link[]; sections: Section[];
  photo_media_id: number | null; cv_media_id: number | null;
}
export interface Settings {
  site_title: string; description: string; share_file: string | null; share_media_id: number | null;
  accent: string; default_theme: 'system' | 'light' | 'dark'; guest_enabled: boolean;
}

const PROJECT_SQL = `SELECT p.*, m.filename AS cover_file, COALESCE(m.alt, '') AS cover_alt
  FROM projects p LEFT JOIN media m ON m.id = p.cover_media_id`;

type Row = Record<string, unknown>;
function toProject(r: Row): Project {
  return {
    ...(r as unknown as Project),
    tags: parseJson<string[]>(String(r.tags), []),
    featured: !!r.featured,
    is_sample: !!r.is_sample,
  };
}

export const mediaUrl = (file: string | null | undefined): string => (file ? `/media/${file}` : '');

export function listPublished(): Project[] {
  return db().prepare(`${PROJECT_SQL} WHERE p.status = 'published' ORDER BY p.position, p.id`).all().map(toProject);
}
export function listFeatured(limit = 6): Project[] {
  return db().prepare(`${PROJECT_SQL} WHERE p.status = 'published' AND p.featured = 1 ORDER BY p.position, p.id LIMIT ?`).all(limit).map(toProject);
}
/** Visitors only ever get published projects. */
export function getPublished(slug: string): Project | null {
  const r = db().prepare(`${PROJECT_SQL} WHERE p.slug = ? AND p.status = 'published'`).get(slug);
  return r ? toProject(r) : null;
}
export function nextPublished(slug: string): Project | null {
  const all = listPublished();
  if (all.length < 2) return null;
  const i = all.findIndex((p) => p.slug === slug);
  return all[(i + 1) % all.length] ?? null;
}

export function getSettings(): Settings {
  const r = db().prepare(`SELECT s.*, m.filename AS share_file FROM settings s LEFT JOIN media m ON m.id = s.share_media_id WHERE s.id = 1`).get() as Row | undefined;
  if (!r) return { site_title: 'Portfolio', description: '', share_file: null, share_media_id: null, accent: '#12805C', default_theme: 'system', guest_enabled: true };
  return { ...(r as unknown as Settings), guest_enabled: !!r.guest_enabled };
}

export function getProfile(): Profile {
  const r = db().prepare(`SELECT p.*, ph.filename AS photo_file, COALESCE(ph.alt, '') AS photo_alt, cv.filename AS cv_file
    FROM profile p LEFT JOIN media ph ON ph.id = p.photo_media_id LEFT JOIN media cv ON cv.id = p.cv_media_id WHERE p.id = 1`).get() as Row | undefined;
  const base = { name: '', headline: '', status_line: '', about: '', location: '', email: '', photo_file: null, photo_alt: '', cv_file: null, photo_media_id: null, cv_media_id: null };
  if (!r) return { ...base, skills: [], experience: [], links: [], sections: [] };
  return {
    ...(r as unknown as Profile),
    skills: parseJson(String(r.skills), []),
    experience: parseJson(String(r.experience), []),
    links: parseJson(String(r.links), []),
    sections: parseJson(String(r.sections), []),
  };
}
