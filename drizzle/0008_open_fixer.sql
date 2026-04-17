ALTER TABLE `agent_runs` MODIFY COLUMN `agentType` enum('market_analysis','crypto_monitoring','forex_monitoring','futures_commodities','historical_research','executive_briefing') NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_schedules` MODIFY COLUMN `agentType` enum('market_analysis','crypto_monitoring','forex_monitoring','futures_commodities','historical_research','executive_briefing') NOT NULL;--> statement-breakpoint
ALTER TABLE `kyc_profiles` ADD `selfieUrl1` text;--> statement-breakpoint
ALTER TABLE `kyc_profiles` ADD `selfieUrl2` text;--> statement-breakpoint
ALTER TABLE `kyc_profiles` ADD `selfieUrl3` text;--> statement-breakpoint
-- Backfill legacy single selfie into slot 1 (users must still upload slots 2–3 for new verification).
UPDATE `kyc_profiles` SET `selfieUrl1` = `selfieUrl` WHERE `selfieUrl` IS NOT NULL AND `selfieUrl` != '' AND (`selfieUrl1` IS NULL OR `selfieUrl1` = '');