import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { UPLOAD_DIR } from '../../lib/db.ts';

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.pdf': 'application/pdf',
};

export const GET: APIRoute = async ({ params }) => {
  const name = params.file ?? '';
  const type = TYPES[extname(name).toLowerCase()];
  const full = resolve(UPLOAD_DIR, name);
  if (!type || !/^[\w.-]+$/.test(name) || !full.startsWith(UPLOAD_DIR + sep)) return new Response('Not found', { status: 404 });
  try {
    const body = await readFile(full);
    return new Response(body, {
      headers: {
        'Content-Type': type,
        'Content-Length': String(body.length),
        // uploads carry a content hash in the name, so they can never change; seed files keep the short cache
        'Cache-Control': /^[0-9a-f]{12}-/.test(name) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
