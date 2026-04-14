ALTER TABLE `wallets` ADD `mpcWalletId` varchar(128);--> statement-breakpoint
ALTER TABLE `wallets` ADD `custodyModel` enum('watch_only','mpc') NOT NULL DEFAULT 'watch_only';--> statement-breakpoint
ALTER TABLE `wallets` ADD `walletPolicy` json;--> statement-breakpoint
ALTER TABLE `messages` ADD `bodyEncoding` enum('plain','aes_gcm_v1') NOT NULL DEFAULT 'plain';--> statement-breakpoint
ALTER TABLE `messages` ADD `ciphertextEnvelope` json;--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int NOT NULL,
	`action` varchar(128) NOT NULL,
	`resource` varchar(128) NOT NULL,
	`resourceId` int,
	`metadata` json,
	`ipHash` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_messaging_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`chain` enum('ETH','SOL','BTC') NOT NULL,
	`address` varchar(128) NOT NULL,
	`challengeMessage` text NOT NULL,
	`signatureHex` varchar(512) NOT NULL,
	`verifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_messaging_identities_id` PRIMARY KEY(`id`)
);
