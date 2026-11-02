import type { APIRoute } from 'astro';
import { listPublished } from '../lib/queries.ts';
import { esc } from '../lib/text.ts';

export const GET: APIRoute = ({ url }) => {
  const origin = (process.env.SITE_URL ?? url.origin).replace(/\/$/, '');
  const urls = [
    { loc: '/', mod: undefined },
    { loc: '/projects', mod: undefined },
    ...listPublished().map((p) => ({ loc: `/projects/${p.slug}`, mod: new Date(p.updated_at).toISOString().slice(0, 10) })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(origin + u.loc)}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
