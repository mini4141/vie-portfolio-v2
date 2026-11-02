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
