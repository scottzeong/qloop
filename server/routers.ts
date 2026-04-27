import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { storagePut, storageGetSignedUrl } from "./storage";
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

// 개념 맵 노드
export interface ConceptNode {
  id: string;
  label: string;
  description: string;
  type: "core" | "sub" | "related"; // core=핵심, sub=하위, related=연관
  connections: string[]; // 연결된 다른 노드 id 목록
}

// 핵심 개념 카드
export interface ConceptCard {
  id: string;
  term: string;
  definition: string;
  example?: string;
  relatedTerms: string[];
  importance: "high" | "medium" | "low";
}

// 타임라인 항목 (역사적 흐름, 단계적 발전 등)
export interface TimelineItem {
  id: string;
  period: string; // 연도, 시기, 단계 등
  title: string;
  description: string;
  significance: string; // 이 시점의 의의
}

// 비교표 항목
export interface ComparisonItem {
  id: string;
  subject: string; // 비교 대상
  attributes: Record<string, string>; // 속성명 → 값
}

export interface ComparisonTable {
  title: string;
  headers: string[]; // 비교 속성 목록
  rows: ComparisonItem[];
}

// 학습 경로 단계
export interface LearningPathStep {
  id: string;
  order: number;
  title: string;
  description: string;
  topicIds: string[]; // 이 단계에서 학습할 토픽 id 목록
  estimatedMinutes: number;
}

export interface DocumentStructure {
  title: string;
  summary: string;
  chapters: ChapterNode[];
  // 추가 구조화 형태 (선택적)
  conceptMap?: ConceptNode[];
  keyConceptCards?: ConceptCard[];
  timeline?: TimelineItem[];
  comparisonTables?: ComparisonTable[];
  learningPath?: LearningPathStep[];
  documentType?: "textbook" | "research" | "manual" | "report" | "narrative" | "reference" | "other";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function analyzePdfStructure(pdfUrl: string, docTitle: string): Promise<DocumentStructure> {
  const systemPrompt = `You are an expert educational content analyzer.
Analyze the provided PDF document comprehensively and extract its structure in MULTIPLE formats simultaneously.
Return a single JSON object containing ALL of the following:

1. chapters: Hierarchical chapter/topic/subtopic tree
2. conceptMap: Key concepts as nodes with connections (max 15 nodes)
3. keyConceptCards: Important terms with definitions and examples (max 20 cards)
4. timeline: Chronological/sequential events or development stages IF the document has historical or process content (empty array if not applicable)
5. comparisonTables: Comparison tables for contrasting concepts/items IF the document compares things (empty array if not applicable)
6. learningPath: Recommended sequential learning steps (3-6 steps)
7. documentType: One of: textbook, research, manual, report, narrative, reference, other

For conceptMap nodes:
- type "core" = central/most important concepts
- type "sub" = supporting concepts
- type "related" = peripherally related concepts
- connections = array of other node IDs this concept links to

For keyConceptCards:
- importance: "high" for must-know terms, "medium" for important, "low" for supplementary

For learningPath:
- estimatedMinutes: realistic study time per step

Be thorough. Use the same language as the document (Korean if Korean).
Return ONLY valid JSON matching the schema exactly.`;

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
            documentType: { type: "string", enum: ["textbook", "research", "manual", "report", "narrative", "reference", "other"] },
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
            conceptMap: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  description: { type: "string" },
                  type: { type: "string", enum: ["core", "sub", "related"] },
                  connections: { type: "array", items: { type: "string" } },
                },
                required: ["id", "label", "description", "type", "connections"],
                additionalProperties: false,
              },
            },
            keyConceptCards: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  term: { type: "string" },
                  definition: { type: "string" },
                  example: { type: "string" },
                  relatedTerms: { type: "array", items: { type: "string" } },
                  importance: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["id", "term", "definition", "example", "relatedTerms", "importance"],
                additionalProperties: false,
              },
            },
            timeline: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  period: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  significance: { type: "string" },
                },
                required: ["id", "period", "title", "description", "significance"],
                additionalProperties: false,
              },
            },
            comparisonTables: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  headers: { type: "array", items: { type: "string" } },
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        subject: { type: "string" },
                        attributes: {
                          type: "object",
                          additionalProperties: { type: "string" },
                        },
                      },
                      required: ["id", "subject", "attributes"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "headers", "rows"],
                additionalProperties: false,
              },
            },
            learningPath: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  order: { type: "integer" },
                  title: { type: "string" },
                  description: { type: "string" },
                  topicIds: { type: "array", items: { type: "string" } },
                  estimatedMinutes: { type: "integer" },
                },
                required: ["id", "order", "title", "description", "topicIds", "estimatedMinutes"],
                additionalProperties: false,
              },
            },
          },
          required: ["title", "summary", "documentType", "chapters", "conceptMap", "keyConceptCards", "timeline", "comparisonTables", "learningPath"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : null;
  if (!content) throw new Error("AI 분석 결과를 받지 못했습니다.");

  let parsed: DocumentStructure;
  try {
    parsed = JSON.parse(content) as DocumentStructure;
  } catch {
    throw new Error("AI 분석 결과를 파싱하지 못했습니다. 다시 시도해 주세요.");
  }

  // 필수 필드 검증 및 기본값 보장
  if (!parsed.title) parsed.title = docTitle;
  if (!parsed.summary) parsed.summary = "";
  if (!Array.isArray(parsed.chapters)) parsed.chapters = [];
  if (!Array.isArray(parsed.conceptMap)) parsed.conceptMap = [];
  if (!Array.isArray(parsed.keyConceptCards)) parsed.keyConceptCards = [];
  if (!Array.isArray(parsed.timeline)) parsed.timeline = [];
  if (!Array.isArray(parsed.comparisonTables)) parsed.comparisonTables = [];
  if (!Array.isArray(parsed.learningPath)) parsed.learningPath = [];
  if (!parsed.documentType) parsed.documentType = "other";

  return parsed;
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
        // ASCII-safe 파일명 생성 (한글 등 비ASCII 문자 제거)
        const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `documents/${ctx.user.id}/${Date.now()}-${safeFileName}`;
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
          // /manus-storage/... 상대 경로를 실제 presigned S3 URL로 변환
          // storageUrl에서 /manus-storage/ 접두사 제거 → 실제 S3 key (hash 포함)
          const actualKey = doc.storageUrl.replace(/^\/manus-storage\//, '');
          const pdfSignedUrl = await storageGetSignedUrl(actualKey);
          const structure = await analyzePdfStructure(pdfSignedUrl, doc.title);
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

        // 첫 번째 질문 생성 - presigned S3 URL 사용
        const actualKey = doc.storageUrl.replace(/^\/manus-storage\//, '');
        const pdfSignedUrl = await storageGetSignedUrl(actualKey);
        const firstQuestion = await generateFirstQuestion(
          pdfSignedUrl,
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

        // AI 응답 생성 - presigned S3 URL 사용
        const actualKey = doc.storageUrl.replace(/^\/manus-storage\//, '');
        const pdfSignedUrl = await storageGetSignedUrl(actualKey);
        const aiResponse = await generateNextMessage(
          pdfSignedUrl,
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
