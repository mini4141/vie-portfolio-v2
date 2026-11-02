import type { APIRoute } from 'astro';
import { checkCredentials, clearFailures, createSession, lockedFor, recordFailure } from '../../../lib/auth.ts';
import { clientIp, json, readJson, setSessionCookie } from '../../../lib/http.ts';

export const POST: APIRoute = async (ctx) => {
  const body = await readJson(ctx.request);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password || email.length > 254 || password.length > 200) return json(400, { error: 'invalid', message: 'Enter your email and password.' });

  const ip = clientIp(ctx);
  const wait = lockedFor(ip, email);
  if (wait) return json(429, { error: 'locked', message: 'Too many wrong attempts. Sign-in is paused for 15 minutes.', retryAfter: wait }, { 'Retry-After': String(wait) });

  const user = checkCredentials(email, password);
  if (!user) {
    const left = recordFailure(ip, email);
    if (left === 0) return json(429, { error: 'locked', message: 'Too many wrong attempts. Sign-in is paused for 15 minutes.', retryAfter: 900 }, { 'Retry-After': '900' });
    return json(401, { error: 'bad_credentials', message: `That email and password don't match. You have ${left} ${left === 1 ? 'try' : 'tries'} left before sign-in pauses for 15 minutes.`, triesLeft: left });
  }
  clearFailures(ip, email);
  const s = createSession('owner', user.id);
  setSessionCookie(ctx, s.token, s.maxAge);
  return json(200, { role: 'owner', expiresAt: s.expiresAt });
};
