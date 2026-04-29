CREATE TABLE `evaluationDimensions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`description` text,
	`scaleMin` int NOT NULL DEFAULT 0,
	`scaleMax` int NOT NULL DEFAULT 5,
	`rubricsJson` json,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`isSystemDefault` tinyint NOT NULL DEFAULT 1,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `evaluationDimensions_id` PRIMARY KEY(`id`),
	CONSTRAINT `evaluationDimensions_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `learnerSocraticProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learnerId` int NOT NULL,
	`questionTypeScoresJson` json,
	`dimensionScoresJson` json,
	`conceptualUnderstandingScore` float DEFAULT 0,
	`criticalReasoningScore` float DEFAULT 0,
	`perspectiveValueScore` float DEFAULT 0,
	`reflectiveApplicationScore` float DEFAULT 0,
	`slciScore` float DEFAULT 0,
	`slciLevel` varchar(32) DEFAULT 'Fragmented',
	`dominantStrengthsJson` json,
	`recurringWeaknessesJson` json,
	`totalSessionsCompleted` int DEFAULT 0,
	`totalQuestionsAnswered` int DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learnerSocraticProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `learnerSocraticProfiles_learnerId_unique` UNIQUE(`learnerId`)
);
--> statement-breakpoint
CREATE TABLE `learningModules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`sourceType` enum('document','group') NOT NULL DEFAULT 'document',
	`title` varchar(512) NOT NULL,
	`description` text,
	`topicIdsJson` json,
	`conceptIdsJson` json,
	`moduleType` varchar(64) DEFAULT 'topic',
	`difficultyLevel` varchar(32),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learningModules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `moduleEvaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learnerId` int NOT NULL,
	`sessionId` int NOT NULL,
	`moduleTitle` varchar(512),
	`sessionIdsJson` json,
	`questionEvaluationIdsJson` json,
	`questionTypeScoresJson` json,
	`dimensionScoresJson` json,
	`moduleScore` float,
	`moduleLevel` varchar(32),
	`strengthsJson` json,
	`weaknessesJson` json,
	`detectedGapsJson` json,
	`misconceptionsJson` json,
	`recommendedNextModulesJson` json,
	`recommendedNextQuestionTypesJson` json,
	`learnerFeedbackJson` json,
	`teacherAnalysisSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `moduleEvaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questionEvaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learnerId` int NOT NULL,
	`sessionId` int NOT NULL,
	`questionId` int NOT NULL,
	`questionTypeId` int NOT NULL,
	`responseText` text NOT NULL,
	`dimensionScoresJson` json,
	`weightedScore` float,
	`level` varchar(32),
	`strengthsJson` json,
	`weaknessesJson` json,
	`detectedGapsJson` json,
	`misconceptionsJson` json,
	`recommendedNextQuestionTypeId` int,
	`recommendedFollowupQuestion` text,
	`evaluationComment` text,
	`confidence` float,
	`questionTypeSnapshotJson` json,
	`dimensionsSnapshotJson` json,
	`weightsSnapshotJson` json,
	`policySnapshotJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `questionEvaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questionTypeDimensionWeights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionTypeId` int NOT NULL,
	`evaluationDimensionId` int NOT NULL,
	`weight` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questionTypeDimensionWeights_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questionTypes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`description` text,
	`purpose` text,
	`generationGoal` text,
	`promptInstruction` text,
	`selectionRuleJson` json,
	`difficultyRuleJson` json,
	`sourceGroundingRequired` tinyint NOT NULL DEFAULT 1,
	`allowedSourceTypesJson` json,
	`sampleQuestionsJson` json,
	`defaultEnabled` tinyint NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isSystemDefault` tinyint NOT NULL DEFAULT 1,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questionTypes_id` PRIMARY KEY(`id`),
	CONSTRAINT `questionTypes_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`learnerId` int NOT NULL,
	`questionTypeId` int NOT NULL,
	`questionText` text NOT NULL,
	`intent` text,
	`expectedKeyPointsJson` json,
	`sourceReferenceIdsJson` json,
	`difficultyLevel` varchar(32),
	`generationPromptSnapshotJson` json,
	`policySnapshotJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `socraticEvaluationPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int,
	`courseType` enum('document','group','global') NOT NULL DEFAULT 'global',
	`name` varchar(256) NOT NULL,
	`description` text,
	`mode` enum('socratic','exam_prep','project','critical_thinking','custom') NOT NULL DEFAULT 'socratic',
	`enabledQuestionTypeIdsJson` json,
	`enabledDimensionIdsJson` json,
	`questionSequenceJson` json,
	`questionFrequencyJson` json,
	`constraintsJson` json,
	`moduleCompletionRulesJson` json,
	`moduleScoreFormulaJson` json,
	`isDefault` tinyint NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `socraticEvaluationPolicies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','instructor') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `learningSessions` ADD `moduleId` int;--> statement-breakpoint
ALTER TABLE `sessionMessages` ADD `socraticQuestionId` int;--> statement-breakpoint
ALTER TABLE `sessionMessages` ADD `questionTypeName` varchar(64);