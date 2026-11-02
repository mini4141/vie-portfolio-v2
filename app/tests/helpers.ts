import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from '../src/lib/db.ts';
import { seed } from '../src/lib/seed.ts';

export const OWNER = { email: 'owner@test.dev', password: 'owner-password-123' };

export interface TestServer {
  base: string;
  dir: string;
  dbPath: string;
  stop(): Promise<void>;
  /** fetch relative to base; never follows redirects so tests can assert them */
  req(path: string, init?: RequestInit & { cookie?: string }): Promise<Response>;
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

/** Seeds a throw-away database and boots the *built* app (run `npm run build` first). */
export async function startServer(env: Record<string, string> = {}): Promise<TestServer> {
  if (!existsSync('dist/server/entry.mjs')) throw new Error('dist/ missing — run `npm run build` first');
  const dir = mkdtempSync(join(tmpdir(), 'vie-e2e-'));
  const dbPath = join(dir, 'app.db'), uploadDir = join(dir, 'uploads');
  const d = open(dbPath);
  seed(d, { ownerEmail: OWNER.email, ownerPassword: OWNER.password, uploadDir });
  d.close();

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(process.execPath, ['dist/server/entry.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: dbPath, UPLOAD_DIR: uploadDir, SITE_URL: base, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout?.on('data', (b) => (log += b));
  child.stderr?.on('data', (b) => (log += b));

  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/robots.txt')).ok) break; } catch { /* not up yet */ }
    if (child.exitCode !== null) throw new Error('server exited early:\n' + log);
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error('server did not start:\n' + log);
  }

  return {
    base, dir, dbPath,
    async stop() {
      child.kill();
      await new Promise((r) => (child.exitCode !== null ? r(null) : child.once('exit', r)));
      rmSync(dir, { recursive: true, force: true });
    },
    req(path, init = {}) {
      const { cookie, headers, ...rest } = init;
      return fetch(base + path, { redirect: 'manual', ...rest, headers: { ...(cookie ? { cookie } : {}), ...(headers as Record<string, string>) } });
    },
  };
}
