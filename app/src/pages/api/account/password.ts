import type { APIRoute } from 'astro';
import { changePassword, clearFailures, lockedFor, recordFailure, SESSION_COOKIE } from '../../../lib/auth.ts';
import { clientIp, json, readJson } from '../../../lib/http.ts';

/** Owner only (the middleware turns guests away with 403 like every other write). */
export const POST: APIRoute = async (ctx) => {
  const a = ctx.locals.auth;
  if (a.role !== 'owner' || a.userId === null || !a.email) return json(403, { error: 'guest_read_only', message: 'Saving is turned off in guest mode.' });
  const body = await readJson(ctx.request);
  const current = typeof body?.current === 'string' ? body.current : '';
  const next = typeof body?.next === 'string' ? body.next : '';
  if (!current || !next) return json(400, { error: 'invalid', message: 'Enter your current password and a new one.' });

  // a stolen session must not become a free password-guessing tool: same throttle as sign-in
  const ip = clientIp(ctx), wait = lockedFor(ip, a.email);
  if (wait) return json(429, { error: 'locked', message: 'Too many wrong attempts. Try again in 15 minutes.', retryAfter: wait }, { 'Retry-After': String(wait) });

  const r = changePassword(a.userId, current, next, ctx.cookies.get(SESSION_COOKIE)?.value);
  if (!r.ok) {
    if (r.error === 'wrong_password') recordFailure(ip, a.email);
    return json(r.status, { error: r.error, message: r.message });
  }
  clearFailures(ip, a.email);
  return json(200, { ok: true, message: 'Password changed. Other devices have been signed out.' });
};
