#!/usr/bin/env node
/**
 * Warm the CDN cache from several regions, so the first real visitor in each is not the one who waits.
 * Uses Globalping (https://globalping.io): free, no key needed (250 probe-tests an hour; a token raises it to 500).
 * A probe is a real machine in that country making a real GET, so the nearest Cloudflare edge fills its cache.
 *
 *   node devops/warm-cache.mjs                      # warms SITE_URL (default below)
 *   SITE_URL=https://example.com node devops/warm-cache.mjs
 *   GLOBALPING_TOKEN=... node devops/warm-cache.mjs # optional, higher hourly allowance
 *
 * Exit code 1 only when the home page itself fails for most probes (so a scheduled run doubles as an uptime check).
 * MISS results are normal: they are the requests that did the warming.
 */
const SITE = (process.env.SITE_URL ?? 'https://alvieirvansyah.com').replace(/\/$/, '');
const TOKEN = process.env.GLOBALPING_TOKEN;
const API = 'https://api.globalping.io/v1/measurements';
const HOST = new URL(SITE).host;

/** one probe per entry unless a limit is given; adjust to where your visitors are */
const REGIONS = [
  { country: 'US', limit: 2 }, { country: 'GB' }, { country: 'DE' }, { country: 'IN' },
  { country: 'SG' }, { country: 'JP' }, { country: 'AU' }, { country: 'BR' },
];
const PROBES = REGIONS.reduce((n, r) => n + (r.limit ?? 1), 0);
const BUDGET = Math.floor((TOKEN ? 500 : 250) * 0.8);   // probe-tests per hour, minus headroom for manual runs
const headers = { 'User-Agent': 'vie-portfolio-cache-warmer', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function text(path) {
  const r = await fetch(SITE + path, { headers: { 'User-Agent': headers['User-Agent'] } });
  if (!r.ok) throw new Error(`${path} answered ${r.status}`);
  return r.text();
}

/** pages from the sitemap, then the files the home page needs (most important first) */
async function discover() {
  const pages = new Set(['/']);
  try {
    for (const m of (await text('/sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = new URL(m[1]); if (u.host === HOST) pages.add(u.pathname);
    }
  } catch (e) { console.warn('sitemap skipped:', e.message); }

  const assets = new Set();
  const home = await text('/');
  for (const m of home.matchAll(/(?:href|src)="(\/[^"#?]+\.(?:css|js))"/g)) assets.add(m[1]);
  for (const m of home.matchAll(/<img[^>]+src="(\/media\/[^"]+)"[^>]*fetchpriority="high"|<img[^>]+fetchpriority="high"[^>]+src="(\/media\/[^"]+)"/g)) assets.add(m[1] ?? m[2]);
  for (const css of [...assets].filter((a) => a.endsWith('.css'))) {
    try { for (const m of (await text(css)).matchAll(/url\((?:"|')?(\/fonts\/[^)"']+\.woff2)/g)) assets.add(m[1]); } catch { /* optional */ }
  }
  return [...pages, ...assets].filter((p) => !p.startsWith('/admin') && !p.startsWith('/api'));
}

async function post(path, attempt = 0) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'http', target: HOST, locations: REGIONS,
      measurementOptions: { protocol: 'HTTPS', request: { method: 'GET', path } },
    }),
  });
  if (r.status === 429 && attempt < 4) { await sleep(5000 * (attempt + 1)); return post(path, attempt + 1); }
  if (!r.ok) throw new Error(`Globalping ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).id;
}

async function result(id) {
  for (let i = 0; i < 30; i++) {
    const j = await (await fetch(`${API}/${id}`, { headers })).json();
    if (j.status === 'finished') return j.results;
    await sleep(2000);
  }
  throw new Error(`measurement ${id} did not finish`);
}

const all = await discover();
const maxUrls = Math.min(Math.floor(BUDGET / PROBES), Number(process.env.WARM_MAX_URLS) || Infinity);
const paths = all.slice(0, maxUrls);
if (all.length > maxUrls) console.warn(`${all.length} URLs but the hourly allowance fits ${maxUrls}; skipping: ${all.slice(maxUrls).join(', ')}`);
console.log(`Warming ${paths.length} URLs on ${SITE} from ${PROBES} probes (${paths.length * PROBES} tests, planned allowance ${BUDGET}/hour)\n`);

const ids = [];
for (const p of paths) {
  try { ids.push([p, await post(p)]); } catch (e) { console.warn(`stopped at ${p}: ${e.message.split('\n')[0]}`); break; }
  await sleep(400);
}

let homeTotal = 0, homeBad = 0;
for (const [p, id] of ids) {
  const rs = await result(id);
  const tally = {};
  let ms = 0, n = 0;
  for (const r of rs) {
    const x = r.result, st = x.headers?.['cf-cache-status'] ?? (x.statusCode ? `no-cf(${x.statusCode})` : 'error');
    tally[st] = (tally[st] ?? 0) + 1;
    if (x.timings?.total) { ms += x.timings.total; n++; }
    if (p === '/') { homeTotal++; if (x.statusCode !== 200) homeBad++; }
  }
  console.log(p.padEnd(44), `${rs.length} probes`.padEnd(10), JSON.stringify(tally).padEnd(36), n ? `avg ${Math.round(ms / n)} ms` : '');
}
console.log('\nMISS = this run filled that edge; HIT = it was already warm.');
if (homeTotal && homeBad / homeTotal > 0.5) { console.error(`Home page failed for ${homeBad}/${homeTotal} probes`); process.exit(1); }
