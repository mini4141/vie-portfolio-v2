import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.ts';
import { hashPassword, verifyPassword } from './password.ts';

export type Role = 'visitor' | 'guest' | 'owner';
export interface Auth { role: Role; userId: number | null; email: string | null; expiresAt: number | null }
export const VISITOR: Auth = { role: 'visitor', userId: null, email: null, expiresAt: null };

export const SESSION_COOKIE = 'vie_session';
export const OWNER_TTL_MS = 7 * 24 * 3600_000;
export const GUEST_TTL_MS = 3600_000;
export const LOCK_MS = 15 * 60_000;
const IP_LIMIT = 5;      // wrong passwords per address before a 15 minute pause
const EMAIL_LIMIT = 20;  // backstop against distributed guessing without letting one stranger lock the owner out

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** The cookie holds a random token; the database only stores its hash, so a leaked DB cannot be replayed. */
export function createSession(role: 'owner' | 'guest', userId: number | null): { token: string; expiresAt: number; maxAge: number } {
  const ttl = role === 'owner' ? OWNER_TTL_MS : GUEST_TTL_MS;
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db().prepare('INSERT INTO sessions (id, role, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(sha(token), role, userId, now, now + ttl);
  return { token, expiresAt: now + ttl, maxAge: Math.floor(ttl / 1000) };
}

export function resolveSession(token: string | undefined): Auth {
  if (!token) return VISITOR;
  const r = db().prepare(`SELECT s.role, s.user_id, s.expires_at, u.email FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(sha(token)) as
    | { role: 'owner' | 'guest'; user_id: number | null; expires_at: number; email: string | null } | undefined;
  if (!r) return VISITOR;
  if (r.expires_at <= Date.now()) { destroySession(token); return VISITOR; }
  return { role: r.role, userId: r.user_id, email: r.role === 'owner' ? r.email : null, expiresAt: r.expires_at };
}

export function destroySession(token: string | undefined): void {
  if (token) db().prepare('DELETE FROM sessions WHERE id = ?').run(sha(token));
}

/* ---------- sign-in throttling ---------- */

interface Attempt { fails: number; locked_until: number }
const keys = (ip: string, email: string) => [
  { key: `ip:${ip}`, limit: IP_LIMIT },
  { key: `email:${email.toLowerCase()}`, limit: EMAIL_LIMIT },
];
function attempt(key: string): Attempt {
  const r = db().prepare('SELECT fails, locked_until FROM login_attempts WHERE key = ?').get(key) as Attempt | undefined;
  if (!r) return { fails: 0, locked_until: 0 };
  return r.locked_until !== 0 && r.locked_until <= Date.now() ? { fails: 0, locked_until: 0 } : r;
}

/** Seconds left on a lock, or 0 when sign-in is allowed. */
export function lockedFor(ip: string, email: string): number {
  const until = Math.max(...keys(ip, email).map((k) => attempt(k.key).locked_until));
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

/** Records a wrong password; returns how many tries remain on the stricter (per-address) counter. */
export function recordFailure(ip: string, email: string): number {
  let left = IP_LIMIT;
  for (const { key, limit } of keys(ip, email)) {
    const a = attempt(key), fails = a.fails + 1, lock = fails >= limit ? Date.now() + LOCK_MS : 0;
    db().prepare(`INSERT INTO login_attempts (key, fails, locked_until) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until`).run(key, lock ? 0 : fails, lock);
    if (key.startsWith('ip:')) left = lock ? 0 : limit - fails;
  }
  return left;
}

export function clearFailures(ip: string, email: string): void {
  for (const { key } of keys(ip, email)) db().prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
}

/* ---------- credential check ---------- */

// verifying against a dummy hash for unknown emails keeps response time similar
const DUMMY_HASH = hashPassword('not-a-real-password');

export function checkCredentials(email: string, password: string): { id: number; email: string } | null {
  const u = db().prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
    | { id: number; email: string; password_hash: string } | undefined;
  const ok = verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  return u && ok ? { id: u.id, email: u.email } : null;
}

/* ---------- change password ---------- */

export const MIN_PASSWORD = 10;

export type PasswordChange = { ok: true } | { ok: false; status: number; error: string; message: string };

/** Verifies the current password, stores the new hash and signs out every other session of this user. */
export function changePassword(userId: number, current: string, next: string, keepToken: string | undefined): PasswordChange {
  if (next.length < MIN_PASSWORD) return { ok: false, status: 400, error: 'too_short', message: `Use at least ${MIN_PASSWORD} characters for the new password.` };
  if (next.length > 200) return { ok: false, status: 400, error: 'too_long', message: 'That password is too long (200 characters at most).' };
  if (next === current) return { ok: false, status: 400, error: 'same', message: 'The new password must be different from the current one.' };
  const u = db().prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  if (!u || !verifyPassword(current, u.password_hash)) return { ok: false, status: 403, error: 'wrong_password', message: 'The current password is not right.' };
  db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), userId);
  db().prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, keepToken ? sha(keepToken) : '');
  return { ok: true };
}
