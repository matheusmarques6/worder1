# ESLint Quality Catalog

Baseline: HEAD 56724062346a477cf952068306542697b136d147
Date: 2026-09-16
Configuration: next/core-web-vitals

Raw report:
.superpowers/sdd/2026-09-08-auditoria-ia-accepted-trace-transport/eslint-initial-567240.json

SHA-256:
27fd7ecf744870612f06b9ff8ba4bbccb7e63a5cec6ba48fb18de88f6a13058c

## Executive classification

| Gate class | Product-risk class | Rule | Count |
| --- | --- | --- | ---: |
| Blocking error | Runtime correctness | react-hooks/rules-of-hooks | 5 |
| Blocking error | Rendered copy / parser safety | react/no-unescaped-entities | 88 |
| Blocking error | Obsolete lint metadata | @typescript-eslint rule not found | 19 |
| Warning | Request/state lifecycle | react-hooks/exhaustive-deps | 75 |
| Warning | Media performance/security | @next/next/no-img-element | 74 |
| Warning | Accessibility | jsx-a11y alt and ARIA | 6 |
| Warning | Font delivery | @next/next/no-page-custom-font | 3 |
| Warning | Maintainability | import/no-anonymous-default-export | 3 |
| **Total** |  |  | **273** |

Severity and business risk differ. The five Rules of Hooks errors and several
dependency warnings have higher runtime risk than the 107 other blocking
errors, which are mechanical or obsolete metadata.

## Distribution by architectural domain

| Domain | Errors | Warnings | Files |
| --- | ---: | ---: | ---: |
| API routes | 17 | 1 | 5 |
| App/pages/layout | 41 | 61 | 36 |
| Components | 52 | 91 | 69 |
| Hooks | 0 | 5 | 3 |
| Libraries | 2 | 3 | 5 |

## A. Runtime-blocking Rules of Hooks

1. src/app/(dashboard)/dashboard/page.tsx:779
   - RichTooltip returns before a Zustand hook on inactive renders.
   - Fix: pass the already-computed currency from DashboardPage and remove
     the redundant tooltip subscription.

2. src/components/email-builder/universal/UniversalBits.tsx:337-339
   - useState, useRef, and useCallback execute only for non-empty blocks.
   - Fix: execute them before the empty return.
   - Proof: same component instance rerenders empty to populated to empty.

3. src/components/messaging/ChatTemplates.tsx:404
   - useTemplate is an ordinary async action, not a React hook.
   - Fix: rename the returned action and sole consumer to applyTemplate.

## B. Blocking JSX entity findings

Safe policy: escape only flagged literal text. Dynamic values keep JSX
expression boundaries. Literal code samples use string expressions when an
entity would change copied code.

| File | Lines | Count |
| --- | --- | ---: |
| src/app/(dashboard)/content/products/page.tsx | 525 | 2 |
| src/app/(dashboard)/integrations/shopify/install-pixel/page.tsx | 242, 254, 258 | 10 |
| src/app/(dashboard)/integrations/shopify/tracking-debug/page.tsx | 680, 772, 791, 793, 795, 858 | 12 |
| src/app/(dashboard)/whatsapp/campaigns/new/page.tsx | 306 | 2 |
| src/app/popup-editor/[id]/page.tsx | 1623, 1706, 1716, 2162, 3143, 3390 | 14 |
| src/components/crm/CustomFieldsManager.tsx | 295 | 2 |
| src/components/crm/DealDrawer.tsx | 491 | 2 |
| src/components/crm/DealTimeline.tsx | 214 | 2 |
| src/components/crm/EditStageModal.tsx | 288, 311 | 4 |
| src/components/flow-builder/panels/ExecutionPanel.tsx | 545 | 2 |
| src/components/flow-builder/panels/PropertiesPanel.tsx | 467, 1165, 1208 | 12 |
| src/components/flow-builder/variables/VariablePicker.tsx | 248 | 2 |
| src/components/store/AddStoreModal.tsx | 480, 485, 503, 507, 702, 714, 718 | 20 |
| src/components/surveys/NPSSurveys.tsx | 993 | 2 |
| **Total** |  | **88** |

## C. Blocking obsolete TypeScript suppressions

The parser is present transitively, but @typescript-eslint/eslint-plugin is
not installed or configured. These are errors on obsolete comments, not
violations of the referenced rules. Remove the comments; do not add a plugin.

| File | Lines | Count |
| --- | --- | ---: |
| src/app/api/cron/shopify/route.ts | 58, 71, 92, 105, 125, 138, 158, 217 | 8 |
| src/app/api/integrations/status/route.ts | 63 | 1 |
| src/app/api/shopify/full-sync/route.ts | 109 | 1 |
| src/app/api/shopify/sync/route.ts | 19, 21, 65, 86, 102, 104, 209 | 7 |
| src/lib/whatsapp/cloud-api.ts | 789 | 1 |
| src/lib/whatsapp/recipient-claim.test.ts | 119 | 1 |
| **Total** |  | **19** |

## D. Effect and callback lifecycle

Mechanisms:

- F: missing async loader/function, 53.
- S: missing scalar/object, 14.
- U: unstable inline value/object, 4.
- C: complex dependency expression, 1.
- N: unnecessary dependency, 3.

Proof levels:

- P1: rerender reads latest values without extra work.
- P2: one initial request and one request per semantic input change.
- P3: tenant/store A to B uses only B after the switch.
- P4: one timer/channel and verified cleanup.
- P5: rerender preserves edited state and listener cardinality.

### D1. Local closures and values — 14

| File:line | Mechanism | Required ownership fix | Proof |
| --- | --- | --- | --- |
| analytics/sales/page.tsx:855 | N | Remove redundant currentStore.id; storeId is effective source | P3 |
| crm/analytics/page.tsx:845 | N | Same as sales | P3 |
| forms/[id]/analytics/page.tsx:110 | S | Stabilize/include timezone | P2 |
| settings/email/page.tsx:35 | U | Compute domains inside memo from stable source | P1 |
| KnowledgeBasePanel.tsx:98 | S | Functional selection setter; do not refetch on self-selection | P2 |
| PipelineAutomationConfig.tsx:148 | S | Functional selected-stage setter | P2 |
| WorderEmailEditor.tsx:1304 | S | Include flowContext and onSave in non-effect callback | P1 |
| WhatsAppTemplateEditor.tsx:186 | U x3 | Module defaults plus memoized currentConfig | P1 |
| LivePreviewPanel.tsx:78 | S+C | Stable serialized rule snapshot for debounce | P2 |
| WabaHealthWidget.tsx:123 | N | Remove unused organizationId dependency | P1 |
| ContactPanel.tsx:191 | S | Depend on scalar bot-active state | P1 |

### D2. Isolated loaders — 39

Functions used only by one effect move inside it. Reused loaders become
useCallback with primitive identity dependencies. Adding a raw local function
to dependencies is forbidden because it refetches on every render.

| File:line(s) | Count | Identity / special rule |
| --- | ---: | --- |
| analytics/email/page.tsx:190 | 1 | days + store + hydration |
| analytics/shopify/page.tsx:247 | 1 | period + store + hydration |
| crm/integrations/page.tsx:273,616,861 | 3 | org/store; modal loaders by org |
| integrations/[slug]/page.tsx:62 | 1 | slug + organization ID |
| integrations/shopify/diagnostico/page.tsx:90 | 1 | organization |
| whatsapp/analytics/page.tsx:477 | 2 | organization + period; deliberately org-scoped |
| whatsapp/campaigns/[id]/page.tsx:92 | 1 | campaign ID |
| whatsapp/flows/page.tsx:35 | 1 | stable owner-hook callback |
| whatsapp/phonebooks/page.tsx:23,24 | 2 | stable callbacks + selected phonebook ID |
| BulkDeleteModal.tsx:76 | 1 | IDs + org + open gate |
| DealTimeline.tsx:93 | 1 | deal ID |
| MergeContactsModal.tsx:97 | 1 | org + open/preselection |
| AutomationLogsModal.tsx:163 | 1 | separate reset from page/search loader |
| CredentialSelector.tsx:105 | 1 | connection type |
| EmailPreviewMode.tsx:103,127 | 2 | stabilize renderPreview before fetchEvents |
| PropertiesPanel.tsx:59,2143,2276 | 3 | org-scoped loaders in their owner components |
| TestModal.tsx:197 | 1 | trigger node |
| ActiveIntegrationsSection.tsx:86 | 1 | org/store |
| ShopifyConfigModal.tsx:93 | 1 | store ID + org |
| ShopifyImportModal.tsx:97 | 1 | store ID |
| ShopifySettingsModal.tsx:105 | 1 | store ID + org |
| AutomationRulesTab.tsx:105 | 1 | store ID; reuse after CRUD |
| SyncConfigTab.tsx:127 | 1 | store ID |
| UserMenu.tsx:71 | 1 | agent ID |
| NotificationPanel.tsx:25 | 1 | delete duplicate fetch effect; hook already autofetches |
| CohortMatrix.tsx:144 | 1 | store + max months |
| RFMDashboard.tsx:235 | 1 | store |
| WhatsAppIntegrationCard.tsx:45 | 1 | organization |
| TransferModal.tsx:44 | 1 | org + open gate |
| BusinessHoursTab.tsx:26 | 1 | org/store |
| OptStatusTab.tsx:23 | 1 | org/filter/search |
| QueuesTab.tsx:27 | 1 | org; reuse after mutations |
| WidgetTab.tsx:25 | 1 | org/store |

### D3. Polling, realtime, and repeated calls — 13

| File:line(s) | Count | Required invariant |
| --- | ---: | --- |
| automations/monitoring/page.tsx:79 | 1 | one interval per store |
| PixelHealthBanner.tsx:72 | 1 | scalar store ID, not store object |
| ImportTab.tsx:109 | 1 | interval ref; no state-driven restart |
| InboxContent.tsx:284,291,307,335 | 4 | no duplicate list fetch; scalar conversation/contact IDs |
| NumberSelector.tsx:98 | 1 | callback ref; reset only on org/store |
| WhatsAppConnectionManager.tsx:110,118 | 2 | stable fetch; selection/callback refs; one poll |
| useNotifications.ts:103,114,123 | 3 | offset ref; stable fetch/timer/channel |

### D4. Initialization and shared state — 9

| File:line(s) | Count | Required invariant |
| --- | ---: | --- |
| app dashboard layout.tsx:475 | 1 | read current selection at commit; no store-object loop |
| crm/page.tsx:416 | 1 | include stable hook callbacks after identity proof |
| ContactDrawer.tsx:255,278 | 2 | stable loaders and functional deal enrichment |
| flow-builder/index.tsx:189 | 1 | mount snapshot; rerender must not erase edits |
| HistoryPanel.tsx:278 | 1 | stable Zustand reset action |
| AdvancedMetricsSection.tsx:103 | 1 | refetch after store switch; no stale data gate |
| useInboxContact.ts:158 | 1 | stable fetchOrders ownership |
| useInboxConversations.ts:142 | 1 | stable markAsRead ownership |

The four dependency waves total 14 + 39 + 13 + 9 = 75 and share no files.

## E. Images, accessibility, and fonts

### E1. Trusted fixed-size next/image candidates — 32

Each conversion must preserve dimensions/classes and verify that its concrete
source is covered by the existing trusted remote patterns. If the source is
unbounded at runtime, reclassify it under E3 rather than widening the
allowlist.

- contacts/[id]/page.tsx: 500, 730, 926, 982
- content/products/page.tsx: 405
- crm/integrations/page.tsx: 166, 698, 919
- integrations/[slug]/page.tsx: 175
- integrations/meta/page.tsx: 427
- products/page.tsx: 432
- whatsapp/queue/page.tsx: 183
- ContactDrawer.tsx: 1033, 1149
- BrowseProductsModal.tsx: 292
- ProductFeedModal.tsx: 263, 308
- InstagramDirectConnect.tsx: 259, 348
- Header.tsx: 514
- MentionInput.tsx: 100
- DomainWizard.tsx: 171
- settings/ui.tsx: 210
- KanbanView.tsx: 302
- TaskDetailModal.tsx: 261
- ui/Avatar.tsx: 40
- ChatPanel.tsx: 703
- ContactPanel.tsx: 259
- ConversationList.tsx: 83
- AssignModal.tsx: 237
- NotesTab.tsx: 186, 397

### E2. Trusted responsive next/image fill candidates — 9

The parent must own a stable positioned size. Add sizes and preserve the
existing object-fit/aspect behavior.

- content/media/page.tsx: 393, 455
- content/page.tsx: 160
- email/campaigns/new/page.tsx: 480
- email/templates/page.tsx: 246
- AdsTable.tsx: 107
- BrowseProductsModal.tsx: 229, 334
- MediaLibraryModal.tsx: 382

### E3. Native dynamic/data/blob images — 33

These are user-entered URLs, unbounded third-party media, data URLs, or blob
previews. Keep native img and add a line-local reason. Do not disable the rule
globally and do not add a wildcard remote hostname.

- forms/[id]/edit/page.tsx: 305
- forms/[id]/editor/page.tsx: 133, 423, 446
- settings/brand/page.tsx: 103, 115, 119, 123, 181, 243, 244
- settings/security/page.tsx: 185
- embed/[formId]/page.tsx: 305
- popup-editor/[id]/page.tsx: 1154, 1822, 2494, 4002, 4048, 5107, 5214
- BlockPreview.tsx: 123, 281, 375, 571, 959
- BlockProperties.tsx: 265, 637, 1201
- NewProductModal.tsx: 202
- MediaLibraryModal.tsx: 480
- ChatPanel.tsx: 191, 200, 353

The preferred local reason is:
user-provided/data/blob URL cannot be safely optimized or allowlisted.

Future replacement boundary: ingest/proxy the media into the owned storage/CDN
before rendering it through next/image.

### E4. Accessibility — 6

- forms/[id]/editor/page.tsx:423,446
  - Decorative side images receive alt="".
- NotesTab.tsx:224
  - Lucide Image is renamed ImageIcon; the owning button gets an accessible
    label.
- api/reports/poc/route.tsx:143
- lib/reports/components/Header.tsx:50
  - Both are @react-pdf/renderer Image components, not DOM img elements.
    Use precise local false-positive handling rather than fake alt props.
- settings/ui.tsx:52
  - The switch already has aria-checked; remove unsupported aria-pressed.

### E5. Root font delivery — 3

Files: src/app/layout.tsx:37,39,41.

The links are in the App Router root layout and serve global themes plus
runtime-selectable editor families. Installed Next.js 14 exports DM Sans and
Plus Jakarta Sans but not Geist or Geist Mono through next/font. Replacing only
part of the registry would change exact CSS family behavior; upgrading Next or
self-hosting nine font families is outside this lint correction.

Resolution: keep the three root-owned links and apply precise line-local
no-page-custom-font explanations. Do not add page-level links and do not turn
the rule off globally.

Existing trusted image configuration:

- cdn.shopify.com
- avatars.githubusercontent.com
- *.supabase.co/storage/**
- configured CDN_IMAGES_DOMAIN/storage/**

No hostname: "**" or equivalent wildcard is permitted.

## F. Named default exports — 3

- src/components/ads/index.tsx:501
  - Name the object adsComponents, then export default it.
- src/lib/queue.ts:577
  - Name the object queue, then export default it.
- src/lib/services/automation/automation-executor.ts:457
  - Name the object automationExecutor, then export default it.

Export shapes and importer behavior remain unchanged.

## Closure criteria

The catalog closes only when all of the following are fresh on the same final
commit:

- 0 ESLint errors.
- 0 ESLint warnings.
- next lint --max-warnings=0 exits 0.
- Focused P1-P5 proofs for behavior-sensitive hook/effect changes.
- Full Vitest suite, typecheck, and Next production build pass.
- No wildcard media trust, global rule disable, unexpected dependency, or
  lockfile change.
- Independent task reviews and whole-change review are clean.
