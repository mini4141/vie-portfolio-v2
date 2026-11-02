import type { APIRoute } from 'astro';
import { reorder } from '../../../lib/projects.ts';
import { json, readJson } from '../../../lib/http.ts';

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request);
  const ids = Array.isArray(body?.ids) && body.ids.every((i) => Number.isInteger(i)) ? (body.ids as number[]) : null;
  if (!ids) return json(400, { error: 'invalid', message: 'Send { ids: [...] }.' });
  const r = reorder(ids);
  return r.ok ? json(200, { ok: true }) : json(r.status, { error: r.error, message: r.message });
};
