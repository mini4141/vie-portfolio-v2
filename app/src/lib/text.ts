export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function slugify(s: string): string {
  return (
    s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled'
  );
}

/** Month value "2026-04" → "Apr 2026". */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(v: string): { m: number; y: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? { y: m[1]!, m: Number(m[2]) - 1 } : null;
}
export function dateRange(start: string, end: string): string {
  const a = fmt(start), b = fmt(end);
  if (!a) return '';
  if (!b) return `${MON[a.m]} ${a.y} — now`;
  if (a.y === b.y && a.m === b.m) return `${MON[a.m]} ${a.y}`;
  return a.y === b.y ? `${MON[a.m]} — ${MON[b.m]} ${a.y}` : `${MON[a.m]} ${a.y} — ${MON[b.m]} ${b.y}`;
}

export function safeUrl(u: string): string {
  const v = u.trim();
  return /^(https?:\/\/|mailto:|\/(?!\/))/i.test(v) ? v : '';
}

export function parseJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** "12 minutes ago", "Yesterday", "3 days ago" … for admin lists. */
export function relTime(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}

/** Compact form for stat tiles: "now", "12m", "5h", "3d", "3w", "4mo". */
export function relShort(then: number, now = Date.now()): string {
  const m = Math.floor(Math.max(0, now - then) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d`;
  return d < 60 ? `${Math.floor(d / 7)}w` : `${Math.floor(d / 30)}mo`;
}
