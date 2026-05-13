// =============================================
// Email image URL rewrite
//
// Direct Supabase Storage URLs (/storage/v1/object/public/...) go
// straight to origin — no CDN, no resizing, no format negotiation.
// Gmail's image proxy fetches every URL once and gives up after a
// few seconds; on mobile that timeout is shorter and the recipient
// sees a broken image icon. Resend's own preview rendering doesn't
// hit the same path so the issue is invisible from the dashboard.
//
// Supabase exposes a parallel /storage/v1/render/image/public/...
// endpoint that:
//   - serves through Supabase's edge cache (cached worldwide)
//   - auto-resizes to a target width
//   - negotiates WebP for clients that support it (~40% smaller)
//   - returns 200 OK in milliseconds vs 1-3s for cold origin reads
//
// When CDN_IMAGES_DOMAIN is set (e.g. "cdn.worder.com.br"), we also
// swap the host. The CDN domain is a Cloudflare-proxied CNAME
// pointing at the Supabase project; every fetch comes off
// Cloudflare's 300+ PoPs with 95%+ cache hit rate, so the
// transform endpoint is hit at most once per unique image even
// at scale. Falls back to the Supabase host when the env var is
// missing or blank.
//
// We rewrite every Storage URL we find in outbound email HTML to
// the transform endpoint at render time. New uploads return the
// CDN URL already; this helper covers templates that were built
// before the upload route was updated.
//
// Width defaults to 600px because that's the standard email canvas
// width — bigger doesn't help (clients downscale anyway) and quality
// 80% matches what most marketing platforms use as the sweet spot.
// =============================================

const SUPABASE_STORAGE_OBJECT_RE =
  /https:\/\/([a-z0-9-]+)\.supabase\.co\/storage\/v1\/object\/public\/([^"'\s)]+)/gi;

// Also catch URLs that were already rewritten to /render/image/ —
// when CDN_IMAGES_DOMAIN flips on, the host needs to swap on those
// too so legacy templates pick up the CDN automatically.
const SUPABASE_RENDER_RE =
  /https:\/\/([a-z0-9-]+)\.supabase\.co\/storage\/v1\/render\/image\/public\/([^"'\s)]+)/gi;

interface RewriteOptions {
  width?: number;
  quality?: number;
}

function cdnHost(): string | null {
  const raw = process.env.CDN_IMAGES_DOMAIN;
  if (!raw) return null;
  // Strip protocol if the env var was set with one — Vercel users
  // sometimes copy the URL whole. Strip trailing slashes too.
  const clean = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
  return clean || null;
}

export function rewriteImagesForEmail(html: string, opts: RewriteOptions = {}): string {
  if (!html) return html;
  const width = opts.width || 600;
  const quality = opts.quality || 80;
  const cdn = cdnHost();

  function buildTransformUrl(projectRef: string, cleanPath: string): string {
    const host = cdn || `${projectRef}.supabase.co`;
    return `https://${host}/storage/v1/render/image/public/${cleanPath}?width=${width}&quality=${quality}`;
  }

  // First pass: /object/public/ → /render/image/ + CDN host
  let result = html.replace(SUPABASE_STORAGE_OBJECT_RE, (_match, projectRef: string, path: string) => {
    const [cleanPath] = path.split('?');
    return buildTransformUrl(projectRef, cleanPath);
  });

  // Second pass: already-transformed URLs get the CDN host swap if
  // one is configured. No-op when CDN_IMAGES_DOMAIN is unset.
  if (cdn) {
    result = result.replace(SUPABASE_RENDER_RE, (match, projectRef: string, path: string) => {
      // Skip if it's already on the CDN host (shouldn't match the
      // regex anyway, but defensive).
      if (match.includes(cdn)) return match;
      return `https://${cdn}/storage/v1/render/image/public/${path}`;
    });
  }

  return result;
}
