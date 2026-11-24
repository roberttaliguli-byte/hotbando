# Business model and system discovery

Audit snapshot: `master_01`, 2026-11-24. Phase 3c is absent (no matching commit in `git log master..master_01`); tracked as open item 1. This is a repository code audit, not an end-to-end deployment validation.

## System map

- Frontend: Vue routes/pages in `frontend/src/router/index.js`; customer captive portal (`views/hotspot/*`), reseller (`views/reseller/*`), sponsor/bank (`views/sponsor/*`, `views/bank/*`), franchise (`views/franchise/*`), investor (`views/investor/*`), admin (`views/admin/*`), and public pages. Frontend route guards are presentation controls; API authorization is authoritative.
- API: `index.js` mounts hotspot, admin, HQ, campaign, wallet, revenue share, location, router, business, reseller, investor, ClickPesa, webhook, partner and zero-touch routes. Principal route maps: `routes/hotspotApi.js`, `adminLegacy.js`, `business.js`, `reseller.js`, `campaignRoutes.js`, `locationRoutes.js`, `walletRoutes.js`, `clickpesa.js`, `webhooks.js`, `zeroTouch.js`.
- Services: `services/paymentFulfillment.js`, `paymentReconciler.js`, `routerSplit.js`, `routerRevocation.js`, `withdrawalPayouts.js`; entitlement and grants in `utils/packageEntitlement.js`, `pendingGrants.js`, `expiryScheduler.js`.
- Data: `database/schema.sql` includes users, locations, mikrotiks, sessions/logs, campaigns/ads, wallets/transactions, packages/vouchers/payments, clickpesa_transactions, resellers and investment tables. Some route/service queries depend on migration-created tables absent from base schema; see 10.
- Integrations: ClickPesa (`controllers/clickpesaController.js`, webhook controller and payment client); MikroTik RouterOS (`utils/mikrotik.js`); FreeRADIUS Perl authorization/accounting (`freeradius/perl/hotbando_auth.pl` and site config); WireGuard/collector code (`utils/wireguard.js`, collector-related routes); optional Redis (`config/redis.js`). Provider/router behavior is NOT VERIFIED against live systems.

## Business models

| Model | Classification | Evidence and limitation |
|---|---|---|
| Individual operator | Partial | Router/location records and admin router operations exist (`mikrotiks`, `locations`; `routes/routerFleet.js`); no first-class operator role in user role enum. |
| Multi-location | Partial | `locations.franchise_owner_id`, `mikrotiks.location_id`, location management and franchise UI exist. No universal organization/tenant id; ownership checks are route-specific. |
| ISP | Not implemented as a distinct model | Hotspot/RADIUS billing works as a platform feature, but no ISP tenant/product entity or tenant-scoped subscriber model is present. |
| Franchise | Partial | Franchise-owner role, locations and revenue-share code exist; operator/staff hierarchy and financial settlement lifecycle are incomplete/unclear. |
| Reseller network | Partial | Reseller, voucher, wallet/withdrawal and router assignment paths exist; value and commission sources conflict, and credit handling has failure gaps. |
| Institutional (bank/NGO) | Partial | Bank partner/sponsor campaign creation and leads exist. Funding, budget reservation and campaign completion settlement need validation. |
| Sponsored access/data | Partial | Campaign/legacy ads can award bytes/time. Funding attribution and budget-vs-reward atomicity are not fully enforced. |
| Platform-operated hotspot | Partial | Customer purchase, ClickPesa fulfillment, RADIUS and router integration exist in code. Live provider/router delivery and production operations are NOT VERIFIED. |

## Business-rule decisions needed (UNDEFINED BUSINESS RULE)

Confirm canonical package price/duration/data/speed; reseller margin/commission and effective date; router/HQ/equipment split; who funds and caps campaign rewards; voucher expiry and refund policy; whether suspension preserves paid entitlement; partner hierarchy and data visibility; investor ROI/legal model; withdrawal fees and payout timing. No values are inferred here.
