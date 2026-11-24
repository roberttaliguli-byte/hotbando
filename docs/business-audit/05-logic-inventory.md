# Logic inventory and connected-path audit

| Domain | UI/API/backend/data/external effect | Completeness |
|---|---|---|
| Customer login/register | Captive UI → `hotspotApi` → hotspot controller → users/session/MAC binding → MikroTik user add → RADIUS | Partial; router call is best effort and real NAS interaction NOT VERIFIED. |
| Package payment | Subscribe → ClickPesa preview/pay/status/confirm/webhook → transaction → `paymentFulfillment` → package entitlement/payment row → router best effort | Partial; code path connected but ledger schema mismatch and fulfillment ledger is swallowed; see 06/10. |
| Voucher sale/redemption | Reseller voucher UI/API → batches/vouchers → customer redeem conditional `is_used=0` → package entitlement/payment → reseller credit | Partial; redemption operations are not one transaction and reseller credit errors are swallowed (`hotspotController.js:1458-1527`). |
| Usage accounting | MikroTik RADIUS accounting → Perl transaction/high-water totals → paid/free relative deductions → scheduler cleanup | Implemented in code; scratch DB verification unavailable in this audit due DB socket. Live NAS retry semantics NOT VERIFIED. |
| Expiry/revocation | Scheduler → active/persistent router removal → reset package or retry/pending row | Partial; offline stub verifier passes; production scheduler/router topology unverified. Phase 3c router grouping absent. |
| Campaign/ad rewards | Sponsor/bank campaign UI → campaign APIs/content → completion/legacy ad view → free bytes or time reward | Partial; campaign paths coexist with legacy ads; budget funding/claim invariants unclear. |
| Reseller wallet/withdrawal | Reseller UI → authenticated routes → reseller balance, withdrawals, transactions → payout reconciler/provider | Partial; financial policy unresolved; external payout not tested. |
| Locations/router fleet | Admin/franchise pages → location/fleet APIs → locations/mikrotiks/router actions | Partial; no single tenant hierarchy and zero-touch router bootstrap requires deployment review. |
| Investor | Investor pages/API → investor/return rows | Prototype-like; `invest()` records an investment with hard-coded expected ROI, no linked receipt/debit/payout path established (`investorController.js:130-159`). |
| Redis/session | optional `REDIS_ENABLED` client and session integration | Optional; connect failure is logged nonfatal (`config/redis.js:4-60`). Redis outage behavior for sessions not verified. |

Definition used: implemented means UI→API→permission→DB transaction→external effect→failure/retry are connected. A displayed page or endpoint alone is not counted as complete.
