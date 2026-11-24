/**
 * Background scheduler — disconnects expired package users from MikroTik
 * and enforces ad timing. Runs every 60 seconds.
 */

const db = require('../config/database');
const mikrotikService = require('./mikrotik');
const { purgeExpiredAds } = require('./adPolicy');
const { processWithdrawalPayouts } = require('../services/withdrawalPayouts');
const { reconcilePayments } = require('../services/paymentReconciler');

class ExpiryScheduler {
    constructor() {
        this.running = false;
        this.interval = null;
    }

    start(intervalMs = 60000) {
        if (this.interval) return;
        this.interval = setInterval(() => this.tick(), intervalMs);
        console.log(`⏰ Expiry scheduler started (every ${intervalMs / 1000}s)`);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async tick() {
        if (this.running) return;
        this.running = true;

        try {
            await this.disconnectExpiredUsers();
            await this.retryPendingRouterRevocations();
            await this.consumeFreeBytes();
        } catch (err) {
            console.error('⚠️ Expiry scheduler error:', err.message);
        }
        try {
            await purgeExpiredAds();
        } catch (err) {
            console.error('⚠️ Ad purge error:', err.message);
        }
        try {
            await reconcilePayments();
        } catch (err) {
            console.error('⚠️ Payment reconciliation error:', err.message);
        }
        try {
            await processWithdrawalPayouts();
        } catch (err) {
            console.error('⚠️ Withdrawal payout error:', err.message);
        } finally {
            this.running = false;
        }
    }

    /**
     * Retire processed disconnect log rows and disconnect active customers
     * whose paid time and free-byte balance are both exhausted. Usage itself
     * is charged only by the RADIUS Perl accounting handler.
     */
    async consumeFreeBytes() {
        try {
            await db.execute(
                'UPDATE user_connection_logs SET bytes_charged = 1 WHERE action = \'disconnect\' AND bytes_charged = 0'
            );

            // This sweep runs even when there are no new disconnect rows. The
            // Perl RADIUS handler may have exhausted free_bytes during an
            // active session, so waiting for a Stop packet would leave access
            // open until another accounting event arrives.
            const [exhaustedUsers] = await db.execute(`
                SELECT id, name, mac_address, last_router_id
                FROM users
                WHERE role = 'customer'
                  AND is_active = 1
                  AND COALESCE(free_bytes, 0) <= 0
                  AND (usage_until IS NULL OR usage_until <= NOW())
                  AND mac_address IS NOT NULL
                  AND last_router_id IS NOT NULL
            `);
            for (const user of exhaustedUsers) {
                try {
                    const removed = await mikrotikService.removeUserFromRouter(
                        user.mac_address,
                        user.last_router_id,
                        { removePersistent: true }
                    );
                    if (removed) {
                        console.log(`⏰ Free data exhausted — disconnected ${user.name}`);
                    } else {
                        console.warn(`⏰ Could not disconnect exhausted user ${user.name} from ${user.last_router_id}`);
                    }
                } catch (e) {
                    console.warn(`⏰ Could not disconnect exhausted user ${user.name}: ${e.message}`);
                }
            }
        } catch (error) {
            console.error('⏰ Free-bytes consumption error:', error.message);
        }
    }

    /**
     * Find all users whose package has expired and disconnect them from MikroTik.
     * Also deactivates their hotspot session on the router.
     */
    async disconnectExpiredUsers() {
        try {
            // Find users who have a paid package (not free tier) that has expired
            // and are still marked with a future usage_until OR have an active MikroTik session
            // Purchases store usage_until from the app clock (local time), so the
            // exact expiry check is done in JavaScript. SQL only narrows candidates.
            const [candidates] = await db.execute(`
                SELECT id, name, phone_number, mac_address, last_router_id, usage_until, package,
                       expiry_disconnect_attempts
                FROM users
                WHERE role = 'customer'
                  AND is_active = 1
                  AND package != 'KARIBU HOT BANDO'
                  AND usage_until IS NOT NULL
                  AND usage_until < DATE_ADD(NOW(), INTERVAL 1 DAY)
            `);
            const expiredUsers = candidates.filter(u => new Date(u.usage_until) < new Date());

            if (expiredUsers.length === 0) return;

            console.log(`⏰ Found ${expiredUsers.length} expired package user(s)`);

            for (const user of expiredUsers) {
                if (user.mac_address && user.last_router_id) {
                    let removed = false;
                    let failureMessage = 'Router removal failed';
                    try {
                        removed = await mikrotikService.removeUserFromRouter(user.mac_address, user.last_router_id, { removePersistent: true });
                    } catch (routerErr) {
                        failureMessage = routerErr.message;
                    }
                    if (!removed) {
                        const attempt = Number(user.expiry_disconnect_attempts || 0) + 1;
                        await db.execute(
                            'UPDATE users SET expiry_disconnect_attempts = COALESCE(expiry_disconnect_attempts, 0) + 1 WHERE id = ?',
                            [user.id]
                        );
                        console.warn(`⏰ Could not revoke expired user ${user.name} from ${user.last_router_id}; attempt ${attempt}: ${failureMessage}`);
                        if (attempt > 5) console.error(`🚨 Expiry router removal has failed ${attempt} times for user ${user.id} (${user.name}) on ${user.last_router_id}`);
                        continue;
                    }
                    console.log(`⏰ Disconnected expired user ${user.name} (${user.phone_number}) from ${user.last_router_id}`);
                }

                // Users without a known router/MAC have no router session to
                // remove. All other rows reach here only after removal succeeds.
                await db.execute(
                    `UPDATE users SET package = 'KARIBU HOT BANDO', usage_until = NULL, usage_start = NULL,
                     expiry_disconnect_attempts = 0, updated_at = NOW() WHERE id = ?`,
                    [user.id]
                );

                // Log the event (action must be in enum: connect/disconnect/timeout/kicked/error)
                if (user.mac_address && user.last_router_id) {
                    try {
                        const [dbRouter] = await db.execute(
                            'SELECT id FROM mikrotiks WHERE router_id = ?',
                            [user.last_router_id]
                        );
                        if (dbRouter.length > 0) {
                            await db.execute(
                                'INSERT INTO user_connection_logs (mac_address, router_id, user_id, action, error_message) VALUES (?, ?, ?, "disconnect", "Package expired")',
                                [user.mac_address, dbRouter[0].id, user.id]
                            );
                        }
                    } catch (_) {}
                }
            }
        } catch (error) {
            console.error('⏰ Expiry check error:', error.message);
        }
    }

    async retryPendingRouterRevocations() {
        try {
            const [pending] = await db.execute(
                `SELECT id, user_id, mac_address, router_id, retry_count
                 FROM pending_router_revocations ORDER BY created_at ASC LIMIT 100`
            );
            for (const revocation of pending) {
                const [users] = await db.execute(
                    'SELECT id, is_active, usage_until, free_bytes FROM users WHERE id = ?',
                    [revocation.user_id]
                );
                const customer = users[0];
                if (customer && Number(customer.is_active) === 1) {
                    const hasTime = customer.usage_until && new Date(customer.usage_until) > new Date();
                    const hasFreeBytes = Number(customer.free_bytes) > 0;
                    if (hasTime || hasFreeBytes) {
                        await db.execute('DELETE FROM pending_router_revocations WHERE id = ?', [revocation.id]);
                        console.log(`Cleared pending router revocation for ${revocation.mac_address}: customer ${customer.id} is active with entitlement (${hasTime ? 'valid usage_until' : 'free_bytes remaining'})`);
                        continue;
                    }
                }
                let removed = false;
                try {
                    removed = await mikrotikService.removeUserFromRouter(
                        revocation.mac_address,
                        revocation.router_id,
                        { removePersistent: true }
                    );
                } catch (error) {
                    console.warn(`Router revocation retry failed for ${revocation.mac_address}: ${error.message}`);
                }

                if (removed) {
                    await db.execute('DELETE FROM pending_router_revocations WHERE id = ?', [revocation.id]);
                    console.log(`✅ Cleared pending router revocation for ${revocation.mac_address} on ${revocation.router_id}`);
                    continue;
                }

                const attempt = Number(revocation.retry_count || 0) + 1;
                await db.execute(
                    `UPDATE pending_router_revocations
                     SET retry_count = retry_count + 1, last_error = ?, updated_at = NOW()
                     WHERE id = ?`,
                    ['Router removal failed', revocation.id]
                );
                console.warn(`Router revocation still pending for ${revocation.mac_address} on ${revocation.router_id}; attempt ${attempt}`);
            }
        } catch (error) {
            console.error('Pending router revocation retry error:', error.message);
        }
    }
}

module.exports = new ExpiryScheduler();
