/**
 * Client-side gate for the "Agentes de IA" UI redesign (mockup → app migration).
 *
 * The redesign is rolled out screen-by-screen. While it is being reviewed on the
 * development branch the new visual is ON by default; the legacy UI is still one
 * query param away so the two can be compared side by side.
 *
 * Resolution order (first match wins):
 *   1. URL query `?v=1` forces the legacy UI, `?v=2` forces the redesign
 *   2. localStorage key `agentsRedesign` ("1" | "0")
 *   3. default: ON (redesign)
 *
 * NOTE: flip DEFAULT_ON back to `false` before promoting to production if a
 * gradual rollout is desired. Server-side org rollout
 * (organizations.feature_flags.agentsRedesign) is handled separately by
 * `@/lib/feature-flags`; this helper governs only the purely-visual client gate
 * so it stays synchronous and dependency-free.
 */

const STORAGE_KEY = 'agentsRedesign';
const DEFAULT_ON = true;

/** Minimal shape shared by URLSearchParams and Next's ReadonlyURLSearchParams. */
type ReadableParams = { get(key: string): string | null }

export function isAgentsRedesignEnabled(searchParams?: ReadableParams | null): boolean {
  // 1. URL param wins so either UI can be forced per-request.
  const v = searchParams?.get('v');
  if (v === '2') return true;
  if (v === '1') return false;

  // 2. Persisted opt-in/out (e.g. set once during internal testing).
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      // localStorage may be unavailable (SSR / privacy mode) — fall through.
    }
  }

  // 3. Default.
  return DEFAULT_ON;
}
