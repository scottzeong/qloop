CREATE TABLE `knowledgeLibrary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`addedBy` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`description` text,
	`tags` varchar(512),
	`isPublic` int NOT NULL DEFAULT 1,
	`downloadCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeLibrary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `openQloopEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `learningSessions` ADD `openQloopMode` int DEFAULT 0 NOT NULL;