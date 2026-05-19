CREATE TABLE `aiConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`providerName` enum('openai','gemini','claude') NOT NULL,
	`apiKeyEncrypted` text NOT NULL,
	`apiKeyMasked` varchar(32) NOT NULL,
	`selectedModel` varchar(128) NOT NULL,
	`isDefault` int NOT NULL DEFAULT 0,
	`connectionStatus` enum('connected','failed','untested') NOT NULL DEFAULT 'untested',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiConnections_id` PRIMARY KEY(`id`)
);
