ALTER TABLE `documents` ADD `selectedStructure` enum('tree','conceptMap','learningPath');--> statement-breakpoint
ALTER TABLE `documents` ADD `structureLocked` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `learningSessions` ADD `evaluationEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `learningSessions` ADD `evaluationPolicyId` int;--> statement-breakpoint
ALTER TABLE `learningSessions` ADD `selectedStructure` enum('tree','conceptMap','learningPath');