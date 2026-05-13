// =============================================
// Apple Mail Privacy Protection (MPP) detection
//
// MPP pre-fetches every image in every email the moment it's
// delivered to the user's Apple Mail client (iOS Mail, Mac Mail,
// AppleMail.app). The pixel fires whether or not the human ever
// actually opens the message — so counting MPP "opens" as engagement
// inflates open rates by 30-50% and, worse, hands attribution to
// emails the recipient never read.
//
// Klaviyo and Mailchimp both detect MPP server-side at the pixel
// and store it in a parallel column so dashboards can show "real
// opens" by default while still preserving the raw signal.
//
// Detection signals, ranked by reliability:
//
//   1. Source IP in Apple's range. Apple's MPP proxy hits the
//      pixel from 17.0.0.0/8 (a /8 they own end-to-end — no other
//      tenants). Anything from 17.x.x.x is Apple infrastructure,
//      and in practice only the MPP proxy fetches our pixels.
//
//   2. User-Agent shape. The proxy normalises every request to
//      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5)
//       AppleWebKit/605.1.15 (KHTML, like Gecko)"
//      — an exact, fixed string we can match. Less reliable
//      because some Apple Mail.app installs hit the pixel directly
//      with the same UA, so this signal alone catches manual reads
//      from the same setup. We only trust this when paired with
//      the absence of a Referer header (proxies strip it; manual
//      reads via a webview keep it).
//
//   3. Time-since-send. MPP fetches within seconds of delivery,
//      typically <5s after sent_at. Humans rarely open that fast.
//      Useful as a tiebreaker when IP/UA are ambiguous (e.g.,
//      requests coming through Cloudflare where the original IP
//      is lost in x-forwarded-for parsing edge cases).
// =============================================

const APPLE_MPP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko)';

function extractClientIp(headers: Headers): string {
  // x-forwarded-for is a comma list; the original client IP is the
  // first entry on Vercel. x-real-ip is set by some CDNs. cf-connecting-ip
  // is Cloudflare's, which Vercel passes through when proxied via CF.
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('true-client-ip') ||
    ''
  );
}

export interface MppDetectionInput {
  headers: Headers;
  sentAt?: string | Date | null;
}

export interface MppDetectionResult {
  isMpp: boolean;
  reason: 'apple_ip' | 'apple_ua_no_referer' | 'instant_fetch' | null;
  clientIp: string;
}

export function detectMpp({ headers, sentAt }: MppDetectionInput): MppDetectionResult {
  const clientIp = extractClientIp(headers);

  // Strongest signal: anything from 17.0.0.0/8 is Apple-owned and in
  // practice only the MPP proxy reaches our open pixel from there.
  if (clientIp.startsWith('17.')) {
    return { isMpp: true, reason: 'apple_ip', clientIp };
  }

  // Apple's exact normalised User-Agent + no Referer is the
  // signature when the IP can't be parsed (e.g., behind a non-Apple
  // CDN that drops 17.x). We require BOTH because a manual read in
  // Apple Mail.app produces the same UA but typically retains
  // tracking headers.
  const ua = headers.get('user-agent') || '';
  const referer = headers.get('referer');
  if (ua === APPLE_MPP_UA && !referer) {
    return { isMpp: true, reason: 'apple_ua_no_referer', clientIp };
  }

  // Time heuristic. Apple MPP almost always fires within 10s of
  // delivery; we use a conservative 5s threshold so legit fast
  // openers (push notification → open) on a slow mobile network
  // aren't misclassified.
  if (sentAt) {
    const sentMs = typeof sentAt === 'string' ? Date.parse(sentAt) : sentAt.getTime();
    if (Number.isFinite(sentMs) && Date.now() - sentMs < 5_000) {
      return { isMpp: true, reason: 'instant_fetch', clientIp };
    }
  }

  return { isMpp: false, reason: null, clientIp };
}
