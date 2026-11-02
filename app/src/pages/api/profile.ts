import type { APIRoute } from 'astro';
import { getProfile } from '../../lib/queries.ts';
import { updateProfile } from '../../lib/site.ts';
import { json, readJson } from '../../lib/http.ts';

export const GET: APIRoute = () => json(200, { profile: getProfile() });

export const PATCH: APIRoute = async ({ request }) => {
  const body = await readJson(request);
  if (!body) return json(400, { error: 'invalid', message: 'Send a JSON object.' });
  const r = updateProfile(body);
  return r.ok ? json(200, { profile: r.value }) : json(r.status, { error: r.error, message: r.message });
};
