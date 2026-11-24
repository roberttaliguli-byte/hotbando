# Remediation roadmap (mission order)

No implementation changes are made in Stage A. Each phase requires its own explicit “go” and one commit.

| Order | Work | Audit evidence / gate |
|---|---|---|
| B0 | Re-verify production env checklist and placeholder behavior | Review startup config check and every actual runtime use; exclude seed/setup-only variables. Never print values. |
| B1 | Phase 3c items | Scheduler router grouping absent; make every `extendUserPackage` call transaction-safe, including voucher/package/gift claims. Scratch verifier. |
| B2 | Voucher redemption atomicity | One DB transaction for claim, package extension, payment history, reseller credit/history; credit failure rollback or durable queue. Keep conditional `is_used=0`. |
| B3 | Mandatory consistent payment ledger | Resolve `payment_ledger` vs `payments`, `routers` vs `mikrotiks`; add idempotent migration/schema and fail transaction on ledger error. |
| B4 | Price/commission source of truth | BLOCKED pending user decision on exact price/commission values and policy. No code choice before decision. |
| B5 | Zero-touch owner approval and secret handling | Audit existing bootstrap compatibility; approval gate; remove credential from URL; ask before changing bootstrap format. |
| B6 | Resource ownership | Fix only proven open endpoints (routers, locations, customers, wallets, campaigns, reports), smallest per-route owner checks; no new tenant schema. |
| B7 | Scratch tests | Add/run payment authorization, expiry/revocation, RADIUS math, voucher redemption tests on scratch DB only. |

Proposed priority: B3, B1, B2, B6, B5, B7, B0 and B4 sequencing subject to user authorization and B4 decisions. P0: none identified from static review; no evidence supports declaring a currently exploitable critical incident. P1 items listed in executive summary. Deploy DB migrations before code that requires them; restart/reload FreeRADIUS only for RADIUS changes, and coordinate router-affecting changes in a lab before rollout.
