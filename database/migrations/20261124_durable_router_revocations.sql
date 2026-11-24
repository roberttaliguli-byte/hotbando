-- Add an expiry disconnect retry counter to customer rows.
SET @hb_expiry_retry_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'expiry_disconnect_attempts'
);

SET @hb_expiry_retry_ddl = IF(
  @hb_expiry_retry_column_exists = 0,
  'ALTER TABLE users ADD COLUMN expiry_disconnect_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER usage_until',
  'SELECT 1'
);

PREPARE hb_expiry_retry_stmt FROM @hb_expiry_retry_ddl;
EXECUTE hb_expiry_retry_stmt;
DEALLOCATE PREPARE hb_expiry_retry_stmt;

-- Preserve router revocations across customer deletion and retry router outages.
SET @hb_pending_revocations_table_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'pending_router_revocations'
);

SET @hb_pending_revocations_ddl = IF(
  @hb_pending_revocations_table_exists = 0,
  'CREATE TABLE pending_router_revocations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT(11) NULL,
    mac_address VARCHAR(50) NOT NULL,
    router_id VARCHAR(50) NOT NULL,
    reason VARCHAR(32) NOT NULL,
    retry_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_pending_router_revocation (mac_address, router_id),
    KEY idx_pending_router_revocations_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);

PREPARE hb_pending_revocations_stmt FROM @hb_pending_revocations_ddl;
EXECUTE hb_pending_revocations_stmt;
DEALLOCATE PREPARE hb_pending_revocations_stmt;
