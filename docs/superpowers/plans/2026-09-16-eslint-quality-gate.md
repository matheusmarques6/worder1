# Zero-Warning ESLint Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Turn the dormant Next.js lint command into a zero-error,
zero-warning quality gate while preserving tenant identity, request cadence,
UI behavior, media trust boundaries, and existing architecture.

**Architecture:** Remediate the 273-item audited baseline in sequential,
reviewed waves. Mechanical changes land first, then hook order, effect
lifecycle, media/accessibility, and final verification. Behavior-sensitive
closures receive focused RED/GREEN proof; static-only findings use the
captured lint baseline as RED.

**Tech Stack:** Next.js 14.0.4, React 18, TypeScript 5, Zustand, ESLint 8,
eslint-config-next 14.0.4, Vitest 1.2, jsdom.

**Spec:** docs/superpowers/specs/2026-09-16-eslint-quality-gate-design.md

**Catalog:** docs/audits/2026-09-16-eslint-quality-catalog.md

## Global Constraints

- Final lint result is exactly 0 errors and 0 warnings.
- Keep .eslintrc.json limited to next/core-web-vitals.
- package.json lint must run next lint --max-warnings=0.
- Do not add or upgrade dependencies; pnpm-lock.yaml must not change.
- Do not disable an ESLint rule globally.
- Line-local suppressions are allowed only for catalogued framework false
  positives or native dynamic/data/blob images, with a concrete reason.
- Never add a wildcard image hostname.
- Preserve organization, store, WABA, conversation, contact, and account
  identity across rerenders and async responses.
- Preserve request cardinality: one initial load and one per semantic identity
  change; one timer/channel with cleanup.
- Preserve rendered text, image geometry, editor-selectable fonts, exports,
  API shapes, and public component behavior.
- Use apply_patch for edits. Preserve unrelated user changes.
- No database, RLS, Python runtime, Docker, remote, push, merge, migration, or
  deployment action.
- Each task uses strict RED/GREEN, creates one local Conventional Commit, and
  passes independent spec and quality review before the next task.

---

### Task 1: Activate the gate and remove mechanical findings

**Files:**

- Create: .eslintrc.json
- Modify: package.json
- Modify: src/app/(dashboard)/content/products/page.tsx
- Modify: src/app/(dashboard)/integrations/shopify/install-pixel/page.tsx
- Modify: src/app/(dashboard)/integrations/shopify/tracking-debug/page.tsx
- Modify: src/app/(dashboard)/whatsapp/campaigns/new/page.tsx
- Modify: src/app/popup-editor/[id]/page.tsx
- Modify: src/components/crm/CustomFieldsManager.tsx
- Modify: src/components/crm/DealDrawer.tsx
- Modify: src/components/crm/DealTimeline.tsx
- Modify: src/components/crm/EditStageModal.tsx
- Modify: src/components/flow-builder/panels/ExecutionPanel.tsx
- Modify: src/components/flow-builder/panels/PropertiesPanel.tsx
- Modify: src/components/flow-builder/variables/VariablePicker.tsx
- Modify: src/components/store/AddStoreModal.tsx
- Modify: src/components/surveys/NPSSurveys.tsx
- Modify: src/app/api/cron/shopify/route.ts
- Modify: src/app/api/integrations/status/route.ts
- Modify: src/app/api/shopify/full-sync/route.ts
- Modify: src/app/api/shopify/sync/route.ts
- Modify: src/lib/whatsapp/cloud-api.ts
- Modify: src/lib/whatsapp/recipient-claim.test.ts
- Modify: src/components/ads/index.tsx
- Modify: src/lib/queue.ts
- Modify: src/lib/services/automation/automation-executor.ts

**Interfaces:**

- Produces: deterministic pnpm lint with max-warnings=0.
- Produces: baseline progression from 112 errors / 161 warnings to exactly
  5 errors / 158 warnings.
- Does not change runtime interfaces or the lockfile.

- [ ] **Step 1: Reconfirm the RED**

Run:

    pnpm exec next lint --format json --output-file .superpowers/sdd/2026-09-16-eslint-quality-gate/task-1-red.json

Expected: exit 1, 112 errors, 161 warnings. Hash and count the JSON.

- [ ] **Step 2: Activate the strict gate**

Create:

    {
      "extends": "next/core-web-vitals"
    }

Change package.json:

    "lint": "next lint --max-warnings=0"

Do not touch dependencies or pnpm-lock.yaml.

- [ ] **Step 3: Remove obsolete TypeScript suppression comments**

Delete exactly the 19 comments enumerated in catalog section C. Do not alter
the any/require expressions and do not install @typescript-eslint/eslint-plugin.

- [ ] **Step 4: Escape the 88 JSX literals**

Apply catalog section B exactly:

- Plain JSX quote/apostrophe text becomes the corresponding HTML entity.
- Dynamic quoted values retain expression boundaries.
- VariablePicker's literal code sample becomes a JSX string expression so
  copied text remains |default:'valor'.
- Do not change text not reported by the baseline.

- [ ] **Step 5: Name three default-export objects**

Use these exact local names and keep default export shape:

    const adsComponents = { ... }
    export default adsComponents

    const queue = { ... }
    export default queue

    const automationExecutor = { ... }
    export default automationExecutor

- [ ] **Step 6: Verify GREEN for the task**

Run:

    pnpm exec next lint --format json --output-file .superpowers/sdd/2026-09-16-eslint-quality-gate/task-1-green.json
    pnpm typecheck
    pnpm test
    git diff --check

Expected lint inventory: exactly 5 errors, 158 warnings. Expected app suite:
2677 passed and only the three established skips, allowing one documented
rerun for the known DOCX timeout flake. Confirm pnpm-lock.yaml unchanged.

- [ ] **Step 7: Commit**

Stage exactly every path in this task's Files block using literal path
arguments. Confirm git diff --cached --name-only equals that block, then run:

    git commit -m "chore: activate strict Next.js lint gate"

---

### Task 2: Repair Rules of Hooks violations

**Files:**

- Modify: src/app/(dashboard)/dashboard/page.tsx
- Modify: src/components/email-builder/universal/UniversalBits.tsx
- Create: src/components/email-builder/universal/UniversalBits.test.tsx
- Modify: src/hooks/useChatTemplates.ts
- Modify: src/components/messaging/ChatTemplates.tsx

**Interfaces:**

- RichTooltip adds required currency: string input and owns no store hook.
- UniversalThumb keeps the same props and visible output.
- UseChatTemplatesReturn exposes applyTemplate instead of the misleading
  useTemplate action; repository search proves one consumer.
- Produces: 0 errors / 158 warnings.

- [ ] **Step 1: Write the UniversalThumb lifecycle RED**

Export UniversalThumb as a named component if needed for direct testing.
Create a jsdom Vitest test using react-dom/client createRoot. Stub
ResizeObserver and mock BlockPreview. Rerender the same component instance:

1. content empty;
2. content with one block;
3. content empty again.

Assert no render throws and the observer disconnects on the populated-to-empty
transition.

Run:

    pnpm vitest run src/components/email-builder/universal/UniversalBits.test.tsx

Expected: fail against the original hook order with the React hook-count
diagnostic.

- [ ] **Step 2: Fix UniversalThumb**

Move scale state, observer ref, and boxRef callback above the
blocks.length === 0 return. Keep useMemo first, retain ResizeObserver cleanup,
and do not extract a speculative abstraction.

- [ ] **Step 3: Fix RichTooltip at the ownership boundary**

DashboardPage already computes currency. Pass it:

    content={<RichTooltip isRevenue={tab === 'revenue'} currency={currency} />}

Add currency to RichTooltip's props and delete its useStoreStore call. Do not
move the redundant store hook above the return.

- [ ] **Step 4: Rename the ordinary template action**

In UseChatTemplatesReturn, implementation, return object, destructuring, and
sole call site rename useTemplate to applyTemplate. Do not change request,
usage-count, replacement, or error behavior.

- [ ] **Step 5: Verify GREEN**

Run:

    pnpm vitest run src/components/email-builder/universal/UniversalBits.test.tsx
    pnpm exec eslint "src/app/(dashboard)/dashboard/page.tsx" "src/components/email-builder/universal/UniversalBits.tsx" "src/hooks/useChatTemplates.ts" "src/components/messaging/ChatTemplates.tsx"
    pnpm typecheck
    pnpm exec next lint --format json --output-file .superpowers/sdd/2026-09-16-eslint-quality-gate/task-2-green.json
    git diff --check

Expected: lifecycle test passes; task files have no findings; global result is
0 errors / 158 warnings.

- [ ] **Step 6: Commit**

Stage exactly the five paths in this task's Files block, confirm the cached
name list, then run:

    git commit -m "fix: preserve React hook order"

---

### Task 3: Stabilize local closures and values

**Files:**

- src/app/(dashboard)/analytics/sales/page.tsx
- src/app/(dashboard)/crm/analytics/page.tsx
- src/app/(dashboard)/forms/[id]/analytics/page.tsx
- src/app/(dashboard)/settings/email/page.tsx
- src/components/agents/KnowledgeBasePanel.tsx
- src/components/crm/PipelineAutomationConfig.tsx
- src/components/email-builder/WorderEmailEditor.tsx
- src/components/flow-builder/whatsapp/WhatsAppTemplateEditor.tsx
- src/components/segments/v2/LivePreviewPanel.tsx
- src/components/whatsapp/WabaHealthWidget.tsx
- src/components/whatsapp/inbox/ContactPanel.tsx
- Create: src/tests/eslint-local-closure-lifecycle.test.tsx

**Interfaces:**

- Implements catalog D1's 14 findings.
- Preserves effective tenant/store source and debounce behavior.
- Produces: 0 errors / 144 warnings.

- [ ] **Step 1: Add focused RED proof**

For state-writing loaders in KnowledgeBasePanel and
PipelineAutomationConfig, add focused Vitest proof that initial loading
selects the fallback once without issuing another request because selection
changed.

For LivePreviewPanel, add fake-timer proof that equivalent rerenders preserve
one debounce and the latest rule snapshot.

Use existing nearby test files when present; otherwise create colocated
jsdom tests. Run them and record the expected failure or missing coverage.

- [ ] **Step 2: Apply exact D1 ownership fixes**

- Remove the three unnecessary dependencies recorded in D1.
- Include/stabilize timezone, flowContext, and onSave where used.
- Compute allDomains inside its memo.
- Use functional selection setters in KnowledgeBasePanel and
  PipelineAutomationConfig.
- Move WhatsApp template defaults to module scope and memoize currentConfig.
- Replace LivePreviewPanel's complex dependency with a stable serialized
  snapshot without resetting debounce on referential-only changes.
- Depend on scalar bot-active state in ContactPanel.

- [ ] **Step 3: Verify**

Run the new focused tests, ESLint on the 11 exact files, pnpm typecheck, the
full pnpm test suite, and git diff --check.

Expected global lint inventory: 0 errors / 144 warnings.

- [ ] **Step 4: Commit**

Stage exactly the 12 paths in this task's Files block, confirm the cached name
list, then run:

    git commit -m "fix: stabilize local React dependencies"

---

### Task 4: Stabilize app-page loaders

**Files:**

- src/app/(dashboard)/analytics/email/page.tsx
- src/app/(dashboard)/analytics/shopify/page.tsx
- src/app/(dashboard)/crm/integrations/page.tsx
- src/app/(dashboard)/integrations/[slug]/page.tsx
- src/app/(dashboard)/integrations/shopify/diagnostico/page.tsx
- src/app/(dashboard)/whatsapp/analytics/page.tsx
- src/app/(dashboard)/whatsapp/campaigns/[id]/page.tsx
- src/app/(dashboard)/whatsapp/flows/page.tsx
- src/app/(dashboard)/whatsapp/phonebooks/page.tsx
- Create: src/tests/eslint-app-loader-lifecycle.test.tsx

**Interfaces:**

- Implements 12 D2 findings.
- Loaders key only on primitive route, organization, store, period, and
  selected-phonebook identity.
- Produces: 0 errors / 132 warnings.

- [ ] **Step 1: Reproduce the scoped RED**

Run ESLint on the nine files and retain the JSON proving 12 dependency
warnings. For analytics email/shopify and CRM integrations, add jsdom/fetch
regression cases that rerender store A to B and assert the last request uses
only B after the switch. Record failure before implementation.

- [ ] **Step 2: Apply exact loader ownership**

- Wrap reused loaders in useCallback with the primitive dependencies recorded
  in catalog D2.
- Keep analytics hydration gates.
- Keep WhatsApp analytics organization-scoped; do not add store ID to routes
  that intentionally aggregate the organization.
- Use selectedPhonebook.id rather than the selected object.
- Include already-stable owner-hook callbacks directly for flows/phonebooks.
- Do not change fetch URLs, payloads, error handling, or display state.

- [ ] **Step 3: Verify**

Run focused A-to-B tests, ESLint on all nine files, pnpm typecheck, pnpm test,
and git diff --check.

Expected global lint inventory: 0 errors / 132 warnings.

- [ ] **Step 4: Commit**

Stage exactly the ten paths in this task's Files block, confirm the cached
name list, then run:

    git commit -m "fix: bind page loaders to current tenant state"

---

### Task 5: Stabilize CRM and flow-builder loaders

**Files:**

- src/components/crm/BulkDeleteModal.tsx
- src/components/crm/DealTimeline.tsx
- src/components/crm/MergeContactsModal.tsx
- src/components/crm/automations/AutomationLogsModal.tsx
- src/components/flow-builder/panels/CredentialSelector.tsx
- src/components/flow-builder/panels/EmailPreviewMode.tsx
- src/components/flow-builder/panels/PropertiesPanel.tsx
- src/components/flow-builder/panels/TestModal.tsx
- Create: src/tests/eslint-crm-flow-loader-lifecycle.test.tsx

**Interfaces:**

- Implements 11 D2 findings.
- Modal open/reset semantics, flow preview ordering, and organization scope
  remain unchanged.
- Produces: 0 errors / 121 warnings.

- [ ] **Step 1: Reproduce RED and add high-risk proofs**

Capture 11 scoped warnings. Add focused proof for:

- AutomationLogsModal filter change resets page once without a second load
  caused by loader identity.
- EmailPreviewMode renderPreview/fetchEvents chain makes one event request and
  renders the latest payload.
- PropertiesPanel store/user/pipeline loaders use the current organization
  after an A-to-B rerender.

Run the proofs before implementation and record expected failures.

- [ ] **Step 2: Apply D2 fixes**

- Reused loaders become useCallback with primitive IDs.
- A loader used only by one effect moves inside the effect.
- AutomationLogsModal separates filter/page reset from pagination loading.
- EmailPreviewMode defines stable renderPreview before stable fetchEvents.
- PropertiesPanel stabilizes each loader inside its owning subcomponent;
  do not hoist unrelated state across panel boundaries.
- TestModal depends on a stable trigger-node callback.

- [ ] **Step 3: Verify**

Run focused tests, scoped ESLint, pnpm typecheck, pnpm test, and diff-check.
Expected global inventory: 0 errors / 121 warnings.

- [ ] **Step 4: Commit**

Stage exactly the nine paths in this task's Files block, confirm the cached
name list, then run:

    git commit -m "fix: stabilize CRM and flow loaders"

---

### Task 6: Stabilize Shopify and integration loaders

**Files:**

- src/components/integrations/active/ActiveIntegrationsSection.tsx
- src/components/integrations/shopify/ShopifyConfigModal.tsx
- src/components/integrations/shopify/ShopifyImportModal.tsx
- src/components/integrations/shopify/ShopifySettingsModal.tsx
- src/components/integrations/shopify/tabs/AutomationRulesTab.tsx
- src/components/integrations/shopify/tabs/SyncConfigTab.tsx
- src/components/shopify/CohortMatrix.tsx
- src/components/shopify/RFMDashboard.tsx
- Create: src/tests/eslint-shopify-loader-lifecycle.test.tsx

**Interfaces:**

- Implements 8 D2 findings.
- All requests retain exact current store/organization ownership.
- CRUD refresh continues reusing the same stable loader.
- Produces: 0 errors / 113 warnings.

- [ ] **Step 1: Reproduce RED and write store-switch proof**

Capture eight scoped warnings. For one modal path and one dashboard path,
render store A, rerender store B, and assert request URLs/bodies use B without
an additional stale A request. Run before implementation.

- [ ] **Step 2: Stabilize loaders**

Wrap each catalogued loader in useCallback with store.id and organization ID,
not whole mutable objects. Preserve modal open gates, current endpoints, and
CRUD refresh calls. CohortMatrix also retains maxMonths as an input.

- [ ] **Step 3: Verify**

Run focused store-switch tests, scoped ESLint, pnpm typecheck, pnpm test, and
diff-check. Expected global inventory: 0 errors / 113 warnings.

- [ ] **Step 4: Commit**

Stage exactly the nine paths in this task's Files block, confirm the cached
name list, then run:

    git commit -m "fix: stabilize Shopify integration loaders"

---

### Task 7: Stabilize remaining UI loaders

**Files:**

- src/components/layout/UserMenu.tsx
- src/components/notifications/NotificationPanel.tsx
- src/components/whatsapp/WhatsAppIntegrationCard.tsx
- src/components/whatsapp/inbox/modals/TransferModal.tsx
- src/components/whatsapp/settings/BusinessHoursTab.tsx
- src/components/whatsapp/settings/OptStatusTab.tsx
- src/components/whatsapp/settings/QueuesTab.tsx
- src/components/whatsapp/settings/WidgetTab.tsx
- Create: src/tests/eslint-ui-loader-lifecycle.test.tsx

**Interfaces:**

- Implements 8 D2 findings.
- NotificationPanel relies on useNotifications' existing autoFetch and must
  not issue a duplicate initial request.
- Produces: 0 errors / 105 warnings.

- [ ] **Step 1: Reproduce RED and duplicate-fetch proof**

Capture eight warnings. Add a NotificationPanel regression that mounts once
and proves one initial notification request, not the current duplicate.
For TransferModal prove closed mount does not fetch and opening fetches once.

- [ ] **Step 2: Apply exact loader fixes**

Memoize loaders by the primitive identities in D2. Delete only
NotificationPanel's redundant effect; keep useNotifications autoFetch enabled.
Retain modal gates, filters/search, and post-mutation refresh behavior.

- [ ] **Step 3: Verify**

Run focused tests, scoped ESLint, pnpm typecheck, pnpm test, and diff-check.
Expected global inventory: 0 errors / 105 warnings.

- [ ] **Step 4: Commit**

Stage exactly the nine paths in this task's Files block, confirm the cached
name list, then run:

    git commit -m "fix: remove duplicate UI loader effects"

---

### Task 8: Repair polling and realtime lifecycles

**Files:**

- src/app/(dashboard)/automations/monitoring/page.tsx
- src/components/integrations/shopify/PixelHealthBanner.tsx
- src/components/integrations/shopify/tabs/ImportTab.tsx
- src/components/whatsapp/inbox/InboxContent.tsx
- src/components/whatsapp/inbox/NumberSelector.tsx
- src/components/whatsapp/inbox/WhatsAppConnectionManager.tsx
- src/hooks/useNotifications.ts
- Create: src/tests/eslint-polling-lifecycle.test.tsx

**Interfaces:**

- Implements 13 D3 findings.
- Exactly one interval/channel per semantic identity with cleanup.
- Inbox list fetch is not duplicated.
- Produces: 0 errors / 92 warnings.

- [ ] **Step 1: Write fake-timer/realtime RED**

Create or extend jsdom tests with fake timers to prove:

- ImportTab has one polling interval and cleanup.
- InboxContent performs one list fetch, keeps one conversation poll, and
  switches conversation/contact by scalar ID.
- WhatsAppConnectionManager keeps one poll when selection updates.
- useNotifications keeps one initial fetch, timer, and channel while offset
  changes through load-more.

Run against current code and record duplicate/restart behavior.

- [ ] **Step 2: Implement narrow lifecycle fixes**

- Move pollingInterval from state to ref in ImportTab.
- Use scalar storeId in PixelHealthBanner.
- Unify InboxContent's duplicate list effects and use scalar IDs.
- Keep parent callbacks/selections in refs where their identity is not a
  semantic fetch input.
- Move useNotifications offset to a ref so fetchNotifications is stable;
  include the stable callback in all three effects.
- Preserve intervals, delays, endpoints, channel filters, and cleanup.

- [ ] **Step 3: Verify**

Run focused fake-timer/realtime tests, scoped ESLint, pnpm typecheck, pnpm
test, and diff-check. Expected global inventory: 0 errors / 92 warnings.

- [ ] **Step 4: Commit**

Stage exactly the eight paths in this task's Files block, confirm the cached
name list, then run:

    git commit -m "fix: stabilize polling and realtime effects"

---

### Task 9: Preserve initialization and shared state

**Files:**

- src/app/(dashboard)/layout.tsx
- src/app/(dashboard)/crm/page.tsx
- src/components/crm/ContactDrawer.tsx
- src/components/flow-builder/index.tsx
- src/components/flow-builder/panels/HistoryPanel.tsx
- src/components/shopify/AdvancedMetricsSection.tsx
- src/hooks/useInboxContact.ts
- src/hooks/useInboxConversations.ts
- Create: src/tests/eslint-initialization-lifecycle.test.tsx

**Interfaces:**

- Implements 9 D4 findings.
- Flow rerenders never reset user edits.
- Async store selection cannot overwrite a newer user selection.
- Produces: 0 errors / 83 warnings.

- [ ] **Step 1: Write initialization RED**

Add focused proofs:

- Dashboard layout starts on store A, user selects B while loading, and the
  async completion keeps B.
- Flow builder rerender with referentially new initial arrays does not reset
  an edited node or duplicate listeners.
- AdvancedMetrics switches store and does not reuse old-store data.

Run before implementation and record failures.

- [ ] **Step 2: Apply D4 ownership fixes**

- Read current store at async commit through useStoreStore.getState rather
  than depending on the whole currentStore object.
- Include stable refetch/reset actions where catalogued.
- Stabilize ContactDrawer loaders by IDs and use functional enrichment.
- Snapshot flow initialization in a ref and separate listener cleanup.
- Move dependent hook callbacks above their consumers and include them.
- AdvancedMetrics keys fetch/data validity by store ID.

- [ ] **Step 3: Verify**

Run focused initialization tests, scoped ESLint, pnpm typecheck, pnpm test,
and diff-check. Expected global inventory: 0 errors / 83 warnings.

- [ ] **Step 4: Commit**

Stage exactly the nine paths in this task's Files block, confirm the cached
name list, then run:

    git commit -m "fix: preserve state across effect rerenders"

---

### Task 10: Resolve dynamic media, accessibility, and root fonts

**Files:**

- src/app/(dashboard)/forms/[id]/edit/page.tsx
- src/app/(dashboard)/forms/[id]/editor/page.tsx
- src/app/(dashboard)/settings/brand/page.tsx
- src/app/(dashboard)/settings/security/page.tsx
- src/app/(dashboard)/settings/ui.tsx
- src/app/embed/[formId]/page.tsx
- src/app/popup-editor/[id]/page.tsx
- src/app/api/reports/poc/route.tsx
- src/app/layout.tsx
- src/components/email-builder/blocks/BlockPreview.tsx
- src/components/email-builder/panels/BlockProperties.tsx
- src/components/products/NewProductModal.tsx
- src/components/shared/MediaLibraryModal.tsx
- src/components/whatsapp/inbox/ChatPanel.tsx
- src/components/whatsapp/inbox/tabs/NotesTab.tsx
- src/lib/reports/components/Header.tsx

**Interfaces:**

- Resolves E3, E4, and E5 plus all other image findings in files owned by
  this task.
- Native dynamic/data/blob media remains native and unbounded hosts remain
  untrusted.
- Produces: 0 errors / 36 warnings.

- [ ] **Step 1: Capture the media/accessibility RED**

Run ESLint on the 16 files and store JSON. Assert it contains the 33 native
image findings, six accessibility findings, three font findings, and five
trusted image findings in the same owned files.

- [ ] **Step 2: Keep dynamic images native with precise reasons**

For every E3 occurrence, add the line-local no-img suppression immediately
before the img element with the concrete reason from the catalog. Do not
change src, object URLs, loading, referrer behavior, or layout.

- [ ] **Step 3: Fix owned trusted images**

Within these same files only:

- Convert settings/ui.tsx:210 and ChatPanel.tsx:703 to next/image when their
  sources are constrained to an existing trusted host.
- Convert NotesTab.tsx:186,397 with known dimensions.
- Convert MediaLibraryModal.tsx:382 with fill, positioned parent, and sizes.
- If inspection proves any source is unbounded, keep native img with the
  precise local explanation instead of expanding next.config.js.

- [ ] **Step 4: Fix accessibility ownership**

- Add alt="" to the two decorative form-editor images.
- Rename Lucide Image to ImageIcon in NotesTab and label the owning image
  attachment button.
- Add precise local jsx-a11y false-positive suppressions to the two
  @react-pdf/renderer Image nodes.
- Remove aria-pressed from the role=switch button that already has
  aria-checked.

- [ ] **Step 5: Preserve global font architecture**

Keep all three font links in src/app/layout.tsx and add separate, line-local
no-page-custom-font explanations: root layout global ownership, runtime
family selection, and Next.js 14 lacking Geist/Geist_Mono exports. Do not
move links to pages, add packages, or change font-family strings.

- [ ] **Step 6: Verify**

Run scoped ESLint, pnpm typecheck, pnpm test, pnpm build, and diff-check.
Expected global inventory: 0 errors / 36 warnings. Confirm next.config.js and
pnpm-lock.yaml unchanged.

- [ ] **Step 7: Commit**

Stage exactly the 16 listed files and commit:

    git commit -m "fix: document safe dynamic media boundaries"

---

### Task 11: Optimize trusted fixed-size images

**Files:**

- src/app/(dashboard)/contacts/[id]/page.tsx
- src/app/(dashboard)/content/products/page.tsx
- src/app/(dashboard)/crm/integrations/page.tsx
- src/app/(dashboard)/integrations/[slug]/page.tsx
- src/app/(dashboard)/integrations/meta/page.tsx
- src/app/(dashboard)/products/page.tsx
- src/app/(dashboard)/whatsapp/queue/page.tsx
- src/components/crm/ContactDrawer.tsx
- src/components/email-builder/modals/ProductFeedModal.tsx
- src/components/integrations/instagram/InstagramDirectConnect.tsx
- src/components/layout/Header.tsx
- src/components/notifications/MentionInput.tsx
- src/components/settings/DomainWizard.tsx
- src/components/tasks/KanbanView.tsx
- src/components/tasks/TaskDetailModal.tsx
- src/components/ui/Avatar.tsx
- src/components/whatsapp/inbox/ContactPanel.tsx
- src/components/whatsapp/inbox/ConversationList.tsx
- src/components/whatsapp/inbox/modals/AssignModal.tsx

**Interfaces:**

- Resolves 27 remaining E1 findings.
- Preserves alt text, geometry, object-fit, click handlers, and fallback.
- Produces: 0 errors / 9 warnings.

- [ ] **Step 1: Capture 27-warning RED**

Run ESLint on all 19 files and confirm exactly 27 no-img warnings.

- [ ] **Step 2: Classify each concrete source**

Before editing an occurrence, trace src to its origin:

- Existing trusted pattern and stable dimensions: convert to next/image.
- Unbounded user/provider URL: retain native img with a precise local reason.

Never add a wildcard hostname. A concrete host addition requires evidence in
the report and a dedicated next.config.js diff reviewed with this task.

- [ ] **Step 3: Convert without visual changes**

Import Image from next/image using the local naming convention. Supply width
and height matching current classes/attributes, preserve className/object-fit,
alt, event handlers, and conditional fallback. Do not enable priority except
for an already-eager above-the-fold image.

- [ ] **Step 4: Verify**

Run scoped ESLint, pnpm typecheck, pnpm test, pnpm build, and diff-check.
Expected global inventory: 0 errors / 9 warnings. Review production build
output for invalid remote-host or missing-dimension errors.

- [ ] **Step 5: Commit**

Stage the 19 listed files and next.config.js only if a concrete reviewed host
was necessary. Commit:

    git commit -m "perf: optimize trusted fixed-size images"

---

### Task 12: Optimize trusted responsive images

**Files:**

- src/app/(dashboard)/content/media/page.tsx
- src/app/(dashboard)/content/page.tsx
- src/app/(dashboard)/email/campaigns/new/page.tsx
- src/app/(dashboard)/email/templates/page.tsx
- src/components/ads/AdsTable.tsx
- src/components/email-builder/modals/BrowseProductsModal.tsx

**Interfaces:**

- Resolves the final nine image warnings: eight E2 fill findings plus
  BrowseProductsModal's owned fixed-size finding.
- Produces: 0 errors / 0 warnings.

- [ ] **Step 1: Capture nine-warning RED**

Run ESLint on the six files and confirm exactly nine no-img warnings.

- [ ] **Step 2: Convert responsive images**

For each fill candidate:

- Verify the parent owns a stable height/aspect and add relative only if it
  is not already positioned.
- Use Image fill, an accurate sizes expression, and the existing object-fit.
- Preserve alt, conditional rendering, click behavior, and fallback.
- Classify BrowseProductsModal's fixed candidate under Task 11's
  trusted/unbounded rule.

- [ ] **Step 3: Verify zero-warning GREEN**

Run:

    pnpm exec eslint "src/app/(dashboard)/content/media/page.tsx" "src/app/(dashboard)/content/page.tsx" "src/app/(dashboard)/email/campaigns/new/page.tsx" "src/app/(dashboard)/email/templates/page.tsx" "src/components/ads/AdsTable.tsx" "src/components/email-builder/modals/BrowseProductsModal.tsx"
    pnpm lint
    pnpm exec next lint --max-warnings=0
    pnpm typecheck
    pnpm test
    pnpm build
    git diff --check

Expected: both lint commands exit 0 with 0 errors and 0 warnings; build has no
image configuration/layout failures.

- [ ] **Step 4: Commit**

Stage the six listed files and commit:

    git commit -m "perf: optimize trusted responsive images"

---

### Task 13: Close the audit and run final gates

**Files:**

- Modify: docs/audits/2026-09-16-eslint-quality-catalog.md
- Create: .superpowers/sdd/2026-09-16-eslint-quality-gate/final-gates-report.md

**Interfaces:**

- Consumes all task commits and reviews.
- Produces final evidence on one immutable HEAD and a closed durable catalog.

- [ ] **Step 1: Reconcile the inventory**

Generate final JSON:

    pnpm exec next lint --format json --max-warnings=0 --output-file .superpowers/sdd/2026-09-16-eslint-quality-gate/eslint-final.json

Parse it and prove 0 errors / 0 warnings. Compare rule/category totals against
the 273-item baseline; every baseline item must map to a task report and no
new finding may remain.

- [ ] **Step 2: Run complete app gates**

Run fresh, on the same source HEAD:

    pnpm lint
    pnpm exec next lint --max-warnings=0
    pnpm test
    pnpm typecheck
    pnpm build
    git diff --check

The Vitest expectation is 2677 passes and the three established skips unless
new focused tests increase the pass count. One documented rerun is allowed
only for the known DOCX/mammoth timeout. All other failures are real.

- [ ] **Step 3: Update the durable catalog**

Append final commit range, exact counts, commands, exit codes, focused test
files, any line-local exception with its reason, pnpm-lock.yaml unchanged
proof, and links to task reports. Do not rewrite the baseline sections.

- [ ] **Step 4: Commit the closure record**

    git add -- docs/audits/2026-09-16-eslint-quality-catalog.md
    git commit -m "docs: close ESLint quality audit"

The ignored final-gates report remains outside the commit.

- [ ] **Step 5: Verify final commit**

Repeat pnpm lint, next lint --max-warnings=0, pnpm test, typecheck, build, and
diff-check after the documentation commit. Confirm git status contains no
versioned changes and .superpowers artifacts remain ignored.

- [ ] **Step 6: Independent final review**

Generate a review package from plan base ba4cc3bce73f3bbee7d9962da42057f2d00839df
through final HEAD. The reviewer must inspect:

- every global constraint;
- all tenant/store and polling invariants;
- all line-local suppressions and image source classifications;
- final zero-warning evidence;
- task-review rulings and deferred items.

Any final findings enter the single consolidated fix wave required by
subagent-driven-development, followed by exactly one scoped re-review.

---
