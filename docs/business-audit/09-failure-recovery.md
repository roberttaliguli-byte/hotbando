# Failure and recovery analysis (code review only)

| Scenario | Observed handling | Remaining risk / priority |
|---|---|---|
| Payment succeeds then app crashes | ClickPesa webhook/status reconciler can retry fulfillment; transaction lock/processed guard | P1: fulfillment side effects + optional ledger insert lack all-or-nothing integrity; audit for each payment kind. |
| Webhook twice | payment row lock and processed guard in fulfillment; payment_events supports unique provider ref+event type in newer callback path | P2: older controller path and event path coexist; replay behavior NOT VERIFIED. |
| Router offline during expiry | leave entitlement reset untouched, increment retry counter; pending revocation retries | P2: offline stub passes; actual scheduler interval and router grouping/scale not verified; Phase 3c absent. |
| DB restart | API DB calls fail to handlers; RADIUS accounting rollback returns FAIL; scheduler logs error | P1: durable queue depends on DB; no demonstrated service-wide health/readiness recovery. |
| Redis restart | optional Redis client reconnect strategy; connect failure logged nonfatal (`config/redis.js:8-60`) | P1/P2: session store behavior on outage may log users out or fail requests; not exercised. |
| Duplicate payment submit | unique order reference and per-order fulfillment lock | P2: multiple orders for same package are valid; no duplicate-intent/idempotency key from UI evident. |
| Concurrent voucher redemption | `UPDATE ... WHERE is_used=0` affectedRows guard | P1: subsequent package/payment/reseller operations are not one transaction; potential partial state. |
| Wallet change during sale | several paths use row lock/transactions, others ordinary relative update | P1: balance and history consistency not uniform; no concurrency test for all paths. |
| Campaign budget exhausted mid-reward | campaign limits/budget fields and completion/reward paths exist | P1: no confirmed atomic reservation for budget and reward; concurrency behavior unverified. |
| Staff removed while logged in | no staff role/session revocation link identified | P1: staff management does not establish session invalidation. Policy/role itself undefined. |
| Organization suspended while customers connected | no universal organization entity/suspension state | P1: not representable as a consistent cascade across routers/customers. |
| Router transferred | location/assignment history tables exist | P1: no end-to-end transfer transaction covering router ownership, active sessions, revenue attribution and customer bindings identified. |
| Accounting Stop/retransmit | Perl RADIUS high-water totals under row lock make repeated octet totals zero delta; scheduler only marks disconnect rows charged | P1 until DB verifier runs; local MariaDB unavailable in audit. NAS retry semantics NOT VERIFIED. |
| Device change | user MAC/router binding updated on login; add-user call best effort | P2: old device session revocation and account sharing policy unclear. |

Fixes are proposals for later stages only. No failure was induced against a real service.
