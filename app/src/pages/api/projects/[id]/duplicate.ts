import type { APIRoute } from 'astro';
import { duplicateProject } from '../../../../lib/projects.ts';
import { json } from '../../../../lib/http.ts';

export const POST: APIRoute = ({ params }) => {
  const r = duplicateProject(Number(params.id));
  return r.ok ? json(201, { project: r.value }) : json(r.status, { error: r.error, message: r.message });
};
