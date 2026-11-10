# TASK-ALPHA-MONETIZATION-001 — Subscription Monetization Architecture & Midtrans Readiness Audit

**Mode:** AUDIT & DESIGN ONLY (no implementation, no production mutation)
**Status:** `IN_PROGRESS` (created per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 · **Base:** `b3da90f` — actual HEAD verified identical, `== origin/main`, tree clean
**Canonical File:** `spint/TASK-ALPHA-MONETIZATION-001.md` (this file)
**Repository:** `C:\dev\alpha-one` · Local Windows only

## 0. Protocol checklist

- [x] Verified branch (`main`), HEAD (`b3da90f`), upstream, tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- Target: `MONETIZATION_ARCHITECTURE_AND_MIDTRANS_READINESS_VERIFIED`.

## 1. Objective

Audit the subscription foundation and produce a production-ready monetization
plan with Midtrans as gateway. No payment integration or production mutation.

## 2. Baseline (from brief, to verify)

`dfd84e7` corrective + `b3da90f` smoke record; Identity E2E, subscription
auth, Free retrieval, usage presentation, Drive isolation verified. Paid
activation, Midtrans connection, checkout, billing history, paid/centralized
enforcement all absent. Prior OAuth/subscription audits not to be repeated
without contradiction.

## 3. Phases

- **Phase 1:** implementation inventory (13 capabilities, classified with
  file/schema/route/test/runtime evidence; UI ≠ proof).
- **Phase 2:** commercial discovery (plans/positioning, ownership model,
  billing periods, trial/grace/expiry/cancel/renewal, upgrade/downgrade,
  refunds; decided vs owner-approval).
- **Phase 3:** Midtrans readiness (code/config search; official docs research
  with URLs; Snap vs Core; one-time vs recurring; notifications/signature/
  idempotency/sandbox/production/credentials).
- **Phase 4:** target architecture (identity/ownership; payment lifecycle with
  authority per state; data model candidates; state machine; security).
- **Phase 5:** frontend/API gap map. **Phase 6:** dependency-ordered roadmap
  (small verifiable tasks). **Phase 7:** owner decision register.
- Out of scope per brief. Rules: evidence-first; official docs for provider
  claims; never request/expose secrets; no code/DB mutation; no source
  commit/push.

## 4. Deliverables & verdict

13 items per brief (§1 inventory … §13 Go-Live assessment). Exactly one of
`MONETIZATION_ARCHITECTURE_AND_MIDTRANS_READINESS_VERIFIED` /
`MONETIZATION_ARCHITECTURE_PARTIAL` / `MONETIZATION_DISCOVERY_BLOCKED`.

---

## Execution Record (appended during execution)

**Status:** complete 2026-11-09 (date corrected from header). Base `b3da90f`
exact; tree was clean at start. **Zero source/DB/config modifications —
verified clean at close (report tail).**

### 1. Implementation inventory (Phase 1, at `b3da90f`)

| # | Capability | Classification | Evidence |
|---|---|---|---|
| 1 | Plan definitions | IMPLEMENTED_NOT_VERIFIED (static, candidate-flagged) | `src/lib/subscription-plans.ts` (4 plans, prices candidate-wrapped); tests pin flags |
| 2 | User→subscription mapping | IMPLEMENTED_AND_VERIFIED | `owner_sub` = verified Google `sub` (`sqlite-persistence.ts`, `subscription/router.ts`); cross-owner tests green |
| 3 | Free provisioning | IMPLEMENTED_AND_VERIFIED | Effective Free, no row (`router.ts:defaultStatus`); anonymous/default tests |
| 4 | Paid records | PARTIALLY_IMPLEMENTED | `saveSubscription` exists; only writers are cancel-path + tests; no grant/purchase path |
| 5 | Lifecycle/status transitions | IMPLEMENTED_AND_VERIFIED | `transitions.ts` (9 transitions, validator, fail-safe); 25+ contract tests |
| 6 | Entitlement definitions | NOT_IMPLEMENTED | Only warning-only Slides observation (`entitlement.ts`); zero enforcement helpers (grep: no `requireEntitlement`) |
| 7 | Usage tracking/ledger | IMPLEMENTED_AND_VERIFIED | `usage_runs` + settle hook + `GET /usage` + UI; append-only, UNIQUE anti-double-count; tests green |
| 8 | Quota calc/enforcement | NOT_IMPLEMENTED | "Quota" hits are provider-error classification only; UI states no quotas |
| 9 | Upgrade/downgrade | NOT_IMPLEMENTED | Only `POST /cancel`; Coming-Soon UI, no buttons |
| 10 | Billing history/invoices | NOT_IMPLEMENTED | Honest empty states; 4 tables are google/subscription/account/usage only (full `CREATE TABLE` list verified) |
| 11 | Payment abstraction | NOT_IMPLEMENTED | Zero Midtrans/Snap/webhook/order_id/Server-Key hits in `src` (verified) |
| 12 | Webhooks/events | NOT_IMPLEMENTED | No webhook routes; `account_enforcement_events` is ban-audit, not payments |
| 13 | Frontend screens + APIs | UI_ONLY for paid flows | Studio/Account/Plans/Usage/Billing routes + 3 read-only subscription endpoints (`status/cancel/usage`); no checkout/grant/bill endpoints |

### 2. Commercial findings (Phase 2)

Decided (specs): IDR/monthly, 4 plan names + positioning, plan-aware +
backend-enforcement + no-unlimited principles. Candidate only (never final):
Rp99rb/249rb/599rb, all quotas/seats/Actions/add-ons. No Organization model
exists (only a sidebar display stub + Google scope string) — Business "team"
benefits currently unmappable to any data entity. No annual/trial/grace/
refund/renewal rules anywhere. Upgrade triggers + messages exist as copy only.

### 3. Midtrans readiness (Phase 3)

Code/config readiness: **entirely NOT_IMPLEMENTED** (table row 11). No keys,
no endpoints, no tables, no sandbox/prod config.
Official docs (https://docs.midtrans.com, fetched 2026-11-09):
- Integration choice: **Snap** (hosted/embedded UI, all methods, fastest,
  `payment-overview`) vs **Core API** (custom UI, PCI burden, manual
  activation, BI-SNAP migration context).
- Recurring: **Subscription API** `POST /v1/subscriptions`
  (`reference/create-subscription`, `reference/api-methods-1`): credit_card +
  gopay only; needs One-Click/recurring bank approval; create idempotency key
  (3-min); `retry_schedule`; disable/enable/patch endpoints. Snap supports a
  recurring UI object handing the token to the Subscription API.
- Notifications (`reference/handle-notifications`,
  `docs/https-notification-webhooks`): **SHA512(order_id+status_code+
  gross_amount+ServerKey)**; idempotent handling required (order_id as key);
  out-of-order possible → confirm via **GET Status**; success =
  status_code 200 + fraud ACCEPT + settlement/capture; HTTPS endpoint, respond
  200 <5s (Midtrans waits 15s); statuses pending/capture/settlement/deny/
  cancel/expire/refund/etc. (`docs/transaction-status-cycle`).
- Key architecture consequence: Server Key must stay server-side ⇒ payment
  backend **cannot live in the desktop/Electron bundle**; it belongs on the
  VPS (`alpha-infra-server.ts`, which already hosts OAuth/sqlite/downloads
  behind `systemd/alpha-infra.service`). Desktop calls it; installer carries
  no secrets (consistent with existing OAuth posture).

### 4. Target architecture (Phase 4)

**A. Ownership:** Google `sub` = Product Identity; subscription owner =
Organization entity (TO BE CREATED — none exists); never email; Drive OAuth
isolated (unchanged).
**B. Lifecycle:** Plan Selection → Checkout Initiation → Midtrans Transaction
→ Customer Payment → Notification → Server-side Verification (signature + GET
Status) → Payment Persistence → Subscription Activation → Entitlement
Assignment → Usage Enforcement. Authority: Midtrans for payment truth;
VPS backend for subscription/entitlement state; desktop renders only.
**C. Data model (minimum, VPS-side sqlite following repo conventions):**
`subscription_plans` (static catalog mirror, versioned), `plan_prices`
(amount IDR, billing period, candidate flag until approved), `subscriptions`
(extend existing: org FK, plan, status, period fields), `payment_transactions`
(order_id UNIQUE, org, amount, status, raw payload ref), `payment_events`
(append-only webhook log, idempotency key UNIQUE), `invoices` (only if
founder requires fiscal documents — else receipts from transaction rows),
`subscription_entitlements` (plan→feature grants, versioned),
`organizations` + `organization_members` (new; Business depends on it).
Reuse: existing `subscriptions` table (extend, don't duplicate), `usage_runs`
(feed quota counters), enforcement-events pattern for audit.
**D. States:** `FREE` (no row, effective) → `PENDING_PAYMENT` (checkout open,
no access change) → `ACTIVE` (settlement verified) → `PAST_DUE` (recovery
window, access continues) → `EXPIRED`/`CANCELED` (existing semantics) →
`SUSPENDED` stays account-level only. Payment failure/expire/refund map to
PAST_DUE/EXPIRED/CANCELED respectively; ban never derives from billing.
**E. Security:** Server Key in VPS env only (same `EnvironmentFile` pattern as
OAuth); Client Key only via Snap embed requirements; no secrets in installer/
bundle (packaged-bundle gate extended to payment patterns); signature verify
+ independent GET Status on every notification; order_id idempotency;
out-of-order resolved by status inquiry; full audit trail; never trust
client-sent amount/status.

### 5. Frontend/API gaps (Phase 5)

| UI area | Has | Missing |
|---|---|---|
| Plans | static catalog render | approved prices, period options |
| Upgrade | Coming-Soon note | checkout creation + status polling (`POST /subscription/checkout`, `GET /subscription/checkout/:id`) |
| Current Plan | live status read | PENDING_PAYMENT state rendering |
| Usage & Quota | ledger table | entitlement/quota computation (needs limits) |
| Billing History | empty state | payment/invoice history (`GET /subscription/payments`) |
| Account | identity + plan | org switcher/membership (needs org model) |

### 6. Roadmap (Phase 6 — dependency order, implement separately)

1. Organizations + membership (VPS sqlite; blocks Business + shared quotas).
2. Plans/prices catalog service (VPS; approved figures only).
3. Payment transactions + events persistence + idempotency (VPS; no gateway yet).
4. Midtrans **sandbox**: Snap transaction creation + notification receiver +
   signature + GET-status verification (behind operator sandbox keys).
5. Activation/entitlement assignment wiring (settlement → row → grants).
6. Usage→quota counters (needs decided limits; ledger already feeds it).
7. Upgrade + billing-history UI (polling states, honest pending).
8. Renewal/expiry/cancel/refund handlers (webhook-driven, idempotent).
9. Security hardening + production readiness review (secret scan, replay tests).
10. Production activation (prod keys, real charges, monitoring).
Each: objective, deps, scope, acceptance, security, tests, deploy note,
Go-Live delta — to be specified per task at kickoff.

### 7. Owner decision register (Phase 7)

Blocking technical start: final prices + periods; org model confirmation
(single-user vs org-owned Business); entitlements per plan; Midtrans method
(Snap recommended) + recurring-vs-manual strategy; trial/grace/renew/cancel/
refund rules. Deferrable: add-ons, annual pricing, invoice formalism, support
SLA. Billing provider beyond Midtrans: not evaluated (brief fixes Midtrans).

## Final Verdict

**`MONETIZATION_ARCHITECTURE_AND_MIDTRANS_READINESS_VERIFIED`** — inventory
complete and evidenced; provider research cited to official docs; architecture
specified without inventing prices, limits, or code. Implementation explicitly
not started; zero repo modifications (verified below).
