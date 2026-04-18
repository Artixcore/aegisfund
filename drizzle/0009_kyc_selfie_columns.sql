-- Idempotent: add selfie slots + backfill (one statement per chunk for mysql2 migrator)
SET @db := DATABASE();
--> statement-breakpoint
SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kyc_profiles' AND COLUMN_NAME = 'selfieUrl1'
);
--> statement-breakpoint
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `kyc_profiles` ADD COLUMN `selfieUrl1` text', 'SELECT 1');
--> statement-breakpoint
PREPARE q FROM @sqlstmt;
--> statement-breakpoint
EXECUTE q;
--> statement-breakpoint
DEALLOCATE PREPARE q;
--> statement-breakpoint
SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kyc_profiles' AND COLUMN_NAME = 'selfieUrl2'
);
--> statement-breakpoint
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `kyc_profiles` ADD COLUMN `selfieUrl2` text', 'SELECT 1');
--> statement-breakpoint
PREPARE q FROM @sqlstmt;
--> statement-breakpoint
EXECUTE q;
--> statement-breakpoint
DEALLOCATE PREPARE q;
--> statement-breakpoint
SET @exist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kyc_profiles' AND COLUMN_NAME = 'selfieUrl3'
);
--> statement-breakpoint
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `kyc_profiles` ADD COLUMN `selfieUrl3` text', 'SELECT 1');
--> statement-breakpoint
PREPARE q FROM @sqlstmt;
--> statement-breakpoint
EXECUTE q;
--> statement-breakpoint
DEALLOCATE PREPARE q;
--> statement-breakpoint
UPDATE `kyc_profiles` SET `selfieUrl1` = `selfieUrl`
WHERE `selfieUrl` IS NOT NULL AND `selfieUrl` != ''
AND (`selfieUrl1` IS NULL OR `selfieUrl1` = '');
