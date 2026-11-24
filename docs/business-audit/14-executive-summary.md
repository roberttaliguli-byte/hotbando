# Executive summary

## Verdict

**PARTIALLY INTEGRATED COMMERCIAL PRODUCT**

HotBando has connected customer checkout, package entitlements, voucher sales, campaigns, reseller operations, router management and RADIUS accounting in code. Some recent hardening is present on `master_01`: receipt-token ownership, durable router revocations, serialized RADIUS accounting and production environment checks. The targeted offline expiry verifier passes. Phase 3c is absent and the RADIUS database verifier could not run because localhost MariaDB was unavailable.

## P0/P1 list

**P0: none identified by this read-only repository audit.** This does not mean production is safe; no live services were tested.

**P1 findings:**

1. **Phase 3c incomplete:** `utils/packageEntitlement.js:1-29` uses `FOR UPDATE`, but `controllers/hotspotController.js:1468,1650` and `utils/pendingGrants.js` callers at `hotspotController.js:273,495` pass the pool without a transaction. Router scheduler calls are not grouped per router. Frontend: customer voucher/subscribe/login. Tables: users, vouchers, payments, pending_package_grants. Impact: concurrent grants can race or partially commit. Fix: B1; transaction-wrap every caller and scheduler grouping as specified.
2. **Fulfillment ledger contract is broken/optional:** `services/paymentFulfillment.js:235-263` writes `payment_ledger` and queries `routers`, but schema/migration define `payments`/`mikrotiks`; ledger insert failure is caught. Frontend: customer payment/admin finance. Tables: clickpesa_transactions, payment_ledger (missing from schema), payments, mikrotiks. Impact: paid fulfillment may lack required accounting/attribution. Fix: B3 mandatory ledger transaction and naming alignment.
3. **Price conflict:** MWEZI 1 is 40,000 in `controllers/adminController.js:397` and `resellerController.js:12`, versus 20,000 seed `database/schema.sql:775`; ClickPesa uses DB price. Frontend: hotspot subscribe/reseller voucher. Impact: same product priced inconsistently. Fix: B4 after user provides canonical prices.
4. **Commission conflict and swallowed reseller-credit errors:** voucher path hardcodes 20% (`hotspotController.js:1504-1527`) while `resellers.commission_rate` defaults to 10% (`schema.sql:900`) and router sales use assignment `commission_percent`. Failed credits are logged and swallowed (`:1484-1502`). Frontend: reseller vouchers/customer redemption. Impact: wrong or missing reseller earnings. Fix: B2 then B4 after policy decisions.
5. **Ownership checks are uneven:** franchise location performance and investor reads are scoped, but there is no universal tenant id and partner-facing routes need endpoint-by-endpoint proof. See `routes/locationRoutes.js`, `routes/routerFleet.js`, `routes/business.js`, `routes/campaignRoutes.js`, `routes/walletRoutes.js`. Impact: cross-owner access if any route accepts an unscoped resource ID. Fix: B6 with only demonstrated open endpoints.
6. **Investor “invest” records an amount without a funding/debit path and hardcodes ROI:** `controllers/investorController.js:130-159`. Frontend: investor investments. Tables: investors, investment_returns. Impact: dashboard may present unfunded amounts as investments. Funding/ROI/legal policy is UNDEFINED BUSINESS RULE. Decide before enablement.
7. **Campaign reward/budget atomicity and sponsorship funding unclear:** campaigns/completions/reward fields exist, but no proven atomic reservation of budget and reward under concurrent completions. Frontend: sponsor/bank campaign and customer Ads. Impact: overrun or unfunded rewards. Fix after funding/cap rules are defined.
8. **Schema drift:** route/service queries reference tables not in base schema, including `payment_ledger`, `pending_package_grants`, `user_devices`; migration coverage must be reconciled. Impact: fresh install/runtime path failures or silent fallbacks.

## Most valuable improvements

1. Make all monetary/payment and reseller-credit transitions atomic and ledger-backed.
2. Define canonical prices, commissions, refunds, sponsored-data funding and role policies with the business owner.
3. Complete per-resource backend ownership checks and decide the actual organization/operator hierarchy.
4. Finish transaction-safe entitlement/voucher grant paths and validate RADIUS behavior against scratch DB + test NAS.
5. Add end-to-end, failure-injection tests and operational alerts/runbooks for payments, routers, Redis and payouts.

## Business rules requiring user decisions

UNDEFINED: package price tiers and duration/data/speed; reseller/platform/equipment share; voucher expiry/refund; sponsor budget and free-data funding; suspension treatment of paid entitlement; staff/operator permissions; investor source of funds, ROI and payout; withdrawal fee/timing; router transfer effect on customer/sales.

## Verification and limits

- Branch `master_01`; origin remains configured; no source files changed in audit.
- `node scripts/verify-expiry.js`: PASS 1-9 using in-memory DB/router stub.
- `perl scripts/verify-radius-accounting.pl`: authorize checks printed, then DBI failed to connect to localhost `scratch3`; accounting tests not run.
- No live ClickPesa, router, FreeRADIUS/NAS, Redis, or production database access.
