import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ url }) => {
  const origin = (process.env.SITE_URL ?? url.origin).replace(/\/$/, '');
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
