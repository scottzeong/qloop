CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(1024) NOT NULL,
	`fileSize` int,
	`pageCount` int,
	`analysisStatus` enum('pending','analyzing','done','error') NOT NULL DEFAULT 'pending',
	`structure` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learningSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`documentId` int NOT NULL,
	`startTopicId` varchar(128),
	`startTopicTitle` varchar(512),
	`status` enum('active','completed','paused') NOT NULL DEFAULT 'active',
	`completedTopics` json DEFAULT ('[]'),
	`currentTopicId` varchar(128),
	`totalQuestions` int DEFAULT 0,
	`answeredQuestions` int DEFAULT 0,
	`summary` text,
	`reportSent` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `learningSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessionMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`role` enum('ai','user') NOT NULL,
	`messageType` enum('question','answer','feedback','user_question','ai_answer','system') NOT NULL,
	`content` text NOT NULL,
	`topicId` varchar(128),
	`topicTitle` varchar(512),
	`questionIndex` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessionMessages_id` PRIMARY KEY(`id`)
);
