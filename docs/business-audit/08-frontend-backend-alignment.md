# Frontend/backend alignment

| UI action | Frontend/API | Backend effect and refresh | Protection/gap |
|---|---|---|---|
| Customer package purchase | `hotspot/Subscribe.vue` → `/api/clickpesa/preview`, `/pay`, poll `/status/:orderReference` | Server reloads package price; transaction; payment fulfillment; user entitlement; router best effort | Receipt token protects guest status. UI polling/retries rely on idempotent processed lock. NOT VERIFIED with provider. |
| Voucher redeem | `hotspot/Subscribe.vue`/portal → `/api/hotspot/voucher` | conditional `is_used=0`, user entitlement/payment, reseller credit | Conditional claim prevents double redeem; later side effects not one transaction; reseller credit error swallowed. |
| Ads/reward | `hotspot/Ads.vue` → get-ad/complete-ad | campaign/legacy completion and free byte reward | Need check idempotent completion/reward uniqueness and budget atomicity. UI success is not provider-backed. |
| Reseller voucher generation | `reseller/Vouchers.vue` → `/api/reseller/vouchers/generate` | creates batch/vouchers; reseller balance/commission paths | Price constants diverge; backend auth exists; validate double-submit and atomic debit/credit. |
| Reseller withdrawal | `reseller/Withdraw.vue` → `/api/reseller/withdraw` | withdrawal row and reseller balance update; payout worker later | DB transaction exists in controller; provider side effect NOT VERIFIED; UI shows pending. |
| Franchise location list/performance | `franchise/Locations.vue` → `/api/locations/my-locations`, `/api/locations/:id/performance` | owner-scoped location query and performance query | Backend owner predicate exists for performance; no live router operations. |
| Sponsor campaign create/edit | `sponsor/CampaignForm.vue` → campaign APIs | campaign/content tables; approval flag | Need confirm owner predicate on update/detail, budget reservation, duplicate completion prevention. |
| Admin customer suspend/delete | `admin/Users.vue` → `/api/admin/suspend-customer/:id`, delete endpoint | set active/delete row, revoke session/persistent entry or pending retry | Backend admin auth; router outcome can be pending. Customer still rejected by RADIUS after `is_active=0`. |
| Admin router operations | `admin/Routers.vue`, `RouterFleet.vue` → admin routes | MikroTik calls and `mikrotiks` state | Hardware operations NOT VERIFIED; UI must not treat DB status as proof. |

General finding (P1): route-level frontend guards do not guarantee API authorization; test each button/API pair directly. UI code commonly uses async response success then refreshes; automated UI tests are absent. Exact duplicate-submit disabling is page-specific and not uniformly established. No tests were run against live provider/router.
