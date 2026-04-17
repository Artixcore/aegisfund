-- Idempotent: add selfie slots + backfill (safe if columns already exist from scripts/ensure-kyc-selfie-columns.mjs)
SET @db := DATABASE();

SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kyc_profiles' AND COLUMN_NAME = 'selfieUrl1'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `kyc_profiles` ADD COLUMN `selfieUrl1` text', 'SELECT 1');
PREPARE q FROM @sqlstmt;
EXECUTE q;
DEALLOCATE PREPARE q;

SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kyc_profiles' AND COLUMN_NAME = 'selfieUrl2'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `kyc_profiles` ADD COLUMN `selfieUrl2` text', 'SELECT 1');
PREPARE q FROM @sqlstmt;
EXECUTE q;
DEALLOCATE PREPARE q;

SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kyc_profiles' AND COLUMN_NAME = 'selfieUrl3'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `kyc_profiles` ADD COLUMN `selfieUrl3` text', 'SELECT 1');
PREPARE q FROM @sqlstmt;
EXECUTE q;
DEALLOCATE PREPARE q;

UPDATE `kyc_profiles` SET `selfieUrl1` = `selfieUrl`
WHERE `selfieUrl` IS NOT NULL AND `selfieUrl` != ''
AND (`selfieUrl1` IS NULL OR `selfieUrl1` = '');
