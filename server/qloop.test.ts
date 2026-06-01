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
  storageUrl: "/r2-storage/test.pdf",
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
  getDb: vi.fn().mockResolvedValue(null), // aiRouter에서 사용자 Provider 없음으로 처리
  createDocument: vi.fn().mockResolvedValue(1),
  getDocumentById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    title: "Test Document",
    storageKey: "documents/1/test.pdf",
    storageUrl: "/r2-storage/test.pdf",
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
  getStandaloneDocumentsByUserId: vi.fn().mockResolvedValue([]),
  getDocumentsByGroupId: vi.fn().mockResolvedValue([]),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  createDocumentGroup: vi.fn().mockResolvedValue(10),
  getDocumentGroupById: vi.fn().mockResolvedValue(null),
  getDocumentGroupsByUserId: vi.fn().mockResolvedValue([]),
  updateDocumentGroup: vi.fn().mockResolvedValue(undefined),
  deleteDocumentGroup: vi.fn().mockResolvedValue(undefined),
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
    url: "/r2-storage/test.pdf",
  }),
  storageGetSignedUrl: vi.fn().mockResolvedValue(
    "https://cdn.example.com/test.pdf?signed=1"
  ),
}));

// mockFullStructure is defined here for use in tests (NOT inside vi.mock factory due to hoisting)
const mockFullStructure = {
  title: "Test Document",
  summary: "A test summary.",
  documentType: "textbook",
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
  conceptMap: [
    { id: "c1", label: "Topic 1", description: "Core concept", type: "core", connections: [] },
  ],
  keyConceptCards: [
    { id: "k1", term: "Topic 1", definition: "A key concept", example: "Example", relatedTerms: [], importance: "high" },
  ],
  timeline: [],
  comparisonTables: [],
  learningPath: [
    { id: "lp1", order: 1, title: "Step 1", description: "Learn Topic 1", topicIds: ["ch1_t1"], estimatedMinutes: 15 },
  ],
};

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          // Inline the structure to avoid hoisting issues with vi.mock factory
          content: JSON.stringify({
            title: "Test Document",
            summary: "A test summary.",
            documentType: "textbook",
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
            conceptMap: [
              { id: "c1", label: "Topic 1", description: "Core concept", type: "core", connections: [] },
            ],
            keyConceptCards: [
              { id: "k1", term: "Topic 1", definition: "A key concept", example: "Example", relatedTerms: [], importance: "high" },
            ],
            timeline: [],
            comparisonTables: [],
            learningPath: [
              { id: "lp1", order: 1, title: "Step 1", description: "Learn Topic 1", topicIds: ["ch1_t1"], estimatedMinutes: 15 },
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
    expect(result.storageUrl).toBe("/r2-storage/test.pdf");
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
    // answeredQuestions >= 24 이어야 isTopicComplete가 강제 false 처리되지 않음
    const { getLearningSessionById } = vi.mocked(await import("./db"));
    getLearningSessionById.mockResolvedValueOnce({ ...mockSession, answeredQuestions: 24, totalQuestions: 30 });
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

// ─── analyzePdfStructure fallback Tests ──────────────────────────────────────

describe("document.analyze - structure fallback", () => {
  it("returns full structure with all new fields when LLM returns complete data", async () => {
    const { invokeLLM } = vi.mocked(await import("./_core/llm"));
    invokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(mockFullStructure) } }],
    });
    const { updateDocumentAnalysis, getDocumentById } = vi.mocked(await import("./db"));
    getDocumentById.mockResolvedValueOnce({
      id: 1,
      userId: 1,
      title: "Test Document",
      storageKey: "documents/1/test.pdf",
      storageUrl: "/r2-storage/test.pdf",
      fileSize: 1024,
      pageCount: 10,
      analysisStatus: "pending",
      structure: null,
      fileType: "pdf",
      groupId: null,
      openQloopEnabled: 0,
      selectedStructure: null,
      structureLocked: 0,
      analysisStep: null,
      sourceLanguage: "ko",
      learningLanguage: "ko",
      analysisError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    updateDocumentAnalysis.mockResolvedValueOnce(undefined);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.document.analyze({ documentId: 1 });
    expect(result.structure.documentType).toBe("textbook");
    expect(Array.isArray(result.structure.conceptMap)).toBe(true);
    expect(Array.isArray(result.structure.keyConceptCards)).toBe(true);
    expect(Array.isArray(result.structure.learningPath)).toBe(true);
  });

  it("applies fallback defaults when LLM returns partial structure (missing optional fields)", async () => {
    const { invokeLLM } = vi.mocked(await import("./_core/llm"));
    // LLM returns only chapters, missing new fields
    invokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Partial Doc",
              summary: "Partial summary",
              documentType: "other",
              chapters: [],
              conceptMap: [],
              keyConceptCards: [],
              timeline: [],
              comparisonTables: [],
              learningPath: [],
            }),
          },
        },
      ],
    });
    const { updateDocumentAnalysis, getDocumentById } = vi.mocked(await import("./db"));
    getDocumentById.mockResolvedValueOnce({
      id: 1,
      userId: 1,
      title: "Partial Doc",
      storageKey: "documents/1/partial.pdf",
      storageUrl: "/r2-storage/partial.pdf",
      fileSize: 512,
      pageCount: 5,
      analysisStatus: "pending",
      structure: null,
      fileType: "pdf",
      groupId: null,
      openQloopEnabled: 0,
      selectedStructure: null,
      structureLocked: 0,
      analysisStep: null,
      sourceLanguage: "ko",
      learningLanguage: "ko",
      analysisError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    updateDocumentAnalysis.mockResolvedValueOnce(undefined);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.document.analyze({ documentId: 1 });
    // fallback defaults should be applied
    expect(Array.isArray(result.structure.conceptMap)).toBe(true);
    expect(Array.isArray(result.structure.keyConceptCards)).toBe(true);
    expect(Array.isArray(result.structure.timeline)).toBe(true);
    expect(Array.isArray(result.structure.comparisonTables)).toBe(true);
    expect(Array.isArray(result.structure.learningPath)).toBe(true);
  });

  it("throws a user-friendly error when LLM returns malformed JSON", async () => {
    const { invokeLLM } = vi.mocked(await import("./_core/llm"));
    invokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: "NOT_VALID_JSON{{{{" } }],
    });
    const { getDocumentById } = vi.mocked(await import("./db"));
    getDocumentById.mockResolvedValueOnce({
      id: 1,
      userId: 1,
      title: "Bad Doc",
      storageKey: "documents/1/bad.pdf",
      storageUrl: "/r2-storage/bad.pdf",
      fileSize: 512,
      pageCount: 5,
      analysisStatus: "pending",
      structure: null,
      fileType: "pdf",
      groupId: null,
      openQloopEnabled: 0,
      selectedStructure: null,
      structureLocked: 0,
      analysisStep: null,
      sourceLanguage: "ko",
      learningLanguage: "ko",
      analysisError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.document.analyze({ documentId: 1 })).rejects.toThrow(
      /AI 분석 결과를 파싱하지 못했습니다/
    );
  });

  it("throws when LLM returns no content", async () => {
    const { invokeLLM } = vi.mocked(await import("./_core/llm"));
    invokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });
    const { getDocumentById } = vi.mocked(await import("./db"));
    getDocumentById.mockResolvedValueOnce({
      id: 1,
      userId: 1,
      title: "Empty Doc",
      storageKey: "documents/1/empty.pdf",
      storageUrl: "/r2-storage/empty.pdf",
      fileSize: 512,
      pageCount: 5,
      analysisStatus: "pending",
      structure: null,
      fileType: "pdf",
      groupId: null,
      openQloopEnabled: 0,
      selectedStructure: null,
      structureLocked: 0,
      analysisStep: null,
      sourceLanguage: "ko",
      learningLanguage: "ko",
      analysisError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.document.analyze({ documentId: 1 })).rejects.toThrow(
      "AI 분석 결과를 받지 못했습니다."
    );
  });
});

describe("document.delete — cascade sessions", () => {
  it("calls deleteDocument and returns success (cascade handled in db layer)", async () => {
    const { deleteDocument, getDocumentById } = vi.mocked(await import("./db"));
    getDocumentById.mockResolvedValueOnce({
      id: 42,
      userId: 1,
      title: "To Delete",
      storageKey: "documents/42/file.pdf",
      storageUrl: "/r2-storage/documents/42/file.pdf",
      fileSize: 1024,
      pageCount: 10,
      analysisStatus: "done" as const,
      structure: null,
      groupId: null,
      fileType: "pdf" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    deleteDocument.mockResolvedValueOnce(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.document.delete({ documentId: 42 });

    expect(result.success).toBe(true);
    expect(deleteDocument).toHaveBeenCalledWith(42);
  });
});

// ─── Document Analyze Error Persistence Tests ─────────────────────────────────

describe("document.analyze error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves analysisError message when AI analysis fails", async () => {
    const { updateDocumentAnalysis, getDocumentById } = await import("./db");
    const { storageGetSignedUrl } = await import("./storage");
    const { invokeLLM } = await import("./_core/llm");

    // 문서 존재 설정
    vi.mocked(getDocumentById).mockResolvedValue({
      ...{
        id: 1,
        userId: 1,
        title: "Test Document",
        storageKey: "documents/1/test.pdf",
        storageUrl: "/r2-storage/test.pdf",
        fileSize: 1024,
        pageCount: 10,
        analysisStatus: "pending" as const,
        structure: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      fileType: "pdf" as const,
      groupId: null,
      openQloopEnabled: 0,
      selectedStructure: null,
      structureLocked: 0,
      analysisStep: null,
      sourceLanguage: "ko",
      learningLanguage: "ko",
      analysisError: null,
    });

    vi.mocked(storageGetSignedUrl).mockResolvedValue("https://cdn.example.com/test.pdf?signed=1");
    vi.mocked(updateDocumentAnalysis).mockResolvedValue(undefined);

    // AI 분석 실패 시뮬레이션
    vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("AI API 호출 실패: 401 Unauthorized"));

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // analyze 호출 시 에러가 throw되어야 함
    await expect(caller.document.analyze({ documentId: 1 })).rejects.toThrow();

    // updateDocumentAnalysis가 error 상태와 에러 메시지로 호출되었는지 확인
    expect(vi.mocked(updateDocumentAnalysis)).toHaveBeenCalledWith(
      1,
      "error",
      undefined,
      undefined,
      "error",
      expect.stringContaining("AI API 호출 실패")
    );
  });

  it("clears analysisError on successful analysis", async () => {
    const { updateDocumentAnalysis, getDocumentById } = await import("./db");
    const { storageGetSignedUrl } = await import("./storage");
    const { invokeLLM } = await import("./_core/llm");

    vi.mocked(getDocumentById).mockResolvedValue({
      ...{
        id: 1,
        userId: 1,
        title: "Test Document",
        storageKey: "documents/1/test.pdf",
        storageUrl: "/r2-storage/test.pdf",
        fileSize: 1024,
        pageCount: 10,
        analysisStatus: "error" as const,
        structure: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      fileType: "pdf" as const,
      groupId: null,
      openQloopEnabled: 0,
      selectedStructure: null,
      structureLocked: 0,
      analysisStep: "error" as const,
      sourceLanguage: "ko",
      learningLanguage: "ko",
      analysisError: "이전 오류",
    });

    vi.mocked(storageGetSignedUrl).mockResolvedValue("https://cdn.example.com/test.pdf?signed=1");
    vi.mocked(updateDocumentAnalysis).mockResolvedValue(undefined);

    // AI 분석 성공 응답
    vi.mocked(invokeLLM).mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Test Document",
              summary: "A test summary.",
              documentType: "textbook",
              chapters: [
                {
                  id: "ch1",
                  title: "Chapter 1",
                  order: 1,
                  topics: [
                    { id: "ch1_t1", title: "Topic 1", description: "First topic", order: 1, subtopics: [] },
                  ],
                },
              ],
              conceptMap: [{ id: "c1", label: "Topic 1", description: "Core concept", type: "core", connections: [] }],
              keyConceptCards: [{ id: "k1", term: "Topic 1", definition: "A key concept", example: "Example", relatedTerms: [], importance: "high" }],
              timeline: [],
              comparisonTables: [],
              learningPath: [{ id: "lp1", order: 1, title: "Step 1", description: "Learn Topic 1", topicIds: ["ch1_t1"], estimatedMinutes: 15 }],
            }),
          },
        },
      ],
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.document.analyze({ documentId: 1 });

    expect(result.success).toBe(true);
    // 성공 시 "done" 상태로 업데이트 확인
    expect(vi.mocked(updateDocumentAnalysis)).toHaveBeenCalledWith(
      1,
      "done",
      expect.any(Object),
      undefined,
      "done"
    );
  });
});
