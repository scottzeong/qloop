import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
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
  // 그룹 분석 상태: pending | analyzing | done | error
  analysisStatus: mysqlEnum("analysisStatus", ["pending", "analyzing", "done", "error"])
    .default("pending")
    .notNull(),
  // 그룹 전체 통합 구조 JSON
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
  // 소속 그룹 (null이면 단독 문서)
  groupId: int("groupId"),
  title: varchar("title", { length: 512 }).notNull(),
  // 파일 형식: pdf | doc | docx | ppt | pptx
  fileType: mysqlEnum("fileType", ["pdf", "doc", "docx", "ppt", "pptx"]).default("pdf").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
  fileSize: int("fileSize"),
  pageCount: int("pageCount"),
  // AI 분석 상태: pending | analyzing | done | error
  analysisStatus: mysqlEnum("analysisStatus", ["pending", "analyzing", "done", "error"])
    .default("pending")
    .notNull(),
  // 계층적 구조 JSON
  structure: json("structure"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// 학습 세션
export const learningSessions = mysqlTable("learningSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  documentId: int("documentId").notNull(),
  // 그룹 세션인 경우 groupId 저장
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SessionMessage = typeof sessionMessages.$inferSelect;
export type InsertSessionMessage = typeof sessionMessages.$inferInsert;
