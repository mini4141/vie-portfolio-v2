import { defineMiddleware } from 'astro:middleware';
import { resolveSession, SESSION_COOKIE, VISITOR } from './lib/auth.ts';
import { getSettings } from './lib/queries.ts';
import { withSecurityHeaders } from './lib/headers.ts';

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameOrigin(req: Request, url: URL): boolean {
  const o = req.headers.get('origin');
  if (!o) return true; // non-browser clients and same-origin GET-less fetches; SameSite=Lax cookies cover the rest
  try {
    const host = new URL(o).host;
    const site = process.env.SITE_URL ? new URL(process.env.SITE_URL).host : url.host;
    // compare with the Host the browser actually requested (a cross-site page cannot forge that), the configured site, or the proxy's host
    return host === req.headers.get('host') || host === url.host || host === site || host === req.headers.get('x-forwarded-host');
  } catch { return false; }
}

const https = () => (process.env.SITE_URL ?? '').startsWith('https:');

export const onRequest = defineMiddleware(async (ctx, next) => withSecurityHeaders(await guard(ctx, next), https()));

const guard = async (ctx: Parameters<Parameters<typeof defineMiddleware>[0]>[0], next: Parameters<Parameters<typeof defineMiddleware>[0]>[1]): Promise<Response> => {
  const { pathname } = ctx.url;
  const guarded = pathname.startsWith('/admin') || pathname.startsWith('/api');
  if (!guarded) {
    const res = await next();
    // Public pages never read the session, so every visitor gets the same HTML: let a CDN keep it for a day and
    // refresh it in the background for a week after that. Content changes rarely; purge the CDN cache after an edit.
    if (ctx.request.method === 'GET' && res.status === 200 && !res.headers.has('Cache-Control')) {
      res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
    }
    return res;
  }

  let auth = resolveSession(ctx.cookies.get(SESSION_COOKIE)?.value);
  if (auth.role === 'guest' && !getSettings().guest_enabled) auth = VISITOR; // guest login switched off in settings
  ctx.locals.auth = auth;

  const isApi = pathname.startsWith('/api');
  const isAuthApi = pathname.startsWith('/api/auth/');
  const isSignin = pathname === '/admin/signin';

  if (!SAFE.has(ctx.request.method) && !sameOrigin(ctx.request, ctx.url)) {
    return isApi ? json(403, { error: 'bad_origin', message: 'Cross-site requests are not allowed.' }) : new Response('Forbidden', { status: 403 });
  }

  if (isApi && !isAuthApi) {
    if (auth.role === 'visitor') return json(401, { error: 'unauthenticated', message: 'Please sign in.' });
    // The one place guests are stopped from writing: every present and future /api write passes through here.
    if (!SAFE.has(ctx.request.method) && auth.role !== 'owner') {
      return json(403, { error: 'guest_read_only', message: 'Saving is turned off in guest mode.' });
    }
  }
  if (!isApi && !isSignin && auth.role === 'visitor') return ctx.redirect('/admin/signin', 302);
  if (isSignin && auth.role !== 'visitor') return ctx.redirect('/admin', 302);

  const res = await next();
  res.headers.set('Cache-Control', 'no-store');
  return res;
};
