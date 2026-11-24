#!/usr/bin/env node
/*
 * Offline verification of expiry and router-revocation retry behavior.
 * It uses an in-memory DB adapter and a RouterOS connection stub; it never
 * connects to production databases or live routers.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const state = { users: [], pending: [], logs: [], nextPendingId: 1 };

const fakeDb = {
  async execute(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.startsWith('select id, name, phone_number, mac_address, last_router_id, usage_until, package')) {
      return [state.users.filter(user => user.package !== 'KARIBU HOT BANDO' && user.usage_until)];
    }
    if (normalized.startsWith('update users set expiry_disconnect_attempts')) {
      const user = state.users.find(row => row.id === params[0]);
      if (user) user.expiry_disconnect_attempts = Number(user.expiry_disconnect_attempts || 0) + 1;
      return [{ affectedRows: user ? 1 : 0 }];
    }
    if (normalized.startsWith('update users set package =')) {
      const user = state.users.find(row => row.id === params[0]);
      if (user) {
        user.package = 'KARIBU HOT BANDO';
        user.usage_until = null;
        user.usage_start = null;
        user.expiry_disconnect_attempts = 0;
      }
      return [{ affectedRows: user ? 1 : 0 }];
    }
    if (normalized.startsWith('select id from mikrotiks')) return [[]];
    if (normalized.startsWith('insert into user_connection_logs')) {
      state.logs.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('select id, user_id, mac_address, router_id, retry_count from pending_router_revocations')) {
      return [[...state.pending].sort((a, b) => a.id - b.id).slice(0, 100)];
    }
    if (normalized.startsWith('insert into pending_router_revocations')) {
      const [user_id, mac_address, router_id, reason, last_error] = params;
      let row = state.pending.find(item => item.mac_address === mac_address && item.router_id === router_id);
      if (!row) {
        row = { id: state.nextPendingId++, retry_count: 0 };
        state.pending.push(row);
      }
      Object.assign(row, { user_id, mac_address, router_id, reason, last_error });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('update pending_router_revocations')) {
      const row = state.pending.find(item => item.id === params[1]);
      if (row) {
        row.retry_count += 1;
        row.last_error = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (normalized.startsWith('delete from pending_router_revocations')) {
      state.pending = state.pending.filter(item => item.id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected fake DB query: ${sql}`);
  }
};

const dbPath = require.resolve('../config/database');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeDb
};

const schedulerPath = require.resolve('../utils/expiryScheduler');
const adPolicyPath = require.resolve('../utils/adPolicy');
const payoutsPath = require.resolve('../services/withdrawalPayouts');
const reconcilerPath = require.resolve('../services/paymentReconciler');
require.cache[adPolicyPath] = { id: adPolicyPath, filename: adPolicyPath, loaded: true, exports: { purgeExpiredAds: async () => {} } };
require.cache[payoutsPath] = { id: payoutsPath, filename: payoutsPath, loaded: true, exports: { processWithdrawalPayouts: async () => {} } };
require.cache[reconcilerPath] = { id: reconcilerPath, filename: reconcilerPath, loaded: true, exports: { reconcilePayments: async () => {} } };

const scheduler = require(schedulerPath);
const mikrotikService = require('../utils/mikrotik');
const { revokeOrQueue } = require('../services/routerRevocation');

let routerUnavailable = false;
let activeSessions = [];
let localUsers = [];
const writes = [];
const routerConnection = {
  async write(command, args = []) {
    writes.push({ command, args });
    if (routerUnavailable) throw new Error('stub router unavailable');

    const query = args.find(value => String(value).startsWith('?')) || '';
    if (command === '/ip/hotspot/active/print') return [...activeSessions];
    if (command === '/ip/hotspot/active/remove') {
      activeSessions = activeSessions.filter(row => row['.id'] !== args[0].slice('=.id='.length));
      return [];
    }
    if (command === '/ip/hotspot/user/print') {
      const [key, value] = query.slice(1).split('=');
      return localUsers.filter(row => row[key] === value);
    }
    if (command === '/ip/hotspot/user/remove') {
      localUsers = localUsers.filter(row => row['.id'] !== args[0].slice('=.id='.length));
      return [];
    }
    throw new Error(`Unexpected RouterOS command: ${command}`);
  }
};

mikrotikService.operationTimeoutMs = 1000;
mikrotikService.getRouterConnection = async () => mikrotikService._patchConnectionWrites(routerConnection);
mikrotikService.resolveRouterDbId = async () => 1;

const expiredUser = (id, overrides = {}) => ({
  id,
  name: `Customer ${id}`,
  phone_number: `2557000000${id}`,
  mac_address: 'AA:BB:CC:DD:EE:FF',
  last_router_id: 'router-test',
  usage_until: new Date(Date.now() - 60_000),
  package: 'WIKI 1',
  expiry_disconnect_attempts: 0,
  ...overrides
});

async function main() {
  // 1. Router failure must preserve entitlement fields and increment retries.
  state.users = [expiredUser(1)];
  routerUnavailable = true;
  await scheduler.disconnectExpiredUsers();
  assert.notStrictEqual(state.users[0].usage_until, null);
  assert.strictEqual(state.users[0].package, 'WIKI 1');
  assert.strictEqual(state.users[0].expiry_disconnect_attempts, 1);
  console.log('PASS 1: router failure leaves usage_until/package unchanged and increments expiry retry counter');

  // 2. A successful revocation removes active and persistent RouterOS records,
  // then clears the expired package.
  routerUnavailable = false;
  activeSessions = [{ '.id': '*active-1' }];
  localUsers = [{ '.id': '*user-1', name: 'AA:BB:CC:DD:EE:FF', 'mac-address': 'AA:BB:CC:DD:EE:FF' }];
  await scheduler.disconnectExpiredUsers();
  assert.strictEqual(state.users[0].package, 'KARIBU HOT BANDO');
  assert.strictEqual(state.users[0].usage_until, null);
  assert.strictEqual(state.users[0].expiry_disconnect_attempts, 0);
  assert.deepStrictEqual(activeSessions, []);
  assert.deepStrictEqual(localUsers, []);
  assert(writes.some(row => row.command === '/ip/hotspot/user/remove'));
  console.log('PASS 2: router success removes active/persistent records and resets the package');

  // 3. With no MAC/router binding there is no router session to remove.
  state.users = [expiredUser(2, { mac_address: null, last_router_id: null })];
  const writesBeforeUnbound = writes.length;
  await scheduler.disconnectExpiredUsers();
  assert.strictEqual(state.users[0].package, 'KARIBU HOT BANDO');
  assert.strictEqual(state.users[0].usage_until, null);
  assert.strictEqual(writes.length, writesBeforeUnbound);
  console.log('PASS 3: an expired user without a MAC/router is reset immediately');

  // 4. Queue a failed suspend/delete revocation, retain it after a failed
  // scheduler attempt, then clear it after the stub router becomes reachable.
  routerUnavailable = true;
  activeSessions = [{ '.id': '*active-2' }];
  localUsers = [{ '.id': '*user-2', name: 'AA:BB:CC:DD:EE:FF', 'mac-address': 'AA:BB:CC:DD:EE:FF' }];
  const queued = await revokeOrQueue({ id: 3, mac_address: 'AA:BB:CC:DD:EE:FF', last_router_id: 'router-test' }, 'delete');
  assert.strictEqual(queued.pending, true);
  assert.strictEqual(state.pending.length, 1);
  await scheduler.retryPendingRouterRevocations();
  assert.strictEqual(state.pending.length, 1);
  assert.strictEqual(state.pending[0].retry_count, 1);

  routerUnavailable = false;
  await scheduler.retryPendingRouterRevocations();
  assert.strictEqual(state.pending.length, 0);
  assert.deepStrictEqual(activeSessions, []);
  assert.deepStrictEqual(localUsers, []);
  console.log('PASS 4: pending revocation retries after router failure and clears after successful removal');

  // RADIUS authorize consults is_active for both MAC and phone lookups.
  const radiusPath = path.join(__dirname, '..', 'freeradius', 'perl', 'hotbando_auth.pl');
  const radiusSource = fs.readFileSync(radiusPath, 'utf8');
  const lookup = radiusSource.slice(radiusSource.indexOf('sub _find_entitled_user'), radiusSource.indexOf('sub _load_allowance'));
  assert.strictEqual((lookup.match(/AND u\.is_active = 1/g) || []).length, 2);
  assert.match(radiusSource, /sub authorize[\s\S]*?_find_entitled_user\(\$username\);\s*return RLM_MODULE_NOTFOUND unless \$result;/);
  const sitePath = path.join(__dirname, '..', 'freeradius', 'sites-available', 'hotbando');
  const siteSource = fs.readFileSync(sitePath, 'utf8');
  assert.match(siteSource, /if \(!ok\)\s*\{\s*reject\s*\}/);
  console.log('PASS RADIUS: authorize returns NOTFOUND for inactive users on both MAC and phone authentication');
}

main().catch(error => {
  console.error('FAIL verify-expiry:', error.stack || error.message);
  process.exitCode = 1;
});
