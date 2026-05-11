ALTER TABLE `knowledgeLibrary` MODIFY COLUMN `documentId` int;--> statement-breakpoint
ALTER TABLE `knowledgeLibrary` ADD `storageKey` varchar(512);--> statement-breakpoint
ALTER TABLE `knowledgeLibrary` ADD `storageUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `knowledgeLibrary` ADD `fileType` enum('pdf','doc','docx','ppt','pptx');--> statement-breakpoint
ALTER TABLE `knowledgeLibrary` ADD `fileSize` int;--> statement-breakpoint
ALTER TABLE `knowledgeLibrary` ADD `extractedText` text;--> statement-breakpoint
ALTER TABLE `learningSessions` ADD `libraryContextIds` json;