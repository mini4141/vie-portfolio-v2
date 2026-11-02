import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DB_PATH = resolve(process.env.DB_PATH ?? './data/app.db');
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? './data/uploads');
const MIGRATIONS_DIR = resolve(process.env.MIGRATIONS_DIR ?? './migrations');

export type Db = DatabaseSync;

export function migrate(db: Db, dir = MIGRATIONS_DIR): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => String(r.name)));
  const ran: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(resolve(dir, f), 'utf8'));
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(f, Date.now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
    ran.push(f);
  }
  return ran;
}

export function open(path = DB_PATH): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

let shared: Db | undefined;
/** One connection per process; SQLite in WAL mode handles our traffic comfortably. */
export function db(): Db {
  return (shared ??= open());
}

/** Run fn in a transaction; rolls back if it throws. */
export function tx<T>(d: Db, fn: () => T): T {
  d.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
