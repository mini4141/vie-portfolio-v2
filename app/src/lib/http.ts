import type { APIContext } from 'astro';
import { SESSION_COOKIE } from './auth.ts';

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await req.json();
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

/** Behind Caddy the real address is in X-Forwarded-For; only trust it when TRUST_PROXY=1. */
export function clientIp(ctx: Pick<APIContext, 'request' | 'clientAddress'>): string {
  if (process.env.TRUST_PROXY === '1') {
    const f = ctx.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (f) return f;
  }
  try { return ctx.clientAddress; } catch { return 'unknown'; }
}

export function setSessionCookie(ctx: Pick<APIContext, 'cookies' | 'url'>, token: string, maxAge: number): void {
  const secure = (process.env.SITE_URL ?? ctx.url.origin).startsWith('https:');
  ctx.cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge });
}
