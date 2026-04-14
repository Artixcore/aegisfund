CREATE TABLE `agent_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentType` enum('market_analysis','crypto_monitoring','forex_monitoring','futures_commodities','historical_research') NOT NULL,
	`intervalHours` int NOT NULL DEFAULT 4,
	`isActive` boolean NOT NULL DEFAULT false,
	`lastRunAt` timestamp,
	`nextRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` enum('BTC','ETH','SOL') NOT NULL,
	`condition` enum('above','below') NOT NULL,
	`threshold` decimal(18,2) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`triggeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_alerts_id` PRIMARY KEY(`id`)
);
