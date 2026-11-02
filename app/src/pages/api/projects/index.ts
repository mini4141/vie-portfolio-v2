import type { APIRoute } from 'astro';
import { createProject, listAdmin } from '../../../lib/projects.ts';
import { json, readJson } from '../../../lib/http.ts';

export const GET: APIRoute = ({ locals, url }) => json(200, { projects: listAdmin(locals.auth.role, url.searchParams.get('q') ?? '') });

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request);
  const r = createProject(typeof body?.title === 'string' ? body.title : '');
  return r.ok ? json(201, { project: r.value }) : json(r.status, { error: r.error, message: r.message });
};
