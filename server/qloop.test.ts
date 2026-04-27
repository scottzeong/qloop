import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  createDocument: vi.fn().mockResolvedValue(1),
  getDocumentById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    title: "Test Document",
    storageKey: "documents/1/test.pdf",
    storageUrl: "/manus-storage/test.pdf",
    fileSize: 1024,
    pageCount: 10,
    analysisStatus: "done",
    structure: {
      title: "Test Document",
      summary: "A test document summary.",
      chapters: [
        {
          id: "ch1",
          title: "Chapter 1",
          order: 1,
          topics: [
            {
              id: "ch1_t1",
              title: "Topic 1",
              description: "First topic description",
              order: 1,
              subtopics: [],
            },
          ],
        },
      ],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getDocumentsByUserId: vi.fn().mockResolvedValue([]),
  updateDocumentAnalysis: vi.fn().mockResolvedValue(undefined),
  createLearningSession: vi.fn().mockResolvedValue(42),
  getLearningSessionById: vi.fn().mockResolvedValue({
    id: 42,
    userId: 1,
    documentId: 1,
    startTopicId: "ch1_t1",
    startTopicTitle: "Topic 1",
    status: "active",
    completedTopics: [],
    currentTopicId: "ch1_t1",
    totalQuestions: 1,
    answeredQuestions: 0,
    summary: null,
    reportSent: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  }),
  getSessionsByUserId: vi.fn().mockResolvedValue([]),
  getSessionsByDocumentId: vi.fn().mockResolvedValue([]),
  updateLearningSession: vi.fn().mockResolvedValue(undefined),
  createSessionMessage: vi.fn().mockResolvedValue(100),
  getSessionMessages: vi.fn().mockResolvedValue([
    {
      id: 1,
      sessionId: 42,
      role: "ai",
      messageType: "question",
      content: "What do you know about Topic 1?",
      topicId: "ch1_t1",
      topicTitle: "Topic 1",
      questionIndex: 1,
      createdAt: new Date(),
    },
  ]),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "documents/1/test.pdf",
    url: "/manus-storage/test.pdf",
  }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            title: "Test Document",
            summary: "A test summary.",
            chapters: [
              {
                id: "ch1",
                title: "Chapter 1",
                order: 1,
                topics: [
                  {
                    id: "ch1_t1",
                    title: "Topic 1",
                    description: "First topic",
                    order: 1,
                    subtopics: [],
                  },
                ],
              },
            ],
          }),
        },
      },
    ],
  }),
}));

// ─── Test context ─────────────────────────────────────────────────────────────

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-openid",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auth", () => {
  it("me returns authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.name).toBe("Test User");
  });

  it("logout clears session cookie", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

describe("document", () => {
  it("list returns documents for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const docs = await caller.document.list();
    expect(Array.isArray(docs)).toBe(true);
  });

  it("get returns document by id for owner", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const doc = await caller.document.get({ documentId: 1 });
    expect(doc).toBeDefined();
    expect(doc.id).toBe(1);
    expect(doc.title).toBe("Test Document");
  });

  it("get throws for non-existent document", async () => {
    const { getDocumentById } = await import("./db");
    vi.mocked(getDocumentById).mockResolvedValueOnce(undefined);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.document.get({ documentId: 999 })).rejects.toThrow("문서를 찾을 수 없습니다.");
  });

  it("upload stores PDF and returns documentId", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.document.upload({
      fileName: "test.pdf",
      fileData: Buffer.from("fake pdf content").toString("base64"),
      fileSize: 1024,
      mimeType: "application/pdf",
    });
    expect(result.documentId).toBe(1);
    expect(result.storageUrl).toBe("/manus-storage/test.pdf");
  });
});

describe("session", () => {
  it("list returns sessions for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const sessions = await caller.session.list();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it("get returns session by id for owner", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const session = await caller.session.get({ sessionId: 42 });
    expect(session).toBeDefined();
    expect(session.id).toBe(42);
    expect(session.startTopicTitle).toBe("Topic 1");
  });

  it("getMessages returns messages for session", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const messages = await caller.session.getMessages({ sessionId: 42 });
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].role).toBe("ai");
    expect(messages[0].messageType).toBe("question");
  });

  it("get throws for session belonging to another user", async () => {
    const { getLearningSessionById } = await import("./db");
    vi.mocked(getLearningSessionById).mockResolvedValueOnce({
      id: 99,
      userId: 999, // different user
      documentId: 1,
      startTopicId: "ch1_t1",
      startTopicTitle: "Topic 1",
      status: "active",
      completedTopics: null,
      currentTopicId: "ch1_t1",
      totalQuestions: 0,
      answeredQuestions: 0,
      summary: null,
      reportSent: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.session.get({ sessionId: 99 })).rejects.toThrow("세션을 찾을 수 없습니다.");
  });
});
