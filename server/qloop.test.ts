import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

const mockSession = {
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
};

const mockDocument = {
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
};

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

// ─── Auth Tests ───────────────────────────────────────────────────────────────

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

// ─── Document Tests ───────────────────────────────────────────────────────────

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

// ─── Session Start Tests ──────────────────────────────────────────────────────

describe("session.start", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-establish default mocks after clearAllMocks
    const { invokeLLM } = vi.mocked(await import("./_core/llm"));
    invokeLLM.mockResolvedValue({
      choices: [{ message: { content: "첫 번째 학습 질문입니다. Topic 1에 대해 무엇을 알고 있나요?" } }],
    });
    const { createLearningSession, updateLearningSession, createSessionMessage, getDocumentById } = vi.mocked(await import("./db"));
    createLearningSession.mockResolvedValue(42);
    updateLearningSession.mockResolvedValue(undefined);
    createSessionMessage.mockResolvedValue(100);
    getDocumentById.mockResolvedValue(mockDocument);
  });

  it("creates session and generates first question", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.session.start({
      documentId: 1,
      topicId: "ch1_t1",
      topicTitle: "Topic 1",
      topicDescription: "First topic description",
    });
    expect(result.sessionId).toBe(42);
    expect(result.firstQuestion).toBeTruthy();
    expect(typeof result.firstQuestion).toBe("string");
  });

  it("calls createLearningSession with correct userId and documentId", async () => {
    const { createLearningSession } = await import("./db");
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.session.start({
      documentId: 1,
      topicId: "ch1_t1",
      topicTitle: "Topic 1",
      topicDescription: "First topic description",
    });
    expect(vi.mocked(createLearningSession)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, documentId: 1, startTopicId: "ch1_t1" })
    );
  });

  it("saves first AI question message to session", async () => {
    const { createSessionMessage } = await import("./db");
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.session.start({
      documentId: 1,
      topicId: "ch1_t1",
      topicTitle: "Topic 1",
      topicDescription: "First topic description",
    });
    expect(vi.mocked(createSessionMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ role: "ai", messageType: "question", questionIndex: 1 })
    );
  });

  it("throws if document does not belong to user", async () => {
    const { getDocumentById } = await import("./db");
    vi.mocked(getDocumentById).mockResolvedValueOnce({ ...mockDocument, userId: 999 });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.session.start({ documentId: 1, topicId: "ch1_t1", topicTitle: "Topic 1", topicDescription: "" })
    ).rejects.toThrow("문서를 찾을 수 없습니다.");
  });
});

// ─── Session sendMessage Tests ────────────────────────────────────────────────

describe("session.sendMessage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { invokeLLM } = vi.mocked(await import("./_core/llm"));
    invokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              feedback: "좋은 답변입니다!",
              nextQuestion: "다음 질문: 이 개념을 실제로 어떻게 적용할 수 있을까요?",
              topicSummary: null,
              isTopicComplete: false,
            }),
          },
        },
      ],
    });
    const { getLearningSessionById, getDocumentById, getSessionMessages, updateLearningSession, createSessionMessage } =
      vi.mocked(await import("./db"));
    getLearningSessionById.mockResolvedValue(mockSession);
    getDocumentById.mockResolvedValue(mockDocument);
    getSessionMessages.mockResolvedValue([
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
    ]);
    updateLearningSession.mockResolvedValue(undefined);
    createSessionMessage.mockResolvedValue(100);
  });

  it("saves user answer message and returns AI feedback", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.session.sendMessage({
      sessionId: 42,
      content: "Topic 1은 매우 중요한 개념입니다.",
      isUserQuestion: false,
    });
    expect(result.aiMessage).toBeTruthy();
    expect(result.isTopicComplete).toBe(false);
  });

  it("increments answeredQuestions on user answer", async () => {
    const { updateLearningSession } = await import("./db");
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.session.sendMessage({
      sessionId: 42,
      content: "내 답변입니다.",
      isUserQuestion: false,
    });
    expect(vi.mocked(updateLearningSession)).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ answeredQuestions: 1 })
    );
  });

  it("does not increment answeredQuestions for user reverse-question", async () => {
    const { invokeLLM } = vi.mocked(await import("./_core/llm"));
    invokeLLM.mockResolvedValue({
      choices: [{ message: { content: "역질문에 대한 AI 답변입니다." } }],
    });
    const { updateLearningSession } = await import("./db");
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.session.sendMessage({
      sessionId: 42,
      content: "이 개념이 왜 중요한가요?",
      isUserQuestion: true,
    });
    expect(vi.mocked(updateLearningSession)).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ answeredQuestions: 0 })
    );
  });

  it("marks topic complete and generates summary when AI says isTopicComplete", async () => {
    const { invokeLLM } = vi.mocked(await import("./_core/llm"));
    // First call: topic complete response
    invokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              feedback: "훌륭합니다! 토픽을 완전히 이해했습니다.",
              nextQuestion: null,
              topicSummary: "Topic 1에 대한 학습 요약입니다.",
              isTopicComplete: true,
            }),
          },
        },
      ],
    });
    // Second call: session summary
    invokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: "전체 학습 요약입니다." } }],
    });

    const { updateLearningSession } = await import("./db");
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.session.sendMessage({
      sessionId: 42,
      content: "완전히 이해했습니다.",
      isUserQuestion: false,
    });
    expect(result.isTopicComplete).toBe(true);
    expect(vi.mocked(updateLearningSession)).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ completedTopics: ["ch1_t1"] })
    );
  });

  it("throws if session belongs to another user", async () => {
    const { getLearningSessionById } = await import("./db");
    vi.mocked(getLearningSessionById).mockResolvedValueOnce({ ...mockSession, userId: 999 });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.session.sendMessage({ sessionId: 42, content: "답변", isUserQuestion: false })
    ).rejects.toThrow("세션을 찾을 수 없습니다.");
  });

  it("throws if session is already completed", async () => {
    const { getLearningSessionById } = await import("./db");
    vi.mocked(getLearningSessionById).mockResolvedValueOnce({ ...mockSession, status: "completed" });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.session.sendMessage({ sessionId: 42, content: "답변", isUserQuestion: false })
    ).rejects.toThrow("이미 종료된 세션입니다.");
  });
});

// ─── Session list/get/getMessages Tests ───────────────────────────────────────

describe("session", () => {
  it("list returns sessions for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const sessions = await caller.session.list();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it("get returns session by id for owner", async () => {
    const { getLearningSessionById } = await import("./db");
    vi.mocked(getLearningSessionById).mockResolvedValueOnce(mockSession);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const session = await caller.session.get({ sessionId: 42 });
    expect(session).toBeDefined();
    expect(session.id).toBe(42);
    expect(session.startTopicTitle).toBe("Topic 1");
  });

  it("getMessages returns messages for session", async () => {
    const { getLearningSessionById, getSessionMessages } = await import("./db");
    vi.mocked(getLearningSessionById).mockResolvedValueOnce(mockSession);
    vi.mocked(getSessionMessages).mockResolvedValueOnce([
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
    ]);
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
    vi.mocked(getLearningSessionById).mockResolvedValueOnce({ ...mockSession, userId: 999 });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.session.get({ sessionId: 99 })).rejects.toThrow("세션을 찾을 수 없습니다.");
  });
});
