import type { APIRoute } from 'astro';
import { destroySession, SESSION_COOKIE } from '../../../lib/auth.ts';
import { json } from '../../../lib/http.ts';

export const POST: APIRoute = ({ cookies }) => {
  destroySession(cookies.get(SESSION_COOKIE)?.value);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return json(200, { ok: true });
};
