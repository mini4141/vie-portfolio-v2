// Usage (on the server):  docker compose exec -T app node scripts/import-project.ts /import/project.json
//         from a pipe:    cat project.json | docker compose exec -T app node scripts/import-project.ts - --media-dir /import
//         check only:     … --dry-run      (reads and converts everything, writes nothing)
// Pictures named in the JSON are looked up next to the JSON file (or in --media-dir). Re-running updates the same projects.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { importProject, projectsOf, ImportError, type ImportResult } from '../src/lib/import.ts';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => (a === '-' || !a.startsWith('--')) && args[i - 1] !== '--media-dir');

if (!file || flag('--help')) {
  console.error('Usage: node scripts/import-project.ts <file.json | -> [--media-dir DIR] [--dry-run]');
  process.exit(file ? 0 : 2);
}

try {
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  let input: unknown;
  try { input = JSON.parse(raw); } catch (e) { throw new ImportError(`That is not valid JSON: ${(e as Error).message}`); }
  const baseDir = resolve(val('--media-dir') ?? (file === '-' ? '.' : dirname(file)));
  const dryRun = flag('--dry-run');

  const results: ImportResult[] = [];
  for (const p of projectsOf(input)) {   // one at a time, so a failure still shows what was already done
    const r = await importProject(p, { baseDir, dryRun });
    results.push(r);
    console.log(`${r.action.padEnd(8)} ${r.slug}  [${r.status}]  ${r.pictures} picture${r.pictures === 1 ? '' : 's'}`);
    for (const w of r.warnings) console.log(`         warning: ${w}`);
  }
  if (dryRun) console.log('\nDry run: nothing was written.');
  else {
    console.log('\nThe public pages are cached for a day. Purge in Cloudflare (Caching > Configuration > Purge Cache):');
    for (const p of ['/', '/projects', ...results.map((r) => `/projects/${r.slug}`), '/sitemap.xml']) console.log(`  ${(process.env.SITE_URL ?? 'https://your-domain').replace(/\/$/, '')}${p}`);
  }
} catch (e) {
  console.error(`Import stopped: ${(e as Error).message}`);
  process.exit(1);
}
