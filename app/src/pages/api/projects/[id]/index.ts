import type { APIRoute } from 'astro';
import { deleteProject, getAdmin, updateProject } from '../../../../lib/projects.ts';
import { json, readJson } from '../../../../lib/http.ts';

const idOf = (p: string | undefined) => (p && /^\d+$/.test(p) ? Number(p) : 0);
const notFound = () => json(404, { error: 'not_found', message: 'That project doesn’t exist.' });

export const GET: APIRoute = ({ params, locals }) => {
  const p = getAdmin(idOf(params.id), locals.auth.role);
  return p ? json(200, { project: p }) : notFound();
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const body = await readJson(request);
  if (!body) return json(400, { error: 'invalid', message: 'Send a JSON object.' });
  const r = updateProject(idOf(params.id), body);
  return r.ok ? json(200, { project: r.value }) : json(r.status, { error: r.error, message: r.message });
};

export const DELETE: APIRoute = ({ params }) => (deleteProject(idOf(params.id)) ? json(200, { ok: true }) : notFound());
