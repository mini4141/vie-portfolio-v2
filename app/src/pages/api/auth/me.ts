import type { APIRoute } from 'astro';
import { json } from '../../../lib/http.ts';

export const GET: APIRoute = ({ locals }) => {
  const a = locals.auth;
  return json(200, { role: a.role, expiresAt: a.expiresAt, email: a.role === 'owner' ? a.email : null });
};
