CREATE TABLE `documentGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(512) NOT NULL,
	`description` text,
	`analysisStatus` enum('pending','analyzing','done','error') NOT NULL DEFAULT 'pending',
	`structure` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documentGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `groupId` int;--> statement-breakpoint
ALTER TABLE `documents` ADD `fileType` enum('pdf','doc','docx','ppt','pptx') DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE `learningSessions` ADD `groupId` int;