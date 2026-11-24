const db = require('../config/database');
const mikrotikService = require('../utils/mikrotik');

/**
 * Revoke a customer's RouterOS session and persistent user before changing
 * their database status. If the router cannot be reached, queue the revocation
 * so the expiry scheduler can retry it after the database change.
 */
async function revokeOrQueue(user, reason) {
  const mac = user?.mac_address;
  const routerId = user?.last_router_id;
  if (!mac || !routerId) return { revoked: true, skipped: true };

  let removed = false;
  let errorMessage = 'Router removal failed';
  try {
    removed = await mikrotikService.removeUserFromRouter(mac, routerId);
  } catch (error) {
    errorMessage = error.message || errorMessage;
  }

  if (removed) return { revoked: true, skipped: false };

  try {
    await db.execute(
      `INSERT INTO pending_router_revocations
         (user_id, mac_address, router_id, reason, retry_count, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), reason = VALUES(reason),
         last_error = VALUES(last_error), updated_at = NOW()`,
      [user.id || null, mac, routerId, reason, errorMessage]
    );
  } catch (queueError) {
    // The DB status change must still happen so RADIUS denies the customer.
    console.error(`Could not queue router revocation for ${mac} on ${routerId}:`, queueError.message);
  }

  return { revoked: false, skipped: false, pending: true, error: errorMessage };
}

module.exports = { revokeOrQueue };
