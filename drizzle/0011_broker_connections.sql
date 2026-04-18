CREATE TABLE `broker_connections` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `assetClass` enum('stock','forex','crypto','commodity') NOT NULL,
  `venue` varchar(64) NOT NULL,
  `label` varchar(128),
  `environment` enum('paper','live') NOT NULL,
  `credentialAadKey` varchar(64) NOT NULL,
  `credentialsEncrypted` text NOT NULL,
  `keyHintSuffix` varchar(16),
  `isActive` boolean NOT NULL DEFAULT true,
  `lastVerifiedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `broker_connections_id` PRIMARY KEY(`id`),
  UNIQUE KEY `broker_connections_user_slot` (`userId`, `assetClass`, `venue`, `environment`),
  UNIQUE KEY `broker_connections_aad_key` (`credentialAadKey`)
);

CREATE TABLE `user_execution_prefs` (
  `userId` int NOT NULL,
  `defaultMode` enum('backtest','paper','live') NOT NULL DEFAULT 'backtest',
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_execution_prefs_userId` PRIMARY KEY(`userId`)
);
