/**
 * Security headers for every page and API response.
 * No inline scripts exist (theme/admin/site code are files), so script-src is 'self' only.
 * Styles keep 'unsafe-inline' for the accent-colour <style> and style="" attributes: low risk, no script execution.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(https: boolean): Record<string, string> {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...(https ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}

export function withSecurityHeaders(res: Response, https: boolean): Response {
  const h = securityHeaders(https);
  try {
    for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
    return res;
  } catch { // redirects built by some APIs have immutable headers
    const copy = new Response(res.body, res);
    for (const [k, v] of Object.entries(h)) copy.headers.set(k, v);
    return copy;
  }
}
