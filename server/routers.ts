import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import {
  createDocument,
  getDocumentById,
  getDocumentsByUserId,
  updateDocumentAnalysis,
  createLearningSession,
  getLearningSessionById,
  getSessionsByUserId,
  getSessionsByDocumentId,
  updateLearningSession,
  createSessionMessage,
  getSessionMessages,
} from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TopicNode {
  id: string;
  title: string;
  description: string;
  order: number;
  subtopics?: TopicNode[];
}

export interface ChapterNode {
  id: string;
  title: string;
  order: number;
  topics: TopicNode[];
}

export interface DocumentStructure {
  title: string;
  summary: string;
  chapters: ChapterNode[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function analyzePdfStructure(pdfUrl: string, docTitle: string): Promise<DocumentStructure> {
  const systemPrompt = `You are an expert educational content analyzer. 
Analyze the provided PDF document and extract its hierarchical structure.
Return a JSON object with the following schema:
{
  "title": "document title",
  "summary": "brief 2-3 sentence summary of the document",
  "chapters": [
    {
      "id": "ch1",
      "title": "Chapter Title",
      "order": 1,
      "topics": [
        {
          "id": "ch1_t1",
          "title": "Topic Title",
          "description": "Brief description of what this topic covers",
          "order": 1,
          "subtopics": [
            {
              "id": "ch1_t1_s1",
              "title": "Subtopic Title",
              "description": "Brief description",
              "order": 1
            }
          ]
        }
      ]
    }
  ]
}
Be thorough and capture all major topics, concepts, and sections.
Use Korean if the document is in Korean, otherwise use the document's language.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user" as const,
        content: [
          {
            type: "file_url" as const,
            file_url: { url: pdfUrl, mime_type: "application/pdf" as const },
          },
          {
            type: "text" as const,
            text: `Please analyze this PDF document titled "${docTitle}" and return the hierarchical structure as JSON.`,
          },
        ],
      },
    ] satisfies Message[],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "document_structure",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            chapters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  order: { type: "integer" },
                  topics: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        order: { type: "integer" },
                        subtopics: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              title: { type: "string" },
                              description: { type: "string" },
                              order: { type: "integer" },
                            },
                            required: ["id", "title", "description", "order"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["id", "title", "description", "order", "subtopics"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["id", "title", "order", "topics"],
                additionalProperties: false,
              },
            },
          },
          required: ["title", "summary", "chapters"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : null;
  if (!content) throw new Error("AI 분석 결과를 받지 못했습니다.");
  return JSON.parse(content) as DocumentStructure;
}

async function generateFirstQuestion(
  pdfUrl: string,
  topicTitle: string,
  topicDescription: string,
  docTitle: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system" as const,
        content: `You are an expert educational tutor using the Socratic method. 
You are helping a learner study a specific topic from a document.
Generate an engaging first question to start the learning session.
The question should:
- Be open-ended and thought-provoking
- Assess the learner's baseline understanding
- Be directly related to the topic
- Be in the same language as the document (Korean if Korean)
Return only the question text, nothing else.`,
      },
      {
        role: "user" as const,
        content: [
          {
            type: "file_url" as const,
            file_url: { url: pdfUrl, mime_type: "application/pdf" as const },
          },
          {
            type: "text" as const,
            text: `Document: "${docTitle}"\nTopic: "${topicTitle}"\nDescription: "${topicDescription}"\n\nGenerate the first learning question for this topic.`,
          },
        ],
      },
    ] satisfies Message[],
  });
  const raw = response.choices[0]?.message?.content;
  return (typeof raw === "string" ? raw : null) || "이 토픽에 대해 무엇을 알고 있나요?";
}

async function generateNextMessage(
  pdfUrl: string,
  docTitle: string,
  topicTitle: string,
  conversationHistory: Array<{ role: string; content: string; messageType: string }>,
  userMessage: string,
  isUserQuestion: boolean
): Promise<{ content: string; messageType: string; isTopicComplete: boolean }> {
  const historyText = conversationHistory
    .map((m) => `[${m.role === "ai" ? "AI" : "학습자"}]: ${m.content}`)
    .join("\n");

  const systemPrompt = isUserQuestion
    ? `You are an expert educational tutor. The learner has asked you a question.
Answer their question clearly and thoroughly based on the document content.
After answering, naturally transition back to the learning session with a follow-up question.
Use the same language as the conversation (Korean if Korean).`
    : `You are an expert educational tutor using the Socratic method.
The learner has answered your question. You should:
1. Provide constructive feedback on their answer (acknowledge what's correct, gently correct misconceptions)
2. Deepen their understanding with a follow-up question OR
3. If the topic has been thoroughly covered (after 4-6 exchanges), provide a summary and indicate completion

Return a JSON with:
{
  "feedback": "feedback on the answer",
  "nextQuestion": "next question OR null if topic is complete",
  "topicSummary": "summary if topic is complete OR null",
  "isTopicComplete": boolean
}`;

  if (isUserQuestion) {
    const response = await invokeLLM({
      messages: [
        { role: "system" as const, content: systemPrompt },
        {
          role: "user" as const,
          content: [
            { type: "file_url" as const, file_url: { url: pdfUrl, mime_type: "application/pdf" as const } },
            {
              type: "text" as const,
              text: `Document: "${docTitle}"\nTopic: "${topicTitle}"\n\nConversation so far:\n${historyText}\n\nLearner's question: ${userMessage}`,
            },
          ],
        },
      ] satisfies Message[],
    });
    return {
      content: (typeof response.choices[0]?.message?.content === "string" ? response.choices[0]?.message?.content : null) || "좋은 질문입니다.",
      messageType: "ai_answer",
      isTopicComplete: false,
    };
  } else {
    const response = await invokeLLM({
      messages: [
        { role: "system" as const, content: systemPrompt },
        {
          role: "user" as const,
          content: [
            { type: "file_url" as const, file_url: { url: pdfUrl, mime_type: "application/pdf" as const } },
            {
              type: "text" as const,
              text: `Document: "${docTitle}"\nTopic: "${topicTitle}"\n\nConversation so far:\n${historyText}\n\nLearner's answer: ${userMessage}`,
            },
          ],
        },
      ] satisfies Message[],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tutor_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              feedback: { type: "string" },
              nextQuestion: { type: ["string", "null"] },
              topicSummary: { type: ["string", "null"] },
              isTopicComplete: { type: "boolean" },
            },
            required: ["feedback", "nextQuestion", "topicSummary", "isTopicComplete"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawResp = response.choices[0]?.message?.content;
    const parsed = JSON.parse((typeof rawResp === "string" ? rawResp : null) || "{}");
    const content = parsed.isTopicComplete
      ? `${parsed.feedback}\n\n**토픽 완료!** ${parsed.topicSummary}`
      : `${parsed.feedback}\n\n${parsed.nextQuestion}`;

    return {
      content,
      messageType: parsed.isTopicComplete ? "feedback" : "feedback",
      isTopicComplete: parsed.isTopicComplete || false,
    };
  }
}

async function generateSessionSummary(
  docTitle: string,
  topicTitle: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const historyText = messages.map((m) => `[${m.role === "ai" ? "AI" : "학습자"}]: ${m.content}`).join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert educational summarizer. Create a comprehensive learning summary.
Use the same language as the conversation (Korean if Korean).
Format the summary with:
- Key concepts learned
- Learner's demonstrated understanding
- Areas for further study
- Overall progress assessment`,
      },
      {
        role: "user",
        content: `Document: "${docTitle}"\nTopic: "${topicTitle}"\n\nLearning session:\n${historyText}\n\nCreate a comprehensive learning summary.`,
      },
    ],
  });
  const rawSummary = response.choices[0]?.message?.content;
  return (typeof rawSummary === "string" ? rawSummary : null) || "학습 요약을 생성할 수 없습니다.";
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Documents ──────────────────────────────────────────────────────────────
  document: router({
    // PDF 업로드 (base64 인코딩된 파일 데이터 수신)
    upload: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileData: z.string(), // base64
          fileSize: z.number(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileData, "base64");
        const key = `documents/${ctx.user.id}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        const docId = await createDocument({
          userId: ctx.user.id,
          title: input.fileName.replace(/\.pdf$/i, ""),
          storageKey: key,
          storageUrl: url,
          fileSize: input.fileSize,
          analysisStatus: "pending",
        });

        return { documentId: docId, storageUrl: url };
      }),

    // AI 구조 분석 시작
    analyze: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");

        await updateDocumentAnalysis(input.documentId, "analyzing");

        try {
          const structure = await analyzePdfStructure(doc.storageUrl, doc.title);
          await updateDocumentAnalysis(input.documentId, "done", structure);
          return { success: true, structure };
        } catch (e) {
          await updateDocumentAnalysis(input.documentId, "error");
          throw e;
        }
      }),

    // 문서 목록 조회
    list: protectedProcedure.query(async ({ ctx }) => {
      return getDocumentsByUserId(ctx.user.id);
    }),

    // 문서 상세 조회
    get: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        return doc;
      }),
  }),

  // ─── Learning Sessions ───────────────────────────────────────────────────────
  session: router({
    // 학습 세션 시작
    start: protectedProcedure
      .input(
        z.object({
          documentId: z.number(),
          topicId: z.string(),
          topicTitle: z.string(),
          topicDescription: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");

        const sessionId = await createLearningSession({
          userId: ctx.user.id,
          documentId: input.documentId,
          startTopicId: input.topicId,
          startTopicTitle: input.topicTitle,
          status: "active",
          currentTopicId: input.topicId,
          totalQuestions: 0,
          answeredQuestions: 0,
        });

        // 첫 번째 질문 생성
        const firstQuestion = await generateFirstQuestion(
          doc.storageUrl,
          input.topicTitle,
          input.topicDescription,
          doc.title
        );

        await createSessionMessage({
          sessionId,
          role: "ai",
          messageType: "question",
          content: firstQuestion,
          topicId: input.topicId,
          topicTitle: input.topicTitle,
          questionIndex: 1,
        });

        await updateLearningSession(sessionId, { totalQuestions: 1 });

        return { sessionId, firstQuestion };
      }),

    // 메시지 전송 (답변 또는 역질문)
    sendMessage: protectedProcedure
      .input(
        z.object({
          sessionId: z.number(),
          content: z.string(),
          isUserQuestion: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const session = await getLearningSessionById(input.sessionId);
        if (!session || session.userId !== ctx.user.id) throw new Error("세션을 찾을 수 없습니다.");
        if (session.status !== "active") throw new Error("이미 종료된 세션입니다.");

        const doc = await getDocumentById(session.documentId);
        if (!doc) throw new Error("문서를 찾을 수 없습니다.");

        // 학습자 메시지 저장
        await createSessionMessage({
          sessionId: input.sessionId,
          role: "user",
          messageType: input.isUserQuestion ? "user_question" : "answer",
          content: input.content,
          topicId: session.currentTopicId ?? undefined,
          topicTitle: session.startTopicTitle ?? undefined,
        });

        // 대화 히스토리 조회
        const messages = await getSessionMessages(input.sessionId);
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
          messageType: m.messageType,
        }));

        // AI 응답 생성
        const aiResponse = await generateNextMessage(
          doc.storageUrl,
          doc.title,
          session.startTopicTitle || "",
          history,
          input.content,
          input.isUserQuestion
        );

        // AI 메시지 저장
        const msgCount = messages.filter((m) => m.messageType === "question").length;
        await createSessionMessage({
          sessionId: input.sessionId,
          role: "ai",
          messageType: aiResponse.messageType as "question" | "answer" | "feedback" | "user_question" | "ai_answer" | "system",
          content: aiResponse.content,
          topicId: session.currentTopicId ?? undefined,
          topicTitle: session.startTopicTitle ?? undefined,
          questionIndex: aiResponse.isTopicComplete ? undefined : msgCount + 1,
        });

        // 진행 상황 업데이트
        const newAnswered = (session.answeredQuestions || 0) + (input.isUserQuestion ? 0 : 1);
        const newTotal = (session.totalQuestions || 0) + (aiResponse.isTopicComplete ? 0 : 1);

        if (aiResponse.isTopicComplete) {
          const completedTopics = Array.isArray(session.completedTopics)
            ? [...session.completedTopics]
            : [];
          if (session.currentTopicId && !completedTopics.includes(session.currentTopicId)) {
            completedTopics.push(session.currentTopicId);
          }

          // 학습 요약 생성
          const allMessages = await getSessionMessages(input.sessionId);
          const summary = await generateSessionSummary(
            doc.title,
            session.startTopicTitle || "",
            allMessages.map((m) => ({ role: m.role, content: m.content }))
          );

          await updateLearningSession(input.sessionId, {
            completedTopics,
            answeredQuestions: newAnswered,
            summary,
          });
        } else {
          await updateLearningSession(input.sessionId, {
            answeredQuestions: newAnswered,
            totalQuestions: newTotal,
          });
        }

        return {
          aiMessage: aiResponse.content,
          messageType: aiResponse.messageType,
          isTopicComplete: aiResponse.isTopicComplete,
        };
      }),

    // 세션 종료
    complete: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const session = await getLearningSessionById(input.sessionId);
        if (!session || session.userId !== ctx.user.id) throw new Error("세션을 찾을 수 없습니다.");

        const doc = await getDocumentById(session.documentId);
        if (!doc) throw new Error("문서를 찾을 수 없습니다.");

        // 요약 생성
        const allMessages = await getSessionMessages(input.sessionId);
        const summary = await generateSessionSummary(
          doc.title,
          session.startTopicTitle || "",
          allMessages.map((m) => ({ role: m.role, content: m.content }))
        );

        await updateLearningSession(input.sessionId, {
          status: "completed",
          summary,
          completedAt: new Date(),
        });

        // 학습 완료 알림 전송 (오너에게)
        const msgCount = allMessages.length;
        const answerCount = allMessages.filter((m) => m.role === "user").length;
        const notificationContent = [
          `📚 **학습 세션 완료**`,
          ``,
          `**문서:** ${doc.title}`,
          `**토픽:** ${session.startTopicTitle}`,
          `**총 메시지:** ${msgCount}개 (답변 ${answerCount}개)`,
          ``,
          `**학습 요약:**`,
          summary.slice(0, 500) + (summary.length > 500 ? "..." : ""),
        ].join("\n");

        try {
          await notifyOwner({
            title: `[QLoop] 학습 완료: ${session.startTopicTitle}`,
            content: notificationContent,
          });
        } catch (notifyErr) {
          // 알림 실패는 세션 종료를 막지 않음
          console.warn("[QLoop] 학습 완료 알림 전송 실패:", notifyErr);
        }

        return { summary };
      }),

    // 세션 메시지 조회
    getMessages: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ ctx, input }) => {
        const session = await getLearningSessionById(input.sessionId);
        if (!session || session.userId !== ctx.user.id) throw new Error("세션을 찾을 수 없습니다.");
        return getSessionMessages(input.sessionId);
      }),

    // 세션 상세 조회
    get: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ ctx, input }) => {
        const session = await getLearningSessionById(input.sessionId);
        if (!session || session.userId !== ctx.user.id) throw new Error("세션을 찾을 수 없습니다.");
        return session;
      }),

    // 사용자 세션 목록
    list: protectedProcedure.query(async ({ ctx }) => {
      return getSessionsByUserId(ctx.user.id);
    }),

    // 문서별 세션 목록
    listByDocument: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        return getSessionsByDocumentId(input.documentId, ctx.user.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
