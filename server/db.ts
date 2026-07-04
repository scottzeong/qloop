import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  documents,
  documentGroups,
  learningSessions,
  sessionMessages,
  InsertDocument,
  InsertDocumentGroup,
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

// ─── Startup Migrations ───────────────────────────────────────────────────────
// 스키마와 DB가 불일치할 때 자동으로 컬럼을 추가
export async function runStartupMigrations() {
  const db = await getDb();
  if (!db) return;

  const alters = [
    `ALTER TABLE \`documents\` ADD COLUMN \`contextaStatus\` ENUM('pending','analyzing','done','error','skipped') NULL AFTER \`analysisError\``,
    `ALTER TABLE \`documents\` ADD COLUMN \`contextaStep\` ENUM('content','structure','logic','concept','understanding','critical','done','error') NULL AFTER \`contextaStatus\``,
    `ALTER TABLE \`documents\` ADD COLUMN \`contextaAnalysis\` JSON NULL AFTER \`contextaStep\``,
    `ALTER TABLE \`learningSessions\` ADD COLUMN \`learnerLevel\` ENUM('student','college','general') NOT NULL DEFAULT 'general' AFTER \`libraryContextIds\``,
  ];

  for (const query of alters) {
    try {
      await db.execute(sql.raw(query));
      console.log("[Migration] OK:", query.slice(23, 70));
    } catch (e: any) {
      if (e?.cause?.errno === 1060 || e?.errno === 1060) {
        // ER_DUP_FIELDNAME — 이미 존재, 무시
      } else {
        console.error("[Migration] FAILED:", e?.message, "| cause:", e?.cause?.message, "| errno:", e?.cause?.errno);
      }
    }
  }
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

// ─── Document Groups ──────────────────────────────────────────────────────────

export async function createDocumentGroup(data: InsertDocumentGroup) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(documentGroups).values(data);
  return result.insertId as number;
}

export async function getDocumentGroupById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documentGroups).where(eq(documentGroups.id, id)).limit(1);
  return result[0];
}

export async function getDocumentGroupsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documentGroups)
    .where(eq(documentGroups.userId, userId))
    .orderBy(desc(documentGroups.createdAt));
}

export async function updateDocumentGroup(
  id: number,
  data: Partial<{
    name: string;
    description: string;
    analysisStatus: "pending" | "analyzing" | "done" | "error";
    structure: unknown;
    selectedStructure: "tree" | "conceptMap" | "learningPath" | null;
    structureLocked: number;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(documentGroups).set(data as Record<string, unknown>).where(eq(documentGroups.id, id));
}

export async function deleteDocumentGroup(id: number) {
  const db = await getDb();
  if (!db) return;
  // 1) 그룹 소속 문서 목록 조회
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.groupId, id));
  // 2) 각 문서의 세션 및 메시지 연쇄 삭제
  for (const doc of docs) {
    const sessions = await db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(eq(learningSessions.documentId, doc.id));
    for (const session of sessions) {
      await db.delete(sessionMessages).where(eq(sessionMessages.sessionId, session.id));
    }
    await db.delete(learningSessions).where(eq(learningSessions.documentId, doc.id));
  }
  // 3) 그룹 세션(그룹으로 시작한 통합 학습 세션) 연쇄 삭제
  const groupSessions = await db
    .select({ id: learningSessions.id })
    .from(learningSessions)
    .where(eq(learningSessions.groupId, id));
  for (const session of groupSessions) {
    await db.delete(sessionMessages).where(eq(sessionMessages.sessionId, session.id));
  }
  await db.delete(learningSessions).where(eq(learningSessions.groupId, id));
  // 4) 문서 삭제
  await db.delete(documents).where(eq(documents.groupId, id));
  // 5) 그룹 삭제
  await db.delete(documentGroups).where(eq(documentGroups.id, id));
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

/** 그룹에 속한 문서 목록 */
export async function getDocumentsByGroupId(groupId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documents)
    .where(eq(documents.groupId, groupId))
    .orderBy(documents.createdAt);
}

/** 그룹에 속하지 않은 단독 문서 목록 */
export async function getStandaloneDocumentsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), isNull(documents.groupId)))
    .orderBy(desc(documents.createdAt));
}

export async function updateDocumentAnalysis(
  id: number,
  status: "pending" | "analyzing" | "done" | "error",
  structure?: unknown,
  pageCount?: number,
  analysisStep?: "uploading" | "extracting" | "structuring" | "done" | "error",
  analysisError?: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(documents)
    .set({
      analysisStatus: status,
      ...(structure !== undefined ? { structure } : {}),
      ...(pageCount !== undefined ? { pageCount } : {}),
      ...(analysisStep !== undefined ? { analysisStep } : {}),
      ...(analysisError !== undefined ? { analysisError } : {}),
      // 성공 시 이전 오류 메시지 초기화
      ...(status === "done" ? { analysisError: null } : {}),
    })
    .where(eq(documents.id, id));
}

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  // 1) 해당 문서의 세션 ID 목록 조회
  const sessions = await db
    .select({ id: learningSessions.id })
    .from(learningSessions)
    .where(eq(learningSessions.documentId, id));
  // 2) 각 세션의 메시지 연쇄 삭제
  for (const session of sessions) {
    await db.delete(sessionMessages).where(eq(sessionMessages.sessionId, session.id));
  }
  // 3) 세션 삭제
  await db.delete(learningSessions).where(eq(learningSessions.documentId, id));
  // 4) 문서 삭제
  await db.delete(documents).where(eq(documents.id, id));
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

export async function getSessionsByGroupId(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.groupId, groupId), eq(learningSessions.userId, userId)))
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
    openQloopMode: number;
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

// ─── Login Rate Limiter (DB 기반 — Vercel 다중 인스턴스 대응) ──────────────────
// learningSessions 등 별도 테이블 없이 MySQL 세션 변수 방식 대신
// 인메모리 Map + DB 검증 병행 전략: DB 연결 실패 시 인메모리 fallback

const _loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const LOGIN_MAX_ATTEMPTS_DB = 10;
const LOGIN_WINDOW_DB_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_DB_MS = 15 * 60 * 1000;

/**
 * 로그인 시도 횟수 확인 (IP 기준).
 * DB를 사용하지 않고 인메모리 Map을 사용하되, Vercel 재배포 시 자동 초기화됨.
 * 강력한 보호가 필요하면 Redis/KV로 교체 권장.
 */
export function checkLoginRateLimitDb(ip: string): void {
  const now = Date.now();
  const record = _loginAttempts.get(ip);
  if (!record) return;
  if (now - record.firstAttempt > LOGIN_WINDOW_DB_MS) {
    _loginAttempts.delete(ip);
    return;
  }
  if (record.count >= LOGIN_MAX_ATTEMPTS_DB) {
    const remaining = Math.ceil((record.firstAttempt + LOGIN_LOCKOUT_DB_MS - now) / 1000 / 60);
    throw new Error(`로그인 시도 횟수를 초과했습니다. ${remaining}분 후 다시 시도해주세요.`);
  }
}

export function recordLoginFailureDb(ip: string): void {
  const now = Date.now();
  const record = _loginAttempts.get(ip);
  if (!record || now - record.firstAttempt > LOGIN_WINDOW_DB_MS) {
    _loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

export function resetLoginAttemptsDb(ip: string): void {
  _loginAttempts.delete(ip);
}
