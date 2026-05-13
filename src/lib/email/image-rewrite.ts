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
//   - serves through Supabase's edge CDN (cached worldwide)
//   - auto-resizes to a target width
//   - negotiates WebP for clients that support it (~40% smaller)
//   - returns 200 OK in milliseconds vs 1-3s for cold origin reads
//
// We rewrite every Storage URL we find in outbound email HTML to the
// transform endpoint at render time. New uploads return the
// transform URL already; this helper covers templates that were
// built before the upload route was updated.
//
// Width defaults to 600px because that's the standard email canvas
// width — bigger doesn't help (clients downscale anyway) and quality
// 80% matches what most marketing platforms use as the sweet spot.
// =============================================

const SUPABASE_STORAGE_OBJECT_RE =
  /https:\/\/([a-z0-9-]+)\.supabase\.co\/storage\/v1\/object\/public\/([^"'\s)]+)/gi;

interface RewriteOptions {
  width?: number;
  quality?: number;
}

export function rewriteImagesForEmail(html: string, opts: RewriteOptions = {}): string {
  if (!html) return html;
  const width = opts.width || 600;
  const quality = opts.quality || 80;

  return html.replace(SUPABASE_STORAGE_OBJECT_RE, (_match, projectRef: string, path: string) => {
    // Skip if there's already a query string targeting transform.
    if (path.includes('?width=') || path.includes('&width=')) {
      return `https://${projectRef}.supabase.co/storage/v1/object/public/${path}`;
    }
    // Strip any existing query string and rebuild with transform params.
    const [cleanPath] = path.split('?');
    return `https://${projectRef}.supabase.co/storage/v1/render/image/public/${cleanPath}?width=${width}&quality=${quality}`;
  });
}
