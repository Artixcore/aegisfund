CREATE TABLE `alert_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`alertId` int,
	`symbol` enum('BTC','ETH','SOL') NOT NULL,
	`condition` enum('above','below') NOT NULL,
	`threshold` decimal(18,2) NOT NULL,
	`priceAtTrigger` decimal(18,2) NOT NULL,
	`triggeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alert_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kyc_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('not_started','pending','under_review','approved','rejected') NOT NULL DEFAULT 'not_started',
	`tier` enum('none','basic','enhanced','institutional') NOT NULL DEFAULT 'none',
	`fullName` varchar(256),
	`dateOfBirth` varchar(32),
	`nationality` varchar(128),
	`countryOfResidence` varchar(128),
	`documentType` varchar(64),
	`documentNumber` varchar(128),
	`documentFrontUrl` text,
	`documentBackUrl` text,
	`selfieUrl` text,
	`rejectionReason` text,
	`submittedAt` timestamp,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kyc_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `kyc_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `mfa_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`totpSecret` varchar(256),
	`backupCodes` json,
	`enabledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mfa_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `mfa_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionToken` varchar(256) NOT NULL,
	`deviceName` varchar(128),
	`deviceType` enum('desktop','mobile','tablet','api') DEFAULT 'desktop',
	`ipAddress` varchar(64),
	`location` varchar(128),
	`isCurrent` boolean DEFAULT false,
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
