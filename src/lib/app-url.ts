// =============================================
// Canonical app base URL helper for outbound links
// (open-pixel, click-tracker, unsubscribe, webhooks).
//
// Email clients drop relative URLs and Gmail's image proxy refuses to
// fetch from invented hostnames, so getting this wrong means every
// open and every click is silently dropped — the metrics dashboard
// then sits at 0% even though the recipient really did read and
// click. We pick the URL once, in priority order, and refuse to ship
// anything that isn't a valid absolute https origin.
// =============================================

const FALLBACK_URL = 'https://app.worder.com.br';

function normalize(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;
  // Vercel exposes VERCEL_URL without a scheme.
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    // Strip trailing slash so callers can always do `${base}/api/...`.
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Returns the canonical https origin for this deployment, suitable
 * for use as the host portion of email tracking URLs, webhook
 * callback URLs, and any other link that needs to round-trip back to
 * the app from an external client.
 *
 * Priority: NEXT_PUBLIC_APP_URL → VERCEL_URL → hardcoded production.
 * Never returns an empty string or a relative path.
 */
export function getAppBaseUrl(): string {
  return (
    normalize(process.env.NEXT_PUBLIC_APP_URL) ||
    normalize(process.env.VERCEL_URL) ||
    FALLBACK_URL
  );
}
