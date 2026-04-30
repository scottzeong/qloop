import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  float,
  boolean,
  tinyint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // admin: 전체 관리자, instructor: 교수자, user: 일반 학습자
  role: mysqlEnum("role", ["user", "admin", "instructor"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 문서 그룹 (여러 파일을 묶어 함께 학습)
export const documentGroups = mysqlTable("documentGroups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 512 }).notNull(),
  description: text("description"),
  analysisStatus: mysqlEnum("analysisStatus", ["pending", "analyzing", "done", "error"])
    .default("pending")
    .notNull(),
  structure: json("structure"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DocumentGroup = typeof documentGroups.$inferSelect;
export type InsertDocumentGroup = typeof documentGroups.$inferInsert;

// 업로드된 문서 (PDF / DOC / DOCX / PPT / PPTX)
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  title: varchar("title", { length: 512 }).notNull(),
  fileType: mysqlEnum("fileType", ["pdf", "doc", "docx", "ppt", "pptx"]).default("pdf").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
  fileSize: int("fileSize"),
  pageCount: int("pageCount"),
  analysisStatus: mysqlEnum("analysisStatus", ["pending", "analyzing", "done", "error"])
    .default("pending")
    .notNull(),
  structure: json("structure"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // Open QLoop 모드 활성화 여부
  openQloopEnabled: int("openQloopEnabled").default(0).notNull(),
});
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// 학습 세션
export const learningSessions = mysqlTable("learningSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  documentId: int("documentId").notNull(),
  groupId: int("groupId"),
  startTopicId: varchar("startTopicId", { length: 128 }),
  startTopicTitle: varchar("startTopicTitle", { length: 512 }),
  status: mysqlEnum("status", ["active", "completed", "paused"]).default("active").notNull(),
  completedTopics: json("completedTopics").$type<string[]>(),
  currentTopicId: varchar("currentTopicId", { length: 128 }),
  totalQuestions: int("totalQuestions").default(0),
  answeredQuestions: int("answeredQuestions").default(0),
  summary: text("summary"),
  reportSent: int("reportSent").default(0),
  // 연결된 학습 모듈 ID
  moduleId: int("moduleId"),
  // Open QLoop 모드 (학습 세션 시작 시 문서의 설정을 복사)
  openQloopMode: int("openQloopMode").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type LearningSession = typeof learningSessions.$inferSelect;
export type InsertLearningSession = typeof learningSessions.$inferInsert;

// 세션 내 메시지 (Q&A 히스토리)
export const sessionMessages = mysqlTable("sessionMessages", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  role: mysqlEnum("role", ["ai", "user"]).notNull(),
  messageType: mysqlEnum("messageType", [
    "question",
    "answer",
    "feedback",
    "user_question",
    "ai_answer",
    "system",
  ]).notNull(),
  content: text("content").notNull(),
  topicId: varchar("topicId", { length: 128 }),
  topicTitle: varchar("topicTitle", { length: 512 }),
  questionIndex: int("questionIndex"),
  // 연결된 Socratic 질문 ID (questions 테이블)
  socraticQuestionId: int("socraticQuestionId"),
  // 질문유형 (학습 중 화면 표시용)
  questionTypeName: varchar("questionTypeName", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SessionMessage = typeof sessionMessages.$inferSelect;
export type InsertSessionMessage = typeof sessionMessages.$inferInsert;

// ============================================================
// Socratic Question Type & Evaluation Model
// ============================================================

// 질문유형 (12개 기본 + 관리자 추가 가능)
export const questionTypes = mysqlTable("questionTypes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  description: text("description"),
  purpose: text("purpose"),
  generationGoal: text("generationGoal"),
  promptInstruction: text("promptInstruction"),
  selectionRuleJson: json("selectionRuleJson"),
  difficultyRuleJson: json("difficultyRuleJson"),
  sourceGroundingRequired: tinyint("sourceGroundingRequired").default(1).notNull(),
  allowedSourceTypesJson: json("allowedSourceTypesJson"),
  sampleQuestionsJson: json("sampleQuestionsJson"),
  defaultEnabled: tinyint("defaultEnabled").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isSystemDefault: tinyint("isSystemDefault").default(1).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuestionType = typeof questionTypes.$inferSelect;
export type InsertQuestionType = typeof questionTypes.$inferInsert;

// 평가 요소 (6개 기본)
export const evaluationDimensions = mysqlTable("evaluationDimensions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  description: text("description"),
  scaleMin: int("scaleMin").default(0).notNull(),
  scaleMax: int("scaleMax").default(5).notNull(),
  rubricsJson: json("rubricsJson"),
  enabled: tinyint("enabled").default(1).notNull(),
  isSystemDefault: tinyint("isSystemDefault").default(1).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EvaluationDimension = typeof evaluationDimensions.$inferSelect;
export type InsertEvaluationDimension = typeof evaluationDimensions.$inferInsert;

// 질문유형별 평가요소 가중치 매트릭스
export const questionTypeDimensionWeights = mysqlTable("questionTypeDimensionWeights", {
  id: int("id").autoincrement().primaryKey(),
  questionTypeId: int("questionTypeId").notNull(),
  evaluationDimensionId: int("evaluationDimensionId").notNull(),
  weight: int("weight").default(0).notNull(), // 0~100, 합계 100
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuestionTypeDimensionWeight = typeof questionTypeDimensionWeights.$inferSelect;

// 코스별 Socratic 평가 정책
export const socraticEvaluationPolicies = mysqlTable("socraticEvaluationPolicies", {
  id: int("id").autoincrement().primaryKey(),
  // courseId: document 또는 documentGroup의 ID (courseType으로 구분)
  courseId: int("courseId"),
  courseType: mysqlEnum("courseType", ["document", "group", "global"]).default("global").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  mode: mysqlEnum("mode", ["socratic", "exam_prep", "project", "critical_thinking", "custom"])
    .default("socratic")
    .notNull(),
  enabledQuestionTypeIdsJson: json("enabledQuestionTypeIdsJson").$type<number[]>(),
  enabledDimensionIdsJson: json("enabledDimensionIdsJson").$type<number[]>(),
  questionSequenceJson: json("questionSequenceJson"),
  questionFrequencyJson: json("questionFrequencyJson"),
  constraintsJson: json("constraintsJson"),
  moduleCompletionRulesJson: json("moduleCompletionRulesJson"),
  moduleScoreFormulaJson: json("moduleScoreFormulaJson"),
  isDefault: tinyint("isDefault").default(0).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SocraticEvaluationPolicy = typeof socraticEvaluationPolicies.$inferSelect;

// AI가 실제 생성한 질문 기록
export const questions = mysqlTable("questions", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  learnerId: int("learnerId").notNull(),
  questionTypeId: int("questionTypeId").notNull(),
  questionText: text("questionText").notNull(),
  intent: text("intent"),
  expectedKeyPointsJson: json("expectedKeyPointsJson"),
  sourceReferenceIdsJson: json("sourceReferenceIdsJson"),
  difficultyLevel: varchar("difficultyLevel", { length: 32 }),
  generationPromptSnapshotJson: json("generationPromptSnapshotJson"),
  policySnapshotJson: json("policySnapshotJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = typeof questions.$inferInsert;

// 답변 평가 결과 (내부 분석용)
export const questionEvaluations = mysqlTable("questionEvaluations", {
  id: int("id").autoincrement().primaryKey(),
  learnerId: int("learnerId").notNull(),
  sessionId: int("sessionId").notNull(),
  questionId: int("questionId").notNull(),
  questionTypeId: int("questionTypeId").notNull(),
  responseText: text("responseText").notNull(),
  dimensionScoresJson: json("dimensionScoresJson"), // { accuracy: 3, reasoning: 4, ... }
  weightedScore: float("weightedScore"), // 0~100
  level: varchar("level", { length: 32 }), // Fragmented/Emerging/Developing/Proficient/Advanced
  strengthsJson: json("strengthsJson"),
  weaknessesJson: json("weaknessesJson"),
  detectedGapsJson: json("detectedGapsJson"),
  misconceptionsJson: json("misconceptionsJson"),
  recommendedNextQuestionTypeId: int("recommendedNextQuestionTypeId"),
  recommendedFollowupQuestion: text("recommendedFollowupQuestion"),
  evaluationComment: text("evaluationComment"),
  confidence: float("confidence"),
  // 평가 당시 스냅샷 (정책 변경 후에도 과거 결과 불변)
  questionTypeSnapshotJson: json("questionTypeSnapshotJson"),
  dimensionsSnapshotJson: json("dimensionsSnapshotJson"),
  weightsSnapshotJson: json("weightsSnapshotJson"),
  policySnapshotJson: json("policySnapshotJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QuestionEvaluation = typeof questionEvaluations.$inferSelect;

// 학습 모듈 (학습자가 선택한 학습 단위)
export const learningModules = mysqlTable("learningModules", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").notNull(), // documentId 또는 groupId
  sourceType: mysqlEnum("sourceType", ["document", "group"]).default("document").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  topicIdsJson: json("topicIdsJson"),
  conceptIdsJson: json("conceptIdsJson"),
  moduleType: varchar("moduleType", { length: 64 }).default("topic"),
  difficultyLevel: varchar("difficultyLevel", { length: 32 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LearningModule = typeof learningModules.$inferSelect;

// 모듈 단위 평가 (학습자에게 보여주는 종합 피드백)
export const moduleEvaluations = mysqlTable("moduleEvaluations", {
  id: int("id").autoincrement().primaryKey(),
  learnerId: int("learnerId").notNull(),
  sessionId: int("sessionId").notNull(),
  moduleTitle: varchar("moduleTitle", { length: 512 }),
  sessionIdsJson: json("sessionIdsJson"),
  questionEvaluationIdsJson: json("questionEvaluationIdsJson"),
  questionTypeScoresJson: json("questionTypeScoresJson"),
  dimensionScoresJson: json("dimensionScoresJson"),
  moduleScore: float("moduleScore"),
  moduleLevel: varchar("moduleLevel", { length: 32 }),
  strengthsJson: json("strengthsJson"),
  weaknessesJson: json("weaknessesJson"),
  detectedGapsJson: json("detectedGapsJson"),
  misconceptionsJson: json("misconceptionsJson"),
  recommendedNextModulesJson: json("recommendedNextModulesJson"),
  recommendedNextQuestionTypesJson: json("recommendedNextQuestionTypesJson"),
  // 학습자용 친화적 피드백 (JSON)
  learnerFeedbackJson: json("learnerFeedbackJson"),
  // 교수자용 분석 요약
  teacherAnalysisSummary: text("teacherAnalysisSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModuleEvaluation = typeof moduleEvaluations.$inferSelect;

// 학습자 Socratic 프로파일 (장기 누적)
export const learnerSocraticProfiles = mysqlTable("learnerSocraticProfiles", {
  id: int("id").autoincrement().primaryKey(),
  learnerId: int("learnerId").notNull().unique(),
  questionTypeScoresJson: json("questionTypeScoresJson"),
  dimensionScoresJson: json("dimensionScoresJson"),
  // 4대 사고영역
  conceptualUnderstandingScore: float("conceptualUnderstandingScore").default(0),
  criticalReasoningScore: float("criticalReasoningScore").default(0),
  perspectiveValueScore: float("perspectiveValueScore").default(0),
  reflectiveApplicationScore: float("reflectiveApplicationScore").default(0),
  // SLCI (Socratic Learning Competency Index)
  slciScore: float("slciScore").default(0),
  slciLevel: varchar("slciLevel", { length: 32 }).default("Fragmented"),
  dominantStrengthsJson: json("dominantStrengthsJson"),
  recurringWeaknessesJson: json("recurringWeaknessesJson"),
  totalSessionsCompleted: int("totalSessionsCompleted").default(0),
  totalQuestionsAnswered: int("totalQuestionsAnswered").default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LearnerSocraticProfile = typeof learnerSocraticProfiles.$inferSelect;

// Knowledge Library - 관리자가 선별한 공유 자료
export const knowledgeLibrary = mysqlTable("knowledgeLibrary", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(), // 원본 문서 ID (관리자 소유)
  addedBy: int("addedBy").notNull(),        // 등록한 관리자 userId
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  tags: varchar("tags", { length: 512 }),   // 쉼표 구분 태그
  isPublic: int("isPublic").default(1).notNull(), // 1=공개, 0=비공개
  downloadCount: int("downloadCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type KnowledgeLibraryItem = typeof knowledgeLibrary.$inferSelect;
export type InsertKnowledgeLibraryItem = typeof knowledgeLibrary.$inferInsert;
