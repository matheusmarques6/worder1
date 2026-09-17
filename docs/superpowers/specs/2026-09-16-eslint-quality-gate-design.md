# ESLint Quality Gate Design

Date: 2026-09-16

## Context

The project had ESLint and eslint-config-next installed, but no configuration.
The lint script therefore opened Next.js' interactive first-run setup instead
of analyzing the repository. The approved minimal configuration,
next/core-web-vitals, made the real baseline observable:

- 112 errors in 23 files.
- 161 warnings.
- 273 findings across 118 files.
- Raw JSON evidence:
  .superpowers/sdd/2026-09-08-auditoria-ia-accepted-trace-transport/eslint-initial-567240.json
- Raw evidence SHA-256:
  27fd7ecf744870612f06b9ff8ba4bbccb7e63a5cec6ba48fb18de88f6a13058c
- Durable inventory:
  docs/audits/2026-09-16-eslint-quality-catalog.md

ESLint severity is not the same as product risk. Five blocking errors reveal
real Rules of Hooks violations, while 75 non-blocking dependency warnings can
cause stale tenant/store data, duplicated requests, reset polling, or render
loops. Both groups are in scope.

## Goal

Create a deterministic, versioned Next.js lint gate with zero errors and zero
warnings, fix every finding without weakening system boundaries, and leave
focused regression evidence for behavior-sensitive changes.

## Non-goals

- No global rule disable.
- No wildcard image hostname.
- No Next.js, React, TypeScript, or ESLint upgrade.
- No new lint dependency solely to preserve obsolete suppression comments.
- No unrelated formatting, component redesign, API change, database change,
  Docker change, remote mutation, push, or deployment.
- No attempt to replace the existing test, typecheck, build, database, or
  runtime gates; lint is an additional gate.

## Binding system invariants

1. Tenant and store identity
   - Effects and callbacks must continue using the current organization,
     store, conversation, contact, or account identity.
   - A closure fix must never fall back to the first tenant/store or preserve
     stale identity after an A-to-B switch.

2. Request and subscription lifecycle
   - Initial loads remain exactly once per semantic identity.
   - A state update made by a loader must not retrigger the same loader unless
     the input identity actually changed.
   - Pollers, timers, and realtime channels keep one live instance and clean
     it up on identity change or unmount.

3. React hook order
   - Hooks execute in the same order on every render.
   - Functions named as hooks are real hooks; ordinary actions use action
     names.
   - Store subscriptions are not duplicated when the same value is already
     available in the parent.

4. Media and security
   - next/image is used only for trusted, supported origins and known layout
     constraints.
   - User-entered, blob, data, Meta, WhatsApp, or otherwise unbounded URLs
     remain native img elements with a precise line-local explanation.
   - No hostname wildcard is added to next.config.js.
   - Every meaningful image has an accessible alternative; decorative images
     use an empty alternative.

5. Visual and copy preservation
   - JSX entity fixes preserve the exact rendered text.
   - Image conversions preserve size, object-fit, aspect ratio, loading
     behavior, and visible fallback.
   - Existing global and editor-selectable font families remain available.

6. Dependency discipline
   - Reuse React, Next.js, Zustand, Vitest, and installed project utilities.
   - No new package unless correctness is impossible with installed tools.

## Remediation design

### Gate and configuration

Keep .eslintrc.json limited to next/core-web-vitals. Change the lint script to
next lint --max-warnings=0 so a new warning cannot silently regress the gate.
The lockfile must remain unchanged.

### Blocking errors

Rules of Hooks:

- Dashboard RichTooltip receives currency from DashboardPage and removes its
  redundant conditional store subscription.
- UniversalThumb invokes its state/ref/callback hooks before the empty-content
  return. A jsdom rerender regression covers empty to populated to empty.
- The non-hook useTemplate action is renamed applyTemplate at its hook return
  interface and sole consumer.

Unknown TypeScript rules:

- Remove the 19 obsolete eslint-disable comments referring to plugin rules
  that are not configured. Do not install the plugin and do not change the
  underlying runtime code.

JSX entities:

- Escape only the flagged literal quote/apostrophe characters.
- Dynamic values retain expression boundaries.
- Literal code samples use JSX string expressions when an HTML entity would
  change copied code.

### Effect dependency warnings

Apply the narrowest ownership pattern per finding:

- A function used only by one effect moves inside that effect.
- A reused loader becomes useCallback with primitive identity dependencies.
- Store actions documented and observed as stable may be included directly.
- Values written by a loader use functional setters or refs when adding them
  as dependencies would create a self-triggering loop.
- Polling handles and non-visual offsets use refs, not state that recreates
  callbacks.
- Initialization effects use explicit identity snapshots/guards and must not
  reset edited flow-builder state on ordinary rerenders.
- No blanket exhaustive-deps suppression is allowed.

The catalog defines five proof levels:

- P1: rerender uses latest values with no extra work.
- P2: one initial request and one request per semantic input change.
- P3: tenant/store A to B uses only B after the switch.
- P4: exactly one timer/channel exists and cleanup runs.
- P5: rerender does not reset edited state or duplicate listeners.

### Images, accessibility, and fonts

- Convert trusted fixed-size images to next/image with width and height.
- Convert trusted responsive images to next/image fill only when the existing
  parent already owns a stable positioned size; add sizes and preserve fit.
- Keep 33 dynamic/data/blob/unbounded images native with line-local,
  reasoned no-img suppressions. These are architectural exceptions, not a
  global bypass.
- Fix five alt findings according to DOM ownership. react-pdf and Lucide
  false positives get precise local handling rather than fake DOM props.
- Remove aria-pressed from the switch that already exposes aria-checked.
- Keep the three Google font links in the root layout with precise local
  suppressions. They are globally owned, the editor supports runtime font
  selection by exact family name, and installed Next.js 14 does not export
  Geist/Geist_Mono through next/font. A framework upgrade or self-hosted font
  project is separate work.

### Maintainability warnings

Name the three anonymous default-export objects without changing their export
shape or importers.

## Delivery waves

1. Gate plus mechanical blockers
   - Configuration, max-warnings enforcement, stale comments, JSX entities,
     and named exports.

2. Hook-order correctness
   - The three independently diagnosed Rules of Hooks fixes and lifecycle
     regression proof.

3. Effect lifecycle
   - Four catalog waves: local closures, isolated loaders, polling/realtime,
     and initialization/shared state.
   - Behavior-sensitive files require P1-P5 proof before implementation is
     accepted.

4. Media and accessibility
   - Root font/ARIA handling, native dynamic previews, trusted fixed images,
     trusted fill images, and alt/component-name fixes.
   - next.config.js changes are allowed only for a concrete trusted host
     already used by an affected source; no wildcard.

5. Final gate
   - Focused tests per wave, full app suite, typecheck, lint with zero
     warnings, production build, diff-check, task reviews, and whole-change
     review.

Tasks execute sequentially when they share files. Independent investigation
or review may run in parallel, but implementation subagents never edit the
same worktree concurrently.

## Testing and acceptance

Each behavior-sensitive fix follows RED then GREEN. The existing lint report
is the RED for static findings; runtime-sensitive hook/effect fixes also need
the focused P1-P5 proof specified in the catalog.

Final acceptance requires:

- pnpm lint exits 0 with 0 errors and 0 warnings.
- pnpm exec next lint --max-warnings=0 exits 0.
- pnpm test matches or improves the established 2677-pass baseline, with only
  the three pre-existing skips.
- pnpm typecheck exits 0.
- pnpm build exits 0.
- git diff --check exits 0.
- No package or lockfile change unless a separately reviewed correctness
  blocker proves it necessary.
- Independent task reviews and a final whole-change review report no open
  Critical or Important findings.
- Worktree changes remain local; push, remote migration, and deployment need
  separate authorization.

The Python runtime, database migrations, RLS, and disposable Docker evidence
from HEAD 56724062 remain valid unless this lint work changes those areas. If
the diff stays inside app/config/test/docs files, those unrelated expensive
gates are not repeated.

## Rollback

Changes are split into local commits per wave. A wave can be reverted without
schema or data rollback. The lint configuration should be reverted together
with max-warnings enforcement only if the entire quality gate is abandoned;
individual rule fixes remain valid behavior corrections.
