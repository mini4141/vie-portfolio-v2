import type { APIRoute } from 'astro';
import { deleteMedia, getMedia, setAlt } from '../../../lib/media.ts';
import { json, readJson } from '../../../lib/http.ts';

const idOf = (p: string | undefined) => (p && /^\d+$/.test(p) ? Number(p) : 0);

export const GET: APIRoute = ({ params }) => {
  const m = getMedia(idOf(params.id));
  return m ? json(200, { media: m }) : json(404, { error: 'not_found', message: 'That file doesn’t exist.' });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const body = await readJson(request);
  if (!body) return json(400, { error: 'invalid', message: 'Send a JSON object.' });
  const r = setAlt(idOf(params.id), body.alt);
  return r.ok ? json(200, { media: r.value }) : json(r.status, { error: r.error, message: r.message });
};

export const DELETE: APIRoute = ({ params }) => {
  const r = deleteMedia(idOf(params.id));
  return r.ok ? json(200, { ok: true }) : json(r.status, { error: r.error, message: r.message });
};
