import type { APIRoute } from 'astro';
import { createSession } from '../../../lib/auth.ts';
import { json, setSessionCookie } from '../../../lib/http.ts';
import { getSettings } from '../../../lib/queries.ts';

export const POST: APIRoute = (ctx) => {
  if (!getSettings().guest_enabled) return json(403, { error: 'guest_disabled', message: 'Guest mode is turned off right now.' });
  const s = createSession('guest', null);
  setSessionCookie(ctx, s.token, s.maxAge);
  return json(200, { role: 'guest', expiresAt: s.expiresAt });
};
