# Test coverage and safe verification

## Existing verification assets

- `scripts/verify-expiry.js`: offline in-memory DB + stub RouterOS; executed in this audit. All PASS 1-9 (retry on failure, reset on success/no binding, logout preserves persistent user, pending revocation retry/active-entitlement clear, stop-log no balance debit, exhausted sweep disconnect).
- `scripts/verify-radius-accounting.pl`: targets only localhost `scratch3` with a dedicated local test account. Attempted; Perl module's authorize checks ran, then DBI could not connect because local MariaDB socket was unavailable. Accounting cases 1-5 did not run. Do not infer those tests passed.
- `freeradius/perl/hotbando_auth.pl`: Perl syntax compile was not run in this stage.
- No repository-wide unit/e2e framework identified in this pass. Root/frontend package scripts were not run; no installation/build attempted.

## Test matrix proposal

| Area | Unit/stub | Scratch DB | Integration sandbox | Required assertions |
|---|---|---|---|---|
| ClickPesa auth/fulfillment | token owner/guest/wrong/missing/legacy NULL; amount/currency; duplicate event | scratch transaction + rollback/idempotence | provider sandbox only | no cross-order data leak; exactly-once fulfillment and required ledger |
| Voucher redemption | concurrent duplicate claim | transaction failure injection and reseller credit rollback/queue | none | single redemption; entitlement+payment+reseller accounting atomic |
| Entitlement | lock-aware executor tests | parallel purchase/grant | none | no lost package extension; all callers transaction scoped |
| Expiry/revocation | existing stub verifier (passes) | pending rows/retry counter | isolated router test lab | failures preserve state; success removes session/persistent user |
| RADIUS | duplicate/reordered packets | `scratch3`, test users only | FreeRADIUS + test NAS | paid-first exact split, serial accounting, retry on RLM_MODULE_FAIL |
| Tenant access | request authorization matrix | owner fixture rows | none | cross-owner IDs denied on every resource API |
| Campaign rewards | duplicate completion/limit race | budget and reward transaction tests | ad sandbox | one charge/reward, hard cap respected |

NOT VERIFIED: live ClickPesa, live NAS, FreeRADIUS/NAS retry policy, Redis outage/session behavior, zero-touch provision, payout provider. Never test with real customers or production resources.
