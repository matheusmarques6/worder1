/**
 * Client-side gate for the "Agentes de IA" UI redesign (mockup → app migration).
 *
 * The redesign is rolled out screen-by-screen. Until a screen is promoted,
 * its new visual lives behind this flag so production keeps the current UI.
 *
 * Resolution order (first match wins):
 *   1. URL query `?v=2` (explicit opt-in / opt-out via `?v=1`)
 *   2. localStorage key `agentsRedesign` ("1" | "0")
 *   3. default: off
 *
 * Server-side org rollout (organizations.feature_flags.agentsRedesign) is
 * handled separately by `@/lib/feature-flags`; this helper only governs the
 * purely-visual client gate so it stays synchronous and dependency-free.
 */

const STORAGE_KEY = 'agentsRedesign';

export function isAgentsRedesignEnabled(searchParams?: URLSearchParams | null): boolean {
  // 1. URL param wins so a screen can be previewed/forced per-request.
  const v = searchParams?.get('v');
  if (v === '2') return true;
  if (v === '1') return false;

  // 2. Persisted opt-in (e.g. set once during internal testing).
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      // localStorage may be unavailable (SSR / privacy mode) — fall through.
    }
  }

  // 3. Default: current UI.
  return false;
}
