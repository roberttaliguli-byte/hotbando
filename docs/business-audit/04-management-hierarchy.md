# Management hierarchy and tenant isolation

## Data links

| Link | Evidence | Integrity status |
|---|---|---|
| Platform → user | `users` table and role enum (`schema.sql:16`) | Roles exist; no business/organization tenant table is universal. |
| User → location | `users.location_id` | Column exists without FK; other location association is string `users.location`. |
| Franchise owner → location | `locations.franchise_owner_id` FK to users with `ON DELETE SET NULL` (`schema.sql:136-160`) | DB-enforced direct owner link. |
| Location → router | `mikrotiks.location_id` FK to locations with `ON DELETE SET NULL` (`schema.sql:164-205`) | DB-enforced; router operations use router_id string in many APIs. |
| Router → session logs | `user_connection_logs.router_id` FK to mikrotiks id; user FK sets NULL (`schema.sql:209-230`) | DB-enforced on logs. |
| Router → customer binding | `users.last_router_id` string; `mac_address` string | No FK to `mikrotiks.router_id`; code resolves some paths. |
| Reseller → sales/customer | reseller row keyed to user; voucher batch `created_by`, vouchers `batch_id`/`used_by` | No direct reseller-customer relationship; voucher history is indirect. |
| Campaign owner → campaign | `campaigns.owner_id` FK users with cascade | Direct owner link; completions link campaign/user. |
| Customer → payment | clickpesa transaction user_id is indexed but no FK in schema; payments table user_id FK | Duplicate payment stores and inconsistent ledger structure. |
| Wallet owner | wallets.user_id FK to users, unique | Direct ownership, but many admin finance queries aggregate global data. |

## Owner-scoped examples and gaps

- Franchise location list: `models/Location.js` `getLocationsByFranchiseOwner(user.id)` called by `controllers/locationController.js:53-62`.
- Franchise performance: explicit owner check `controllers/locationController.js:242-265`.
- Investor portfolio queries are scoped by `i.user_id = req.user.id` (`controllers/investorController.js:17-30,95-110`).
- Reseller APIs are behind `resellerAuth` (`routes/reseller.js:11-25`); verify each controller query’s reseller user id. Admin alternative role is also accepted by middleware.
- Admin-only business customer endpoints query all customer rows; this is global admin functionality, not owner scoped (`routes/business.js:10-21`).
- No single `tenant_id` binds users, payments, campaigns, routers and wallets. Parent franchise field exists on users but has no FK (`schema.sql:51`).

Finding (P1): Router/resource isolation relies on per-route implementation and identifiers, not a tenant boundary. Evidence: `schema.sql:16-73,136-205`; examples above. Frontend entries: franchise locations, reseller router pages, admin fleet. Routes: locations, router fleet/admin legacy. Impact: any partner-facing endpoint missing its own owner predicate can cross tenant boundaries. Proposed fix for B6: prove open endpoints then add smallest owner checks.

Finding (P1): Multiple API queries accept resource IDs and some are broadly admin-gated; no role scoping within admin/super_admin. Evidence: `routes/business.js:10` and customer detail `/customers/:id` at line 107; schema `users`, `clickpesa_transactions`. This is expected for platform administrators but cannot support delegated staff securely. Scope depends on undefined staff/organization rules.
