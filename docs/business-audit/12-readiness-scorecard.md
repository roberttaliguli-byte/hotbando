# Readiness scorecard

Scale: 0 absent, 10 demonstrated production-grade. Scores reflect repository evidence and safe checks, not uptime or live integration.

| Area | Score | Evidence / gap |
|---|---:|---|
| Product model clarity | 4/10 | Multiple segments implemented, but prices/commissions/reward funding/roles are not canonical. |
| Customer purchase and access | 6/10 | ClickPesa, fulfillment, RADIUS and router paths exist; full live path NOT VERIFIED; ledger mismatch. |
| Payment integrity | 4/10 | transaction lock and idempotency present; optional ledger failure swallowed; multiple payment state stores. |
| Voucher/reseller accounting | 3/10 | voucher claim guard exists; later effects nontransactional and commission mismatch. |
| Access control/tenant isolation | 5/10 | role middleware exists and some owner checks; no universal tenant model or proven complete per-resource enforcement. |
| Router lifecycle | 5/10 | revocation queue and expiry verifier; live NAS and provisioning approval NOT VERIFIED; Phase 3c absent. |
| Usage accounting | 6/10 | Perl accounting high-water/locking logic; scratch DB unavailable to test in this audit; NAS behavior unknown. |
| Campaigns/sponsored data | 4/10 | campaign/ad CRUD and rewards exist; budget atomicity/funding and duplicate paths unresolved. |
| Financial operations | 3/10 | wallet/reseller/revenue/investor tables and screens; duplicated balances and incomplete settlement/refund proof. |
| Observability/recovery | 5/10 | logs, reconciler and retry counters; no full service health/alerting evidence. |
| Test coverage | 4/10 | valuable targeted scripts, but no broad automated suite; DB-dependent RADIUS test blocked here. |
| Deployment/security readiness | 5/10 | Phase 5 startup validation exists; zero-touch/router and operational runbook still need review. |

**Overall assessment: PARTIALLY INTEGRATED COMMERCIAL PRODUCT.** Code connects material portions of checkout, access, accounting and operations, but core financial consistency, owner isolation, policy definition and production integration evidence are incomplete. This is not a deployment certification.
