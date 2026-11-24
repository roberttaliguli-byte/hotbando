# End-to-end actor journeys

“NOT VERIFIED” means a live router or ClickPesa account/device interaction was not performed. Steps below are code paths, not proof of deployed behavior.

## Platform admin

Admin UI (`frontend/src/views/admin/*`) → `/api/admin` legacy/admin route groups → `adminAuth` → controllers and DB (`users`, `locations`, `mikrotiks`, packages, campaign, wallet/payment tables) → optional RouterOS/ClickPesa effects. Admin can manage customers/packages/routers and view finance. Errors are generally returned/logged; customer removal has queued router retry (`services/routerRevocation.js`, `expiryScheduler`). No global transaction wraps many CRUD+router combinations. NOT VERIFIED: actual RouterOS permissions/capabilities and deployed ClickPesa callback configuration.

## Business/franchise owner

Franchise UI → location routes (`/api/locations/my-locations`, `/:id/performance`) → `franchiseAuth`, owner-scoped location read → locations/mikrotiks/log analytics. There is no generic org object and no full owner-scoped management lifecycle for router/customer/payment resources. NOT VERIFIED: physical router deployment and franchise settlement.

## Operator

No user role/session route for operator. Admin router fleet and HQ staff tools are available, but staff records do not translate to a least-privilege operator session. Journey is NOT IMPLEMENTED as a distinct actor until role policy is defined.

## Reseller

Reseller UI (`views/reseller/*`) → `/api/reseller` register/login then `resellerAuth` → voucher generation, balance/top-up, withdrawals/settings → `resellers`, `voucher_batches`, `vouchers`, `transactions`, `reseller_withdrawals`; payout reconciler may call provider. Voucher redemption is customer `/api/hotspot/voucher`. Sale credit exceptions are swallowed in redemption path (`hotspotController.voucher`, lines 1484-1527), and pricing/commission rules conflict. NOT VERIFIED: payout provider and live sales.

## Sponsor/bank partner

Sponsor/bank UI → campaigns API → sponsor/bank auth → campaigns/content/completions/leads and wallet transactions → ad reward to customer free bytes. Admin approval flags are present. Budget charge/reward atomicity and external ad delivery are incomplete/NOT VERIFIED. No live campaign was run.

## End customer

Captive portal registration/login → customer state binding to MAC/router → package list and ClickPesa purchase or voucher redemption / ad completion → payment fulfillment and entitlement update → post-commit best-effort RouterOS connection → FreeRADIUS authorize and accounting → expiry scheduler removes session/persistent hotspot record. Guest can purchase a gift voucher but package purchase requires login. Failures: ClickPesa callback/reconciler retry exists; router connection after payment is best effort; router revocation uses pending retry. NOT VERIFIED: live end-to-end payment, authorization, router access and accounting.

Representative backend entry paths: `routes/hotspotApi.js:83-95`; `controllers/clickpesaController.js:123-240`; `services/paymentFulfillment.js:59-93,118-270`; `freeradius/perl/hotbando_auth.pl`; `utils/expiryScheduler.js:66-234`.
