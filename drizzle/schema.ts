import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  float,
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

// 업로드된 PDF 문서
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
  fileSize: int("fileSize"),
  pageCount: int("pageCount"),
  // AI 분석 상태: pending | analyzing | done | error
  analysisStatus: mysqlEnum("analysisStatus", ["pending", "analyzing", "done", "error"])
    .default("pending")
    .notNull(),
  // 계층적 구조 JSON: { title, chapters: [{ title, topics: [{ id, title, description, order }] }] }
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
  // 선택된 시작 토픽 ID (structure 내 topic id)
  startTopicId: varchar("startTopicId", { length: 128 }),
  startTopicTitle: varchar("startTopicTitle", { length: 512 }),
  // 세션 상태: active | completed | paused
  status: mysqlEnum("status", ["active", "completed", "paused"]).default("active").notNull(),
  // 완료된 토픽 ID 목록 (JSON array)
  completedTopics: json("completedTopics").$type<string[]>(),
  // 현재 진행 중인 토픽 ID
  currentTopicId: varchar("currentTopicId", { length: 128 }),
  // 총 질문 수
  totalQuestions: int("totalQuestions").default(0),
  // 학습자가 답변한 수
  answeredQuestions: int("answeredQuestions").default(0),
  // 학습 요약 (세션 종료 시 생성)
  summary: text("summary"),
  // 이메일 발송 여부
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
  // 메시지 역할: ai (AI 질문/피드백) | user (학습자 답변/역질문)
  role: mysqlEnum("role", ["ai", "user"]).notNull(),
  // 메시지 타입: question | answer | feedback | user_question | ai_answer | system
  messageType: mysqlEnum("messageType", [
    "question",
    "answer",
    "feedback",
    "user_question",
    "ai_answer",
    "system",
  ]).notNull(),
  content: text("content").notNull(),
  // 관련 토픽 ID
  topicId: varchar("topicId", { length: 128 }),
  topicTitle: varchar("topicTitle", { length: 512 }),
  // 질문 순서 번호
  questionIndex: int("questionIndex"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SessionMessage = typeof sessionMessages.$inferSelect;
export type InsertSessionMessage = typeof sessionMessages.$inferInsert;
