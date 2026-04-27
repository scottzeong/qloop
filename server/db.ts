import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  documents,
  learningSessions,
  sessionMessages,
  InsertDocument,
  InsertLearningSession,
  InsertSessionMessage,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(documents).values(data);
  return result.insertId as number;
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result[0];
}

export async function getDocumentsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

export async function updateDocumentAnalysis(
  id: number,
  status: "pending" | "analyzing" | "done" | "error",
  structure?: unknown,
  pageCount?: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(documents)
    .set({
      analysisStatus: status,
      ...(structure !== undefined ? { structure } : {}),
      ...(pageCount !== undefined ? { pageCount } : {}),
    })
    .where(eq(documents.id, id));
}

// ─── Learning Sessions ────────────────────────────────────────────────────────

export async function createLearningSession(data: InsertLearningSession) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(learningSessions).values(data);
  return result.insertId as number;
}

export async function getLearningSessionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(learningSessions).where(eq(learningSessions.id, id)).limit(1);
  return result[0];
}

export async function getSessionsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(learningSessions)
    .where(eq(learningSessions.userId, userId))
    .orderBy(desc(learningSessions.createdAt));
}

export async function getSessionsByDocumentId(documentId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.documentId, documentId), eq(learningSessions.userId, userId)))
    .orderBy(desc(learningSessions.createdAt));
}

export async function updateLearningSession(
  id: number,
  data: Partial<{
    status: "active" | "completed" | "paused";
    completedTopics: string[];
    currentTopicId: string;
    totalQuestions: number;
    answeredQuestions: number;
    summary: string;
    reportSent: number;
    completedAt: Date;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(learningSessions).set(data as Record<string, unknown>).where(eq(learningSessions.id, id));
}

// ─── Session Messages ─────────────────────────────────────────────────────────

export async function createSessionMessage(data: InsertSessionMessage) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sessionMessages).values(data);
  return result.insertId as number;
}

export async function getSessionMessages(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, sessionId))
    .orderBy(sessionMessages.createdAt);
}
