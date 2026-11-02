import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from './db.ts';
import { tx } from './db.ts';
import { hashPassword } from './password.ts';
import { sanitizeStory } from './sanitize.ts';

const ALT: Record<string, string> = {
  'portrait.jpg': 'Portrait of Muhamad Alvie',
  'p-pocketwise.jpg': 'Two phones showing the Pocketwise budget and spending screens',
  'p-laju.jpg': "Dispatcher screen with today's delivery routes on a city map",
  'p-kanal.jpg': 'Code editor with the Kanal setup next to a live chat window',
  'p-sehat.jpg': 'Clinic booking page with a weekly calendar of open times',
  'p-arsip.jpg': 'Search results for old batik records in the Arsip library search',
  'p-cms.jpg': "The editor's home screen in guest mode",
  'g1.jpg': 'Analytics dashboard with a weekly sessions chart',
  'g2.jpg': 'Add-expense screen of the mobile app',
  'g3.jpg': 'Route-planning code with passing tests',
  'g4.jpg': 'Whiteboard sketch of the onboarding flow',
  'g5.jpg': 'Design review board with team comments',
  'g6.jpg': 'Results dashboard eight weeks after launch',
  'cv-muhamad-alvie.pdf': 'Curriculum vitae',
};
const g = (k: string) => ALT[`${k}.jpg`]!;

const figure = (file: string, cap: string, cls = 'rt-img') =>
  `<figure class="${cls}"><div class="win"><div class="win-bar"><i></i><i></i><i></i><span>${file}</span></div><img src="/media/${file}" alt="${cap}"></div><figcaption>${cap}</figcaption></figure>`;
const gallery = (...ks: string[]) =>
  `<div class="shots">${ks.map((k) => figure(`${k}.jpg`, g(k), '').replace('<figure class="">', '<figure>')).join('')}</div>`;
const stat = (n: string, t: string) => `<blockquote class="stat"><strong>${n}</strong> ${t}</blockquote>`;
const code = (lang: string, body: string) => `<pre class="code" data-lang="${lang}"><code>${body}\n</code></pre>`;
const table = (head: string[], rows: string[][]) =>
  `<div class="rt-table"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

interface SeedProject {
  slug: string; title: string; summary: string; cover: string; kind: string; role: string; stack: string; tags: string[];
  live: string; src: string; started: string; finished: string; featured: boolean; story: string;
  status?: 'draft' | 'published'; sample?: boolean;
}

const PROJECTS: SeedProject[] = [
  {
    slug: 'pocketwise', title: 'Pocketwise', cover: 'p-pocketwise.jpg', kind: 'Budget tracker app', role: 'Solo developer and designer',
    summary: 'A budget tracker that helps young families see where their money goes, in one tap.',
    stack: 'React Native, Expo, SQLite, Supabase', tags: ['Mobile app', 'Open source'], live: 'https://pocketwise.app',
    src: 'https://github.com/vie/pocketwise', started: '2026-01', finished: '2026-04', featured: true,
    story: [
      '<h2>The problem</h2>',
      '<p>Most budgeting apps ask for <strong>twenty minutes of setup</strong> before showing anything useful, so people give up in the first week.</p>',
      '<p>I talked to eight young parents in Jakarta. Almost all of them wanted the same thing:</p>',
      '<blockquote>“Just tell me if we can afford dinner out this weekend.”</blockquote>',
      '<h2>What I did</h2>',
      '<p>I designed a one-tap setup and built the app around three ideas:</p>',
      '<ul><li><strong>Learn, don’t ask.</strong> Categories are guessed from the first ten expenses.</li><li><strong>Offline first.</strong> Everything works on patchy mobile data and syncs later.</li><li><strong>One number.</strong> The home screen shows only what is <em>left to spend</em> this week.</li></ul>',
      figure('g4.jpg', 'Early sketch of the one-tap setup, before any code.'),
      '<h3>Syncing without a signal</h3>',
      '<p>Each expense is saved on the phone first, then sent to <code>Supabase</code> when the connection comes back. Clashes are rare, so the newest change simply wins:</p>',
      code('ts', 'await db.expenses.put(expense)\nqueue.push({ id: expense.id, updatedAt: Date.now() })\nif (navigator.onLine) sync.flush()'),
      '<aside class="callout" data-kind="tip"><p>The sync engine is open source — <a href="https://github.com/vie/pocketwise">read the code on GitHub</a>.</p></aside>',
      '<h2>The result</h2>',
      stat('40%', 'faster onboarding, and 8,000 downloads in the first three months.'),
      table(['', 'Before', 'After'], [['Time to first budget', '11 min', '45 sec'], ['Still using it after a week', '22%', '48%']]),
      '<hr>',
      '<h2>Screenshots</h2>',
      gallery('g1', 'g2', 'g3'),
    ].join('\n'),
  },
  {
    slug: 'laju', title: 'Laju', cover: 'p-laju.jpg', kind: 'Delivery route planner', role: 'Backend lead in a team of four',
    summary: 'Route planning for a courier fleet that turns a messy order list into clear daily routes.',
    stack: 'Go, PostgreSQL, PostGIS, React', tags: ['Web app', 'Backend'], live: '', src: '', started: '2025-03', finished: '2025-10', featured: true,
    story: [
      '<h2>The problem</h2>',
      '<p>Dispatchers planned <strong>300 deliveries a day</strong> by hand in spreadsheets, and drivers crossed the city twice.</p>',
      '<h2>What I did</h2>',
      '<p>I built the routing service and a simple map view for dispatchers, with routes ready by 7 a.m. every day.</p>',
      '<ul><li>Grouped stops by neighbourhood using <code>PostGIS</code>.</li><li>Ordered each route to avoid the worst traffic hours.</li><li>Let dispatchers drag a stop to another van and see the new arrival time at once.</li></ul>',
      '<h2>The result</h2>',
      stat('18%', 'shorter delivery times and two hours saved per dispatcher each day.'),
      '<h2>Screenshots</h2>',
      gallery('g4', 'g5', 'g1'),
    ].join('\n'),
  },
  {
    slug: 'kanal', title: 'Kanal', cover: 'p-kanal.jpg', kind: 'Open-source chat toolkit', role: 'Creator and maintainer',
    summary: 'A small toolkit that adds real-time chat to any website in about ten lines of code.',
    stack: 'TypeScript, WebSockets, Redis, Cloudflare', tags: ['Open source', 'Backend'], live: '', src: 'https://github.com/vie/kanal', started: '2024-01', finished: '2025-06', featured: true,
    story: [
      '<h2>The problem</h2>',
      '<p>Small teams wanted live chat without paying for a large platform or running complex servers.</p>',
      '<h2>What I did</h2>',
      '<p>I wrote the core library, a hosted demo and <em>friendly</em> docs, then grew a community of contributors.</p>',
      '<h3>Two lines to get started</h3>',
      code('js', 'const chat = kanal.connect("room-42")\nchat.on("message", render)'),
      '<h2>The result</h2>',
      stat('2.1k', 'GitHub stars and 60 contributors from 14 countries.'),
      '<h2>Screenshots</h2>',
      gallery('g3', 'g6', 'g4'),
    ].join('\n'),
  },
  {
    slug: 'sehat', title: 'Sehat Clinic', cover: 'p-sehat.jpg', kind: 'Clinic booking website', role: 'Full-stack developer',
    summary: 'Online booking for a family clinic, so patients can pick a time without calling.',
    stack: 'Next.js, Node.js, PostgreSQL, WhatsApp API', tags: ['Web app'], live: 'https://sehatclinic.id', src: '', started: '2024-06', finished: '2024-09', featured: true,
    story: [
      '<h2>The problem</h2>',
      '<p>Phone lines were busy all morning and <strong>one in four</strong> booked patients never showed up.</p>',
      '<h2>What I did</h2>',
      '<p>I built a booking site with reminders by WhatsApp and a simple screen for front-desk staff. A visit now goes like this:</p>',
      '<ol><li>The patient picks a doctor and an open time.</li><li>A WhatsApp message confirms the booking.</li><li>A reminder goes out the evening before, with a one-tap way to cancel.</li><li>Front-desk staff see the day’s list and who has checked in.</li></ol>',
      '<aside class="callout" data-kind="warn"><p>Patient details stay on the clinic’s own server. Reminders only include the time and the doctor’s name.</p></aside>',
      '<h2>The result</h2>',
      stat('32%', 'fewer missed appointments in the first two months.'),
      '<h2>Screenshots</h2>',
      gallery('g5', 'g2', 'g6'),
    ].join('\n'),
  },
  {
    slug: 'arsip', title: 'Arsip', cover: 'p-arsip.jpg', kind: 'Library search engine', role: 'Contract engineer',
    summary: 'A fast search for a library archive, including scanned pages that could not be searched before.',
    stack: 'Python, Elasticsearch, Tesseract, Vue', tags: ['Data', 'Web app'], live: '', src: '', started: '2023-02', finished: '2023-11', featured: false,
    story: [
      '<h2>The problem</h2>',
      '<p>Researchers waited up to a minute for each search, and many old scans were not searchable at all.</p>',
      '<h2>What I did</h2>',
      '<p>I set up text recognition for old scans and a new search index with typo-friendly results.</p>',
      '<ul><li>Old typed and handwritten pages are read with <code>Tesseract</code>.</li><li>A search for <em>batik</em> also finds <em>battik</em> and <em>bathik</em>.</li><li>Results are grouped by year and collection.</li></ul>',
      '<h2>The result</h2>',
      stat('12×', 'faster searches, now under a second for most queries.'),
      table(['', 'Before', 'After'], [['Average search', '9 s', '0.75 s'], ['Old scans you can search', '30%', '95%']]),
      '<h2>Screenshots</h2>',
      gallery('g6', 'g4', 'g3'),
    ].join('\n'),
  },
  {
    slug: 'mini-cms', title: 'This website', cover: 'p-cms.jpg', kind: 'Portfolio and mini CMS', role: 'Designer and developer',
    summary: 'My portfolio and the small editor I use to update it, with a safe view-only guest mode.',
    stack: 'Astro, TypeScript, SQLite, Caddy', tags: ['Web app', 'Open source'], live: '', src: 'https://github.com/vie/portfolio', started: '2026-01', finished: '', featured: false,
    story: [
      '<h2>The problem</h2>',
      '<p>I wanted to update my portfolio in minutes, without touching code, and let recruiters see how I build tools.</p>',
      '<h2>What I did</h2>',
      '<p>I built a small editor with drafts, previews and a safe guest mode that the server itself enforces.</p>',
      '<ul><li><strong>Rich text</strong> with headings, pictures, code, tables and callouts.</li><li><strong>Live preview</strong> side by side, on a phone or a computer.</li><li><strong>Guest mode</strong> so visitors can try it — the server refuses every save.</li></ul>',
      '<h2>The result</h2>',
      stat('5 min', 'from idea to a published project page.'),
      '<h2>Screenshots</h2>',
      gallery('g2', 'g1', 'g5'),
    ].join('\n'),
  },
  // sample drafts: the only unpublished work a guest is allowed to see
  ...[
    ['sample-draft-weather', 'Sample draft: Weather widget', 'A tiny weather widget, used to show what an unpublished project looks like.'],
    ['sample-draft-notes', 'Sample draft: Notes app', 'A notes app idea that is still a work in progress.'],
  ].map(([slug, title, summary]): SeedProject => ({
    slug: slug!, title: title!, summary: summary!, cover: 'g2.jpg', kind: 'Sample', role: 'Sample', stack: 'HTML, CSS', tags: ['Sample'], live: '', src: '',
    started: '2026-10', finished: '', featured: false, status: 'draft', sample: true,
    story: '<h2>Sample draft</h2><p>This is a sample draft so you can see what unpublished work looks like. Real drafts stay private.</p>',
  })),
];

export interface SeedOptions { ownerEmail: string; ownerPassword: string; assetsDir?: string; uploadDir: string }

export function seed(d: Db, o: SeedOptions): { projects: number; skipped: boolean } {
  const empty = (d.prepare('SELECT COUNT(*) n FROM projects').get() as { n: number }).n === 0;
  const hasOwner = (d.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n > 0;
  if (!hasOwner) {
    d.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(o.ownerEmail.toLowerCase(), hashPassword(o.ownerPassword), Date.now());
  }
  if (!empty) return { projects: 0, skipped: true };

  const assets = resolve(o.assetsDir ?? './seed-assets');
  mkdirSync(o.uploadDir, { recursive: true });
  const media = new Map<string, number>();
  const addMedia = (file: string): number => {
    const known = media.get(file);
    if (known) return known;
    copyFileSync(resolve(assets, file), resolve(o.uploadDir, file));
    const mime = file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    const r = d.prepare('INSERT INTO media (filename, original_name, mime, bytes, alt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(file, file, mime, statSync(resolve(assets, file)).size, ALT[file] ?? '', Date.now());
    media.set(file, Number(r.lastInsertRowid));
    return Number(r.lastInsertRowid);
  };

  tx(d, () => {
    for (const f of Object.keys(ALT)) addMedia(f);
    const now = Date.now();
    PROJECTS.forEach((p, i) => {
      const status = p.status ?? 'published';
      d.prepare(`INSERT INTO projects (slug, title, summary, story_html, cover_media_id, kind, role, stack, tags, live_url, src_url, started, finished,
        featured, status, is_sample, position, created_at, updated_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(p.slug, p.title, p.summary, sanitizeStory(p.story), media.get(p.cover)!, p.kind, p.role, p.stack, JSON.stringify(p.tags), p.live, p.src,
          p.started, p.finished, p.featured ? 1 : 0, status, p.sample ? 1 : 0, i, now - (PROJECTS.length - i) * 3600_000, now - (PROJECTS.length - i) * 3600_000,
          status === 'published' ? now - (PROJECTS.length - i) * 3600_000 : null);
    });

    d.prepare(`INSERT INTO profile (id, name, headline, status_line, photo_media_id, about, location, email, skills, experience, links, cv_media_id, sections)
      VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'Muhamad Alvie',
      'Software engineer who builds fast, friendly web apps.',
      'Open to new projects from January 2027',
      media.get('portrait.jpg')!,
      "Based in Jakarta, I've spent seven years building products people use every day: banking dashboards, delivery tools, and small apps that just work. I enjoy the space where careful engineering meets good design: fast pages, clear interfaces, and code the next person can read. Outside work I mentor junior developers and contribute to open source.",
      'Jakarta, Indonesia',
      'hello@vie.dev',
      JSON.stringify([
        { group: 'Frontend', items: ['TypeScript', 'React', 'Next.js', 'Tailwind CSS', 'Accessibility'] },
        { group: 'Backend', items: ['Go', 'Node.js', 'PostgreSQL', 'Redis', 'REST & GraphQL'] },
        { group: 'Cloud', items: ['AWS', 'Docker', 'Terraform', 'GitHub Actions', 'Cloudflare'] },
        { group: 'Mobile', items: ['React Native', 'Expo', 'Offline-first sync'] },
      ]),
      JSON.stringify([
        { years: '2024 — Now', role: 'Senior Software Engineer', org: 'Northwind Labs', text: 'Lead the web platform team; cut page load times across the product by 40%.' },
        { years: '2021 — 2024', role: 'Software Engineer', org: 'Kopi Digital', text: 'Built the ordering app used by 120 coffee shops, from first sketch to launch.' },
        { years: '2019 — 2021', role: 'Frontend Developer', org: 'Freelance', text: 'Designed and shipped websites and dashboards for 14 small businesses.' },
        { years: '2018', role: 'Engineering Intern', org: 'Bandung Tech Hub', text: 'Wrote my first production code: an internal booking tool still in use today.' },
      ]),
      JSON.stringify([{ label: 'GitHub', url: 'https://github.com/vie' }, { label: 'LinkedIn', url: 'https://linkedin.com/in/vie' }]),
      media.get('cv-muhamad-alvie.pdf')!,
      JSON.stringify([
        { key: 'about', visible: true }, { key: 'featured', visible: true }, { key: 'skills', visible: true },
        { key: 'experience', visible: true }, { key: 'contact', visible: true },
      ]),
    );

    d.prepare('INSERT INTO settings (id, site_title, description, share_media_id, accent, default_theme, guest_enabled) VALUES (1,?,?,?,?,?,1)').run(
      'Muhamad Alvie — Software Engineer',
      'Software engineer who builds fast, friendly web apps. Based in Jakarta, Indonesia.',
      media.get('p-pocketwise.jpg')!, '#12805C', 'system',
    );
  });
  return { projects: PROJECTS.length, skipped: false };
}
