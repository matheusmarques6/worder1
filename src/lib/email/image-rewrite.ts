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
// At send time every storage URL in the HTML — Supabase host or CDN
// host, /object or /render path — is normalised to the canonical
// form from src/lib/media/public-url.ts:
//   https://<CDN_IMAGES_DOMAIN>/storage/v1/render/image/public/<bucket>/<file>?width&quality
// for raster images, and the /object path (still on the CDN host) for
// SVG and GIF, which the transformer does not process.
//
// New uploads already return the canonical URL; this pass covers
// templates built before the upload routes were unified, and re-sizes
// to the 600px email canvas (editor URLs are stored at 1200px for
// retina previews — bigger doesn't help in the inbox, clients
// downscale anyway; quality 80 is the usual marketing sweet spot).
// =============================================

import { rewriteStorageUrls } from '@/lib/media/public-url';

interface RewriteOptions {
  width?: number;
  quality?: number;
}

export function rewriteImagesForEmail(html: string, opts: RewriteOptions = {}): string {
  if (!html) return html;
  return rewriteStorageUrls(html, {
    width: opts.width || 600,
    quality: opts.quality || 80,
  });
}
