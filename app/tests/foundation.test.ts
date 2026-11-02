import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open, migrate } from '../src/lib/db.ts';
import { seed } from '../src/lib/seed.ts';
import { hashPassword, verifyPassword } from '../src/lib/password.ts';
import { sanitizeStory } from '../src/lib/sanitize.ts';
import { slugify, dateRange, safeUrl } from '../src/lib/text.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'vie-'));

test('migrations apply once and are idempotent', () => {
  const d = open(':memory:');
  assert.deepEqual(migrate(d), []);
  const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const t of ['users', 'sessions', 'projects', 'profile', 'settings', 'media', 'login_attempts']) assert.ok(tables.includes(t), t);
});

test('seed fills an empty db once, never overwrites', () => {
  const dir = tmp();
  const d = open(':memory:');
  const first = seed(d, { ownerEmail: 'Owner@Example.com', ownerPassword: 'correct horse', uploadDir: join(dir, 'up') });
  assert.equal(first.projects, 8);
  assert.equal((d.prepare("SELECT COUNT(*) n FROM projects WHERE status='published'").get() as { n: number }).n, 6);
  assert.equal((d.prepare('SELECT COUNT(*) n FROM projects WHERE is_sample=1').get() as { n: number }).n, 2);
  assert.equal((d.prepare('SELECT email FROM users').get() as { email: string }).email, 'owner@example.com');
  assert.ok(existsSync(join(dir, 'up', 'p-pocketwise.jpg')));
  d.prepare("UPDATE projects SET title='Edited' WHERE slug='laju'").run();
  assert.equal(seed(d, { ownerEmail: 'x@y.z', ownerPassword: 'another one!', uploadDir: join(dir, 'up') }).skipped, true);
  assert.equal((d.prepare("SELECT title FROM projects WHERE slug='laju'").get() as { title: string }).title, 'Edited');
});

test('foreign keys are enforced', () => {
  const d = open(':memory:');
  assert.throws(() => d.prepare("INSERT INTO sessions (id, role, user_id, created_at, expires_at) VALUES ('s','owner',999,1,2)").run());
});

test('password hashing: salted, verifiable, rejects wrong input', () => {
  const a = hashPassword('s3cret-pass'), b = hashPassword('s3cret-pass');
  assert.notEqual(a, b);
  assert.ok(!a.includes('s3cret'));
  assert.ok(verifyPassword('s3cret-pass', a));
  assert.ok(!verifyPassword('wrong', a));
  assert.ok(!verifyPassword('x', 'garbage'));
});

test('sanitizer keeps editor blocks and strips anything dangerous', () => {
  const clean = sanitizeStory(
    '<h2 onclick="x()">Hi</h2><script>alert(1)</script><p>ok <a href="javascript:alert(1)">bad</a> <a href="https://e.com">good</a></p>' +
    '<img src="/media/a.jpg" onerror="x()" alt="a"><blockquote class="stat evil"><strong>40%</strong> up</blockquote><iframe src="//x"></iframe>' +
    '<aside class="callout" data-kind="tip"><p>n</p></aside><div style="position:fixed" class="shots">x</div>',
  );
  assert.ok(!/script|onclick|onerror|javascript:|iframe|style=/i.test(clean), clean);
  assert.ok(clean.includes('<h2>Hi</h2>') && clean.includes('class="stat"') && !clean.includes('evil'));
  assert.ok(clean.includes('href="https://e.com"') && clean.includes('rel="noopener noreferrer"'));
  assert.ok(clean.includes('data-kind="tip"') && clean.includes('class="shots"') && clean.includes('src="/media/a.jpg"'));
});

test('text helpers', () => {
  assert.equal(slugify('  Sehat Clinic — v2!  '), 'sehat-clinic-v2');
  assert.equal(slugify('###'), 'untitled');
  assert.equal(dateRange('2026-01', '2026-04'), 'Jan — Apr 2026');
  assert.equal(dateRange('2025-03', '2026-01'), 'Mar 2025 — Jan 2026');
  assert.equal(dateRange('2026-01', ''), 'Jan 2026 — now');
  assert.equal(dateRange('', ''), '');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('//evil.com'), '');
  assert.equal(safeUrl('https://ok.dev/x'), 'https://ok.dev/x');
});
