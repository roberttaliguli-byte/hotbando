-- Store only the SHA-256 digest of one-time customer receipt tokens.
-- Information-schema check keeps this safe to rerun on upgraded databases.
SET @hb_receipt_token_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'clickpesa_transactions'
    AND column_name = 'receipt_token_hash'
);

SET @hb_receipt_token_ddl = IF(
  @hb_receipt_token_column_exists = 0,
  'ALTER TABLE clickpesa_transactions ADD COLUMN receipt_token_hash CHAR(64) NULL AFTER order_reference',
  'SELECT 1'
);

PREPARE hb_receipt_token_stmt FROM @hb_receipt_token_ddl;
EXECUTE hb_receipt_token_stmt;
DEALLOCATE PREPARE hb_receipt_token_stmt;
