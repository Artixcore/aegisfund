CREATE TABLE `agent_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentType` enum('market_analysis','crypto_monitoring','forex_monitoring','futures_commodities','historical_research') NOT NULL,
	`status` enum('idle','running','analyzing','complete','alert') NOT NULL DEFAULT 'idle',
	`taskDescription` text,
	`output` json,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`participantName` varchar(128) NOT NULL,
	`participantHandle` varchar(64),
	`encryptionKey` varchar(256),
	`lastMessageAt` timestamp DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`content` text NOT NULL,
	`encrypted` boolean DEFAULT true,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalValueUsd` bigint,
	`btcBalanceSats` bigint,
	`ethBalanceWei` bigint,
	`solBalanceLamports` bigint,
	`snapshotAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolio_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`chain` enum('BTC','ETH','SOL') NOT NULL,
	`address` varchar(128) NOT NULL,
	`label` varchar(64),
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallets_id` PRIMARY KEY(`id`)
);
