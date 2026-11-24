# API and database contract inventory

## Core contracts

- Customer captive API: `/api/hotspot` (`routes/hotspotApi.js`), login/register/connect/disconnect/voucher/ads/dashboard/usage/notifications. Tables: `users`, `packages`, `vouchers`, `payments`, campaign/ads, connection logs. Wi-Fi guard checks captive network context; customer session checks vary by route.
- ClickPesa: `/api/clickpesa/pay|preview|status/:orderReference|confirm/:orderReference|webhook` (`routes/clickpesa.js`). Tables: `clickpesa_transactions`, `payment_events` (new callback flow), `payments`, `wallets`, `transactions`; fulfill service also expects payment ledger and router attribution records.
- Reseller: `/api/reseller` guarded by `resellerAuth` (`routes/reseller.js`); reseller, voucher, wallet and withdrawal tables.
- Franchise/location: `/api/locations`; `my-locations`/performance role-scoped; admin CRUD. Tables: locations/mikrotiks/logs.
- Admin/business/HQ: broad admin guarded route groups; users, campaign, packages, router, payment and finance tables.
- RADIUS: auth/accounting packets map username/MAC to users and store session high-water totals in `radius_usage_sessions`; FreeRADIUS site invokes `detail`, `sql`, `perl` for accounting (`sites-available/hotbando:32-36`).

## Contract mismatches and schema gaps

Finding P1 — fulfillment writes `payment_ledger` but supplied schema does not define it. `services/paymentFulfillment.js:248-263` inserts into `payment_ledger` and catches/logs errors; migration `database/migrations/20251028_add_payments_ledger.sql:1-26` creates a table named `payments`, while base `database/schema.sql:682-695` also has a different `payments` table for package activations. The fulfillment lookup also queries `routers` by id, while operational schema uses `mikrotiks` with string `router_id` (`services/paymentFulfillment.js:235-263`, `schema.sql:164-205`). Frontend entry: payments/admin finance views. Route/controller: ClickPesa webhook/status → `paymentFulfillment`. Impact: payment fulfillment may complete without intended ledger; router business/partner attribution may fail. Proposed fix is mission B3, mandatory ledger/schema/name alignment and transaction rollback.

Finding P1 — `pending_package_grants`, `user_devices`, and several other queried entities are not in base schema; determine required migrations before clean install. Evidence `utils/pendingGrants.js:26-47`; `routes/business.js:130-135` catches missing `user_devices`; verify every dependency against migrations. Frontend: customer login/gifts/admin 360. Risk: installation drift and silent omission.

Finding P1 — package entitlement helper requires a transaction for its `FOR UPDATE` lock to protect read-modify-write (`utils/packageEntitlement.js:1-29`), but callers pass pool `db` directly: voucher redemption `hotspotController.js:1468`, paid activation `:1650`, and `claimPendingGrants` callers at `:273,495`. Transaction-managed ClickPesa paths use a connection. Frontend entry: voucher, package purchase, login/gift claim. Impact: locking promise is not consistently held across write and grant state. This is Phase 3c open item.

Finding P1 — investor API creates investment rows without collecting/debiting funds (`investorController.js:130-159`) and hard-codes expected ROI at 14%/10%; tables `investors`, `investment_returns`. UI: investor investment form. Expected funding/legal behavior is UNDEFINED BUSINESS RULE; displayed investment can be bookkeeping only.

## HTTP safety

Receipt-token ownership exists for guest ClickPesa status/confirm (Phase 1 code); admin payment endpoints are guarded. Partner ownership should be verified for every update/delete route. `routes/zeroTouch.js` exposes legacy bootstrap/register and provisioning surfaces; deployment secrets/approval controls should be audited in B5. No request was sent to external APIs.
