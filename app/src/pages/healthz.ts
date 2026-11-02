import type { APIRoute } from 'astro';
import { db } from '../lib/db.ts';

/** Liveness + database check for Docker/Caddy. Public, read-only, reveals nothing. */
export const GET: APIRoute = () => {
  try {
    db().prepare('SELECT 1').get();
    return new Response('ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('database unavailable', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
};
