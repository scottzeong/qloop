import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import WordExtractor from "word-extractor";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { storagePut, storageGetSignedUrl } from "./storage";
import { notifyOwner } from "./_core/notification";
import { socraticRouter } from "./routers/socratic";
import { libraryRouter } from "./routers/library";
import { getDb } from "./db";
import {
  questions,
  questionEvaluations,
  questionTypes,
  evaluationDimensions,
  questionTypeDimensionWeights,
  socraticEvaluationPolicies,
  documents,
} from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  createDocument,
  getDocumentById,
  getDocumentsByUserId,
  getDocumentsByGroupId,
  getStandaloneDocumentsByUserId,
  updateDocumentAnalysis,
  deleteDocument,
  createDocumentGroup,
  getDocumentGroupById,
  getDocumentGroupsByUserId,
  updateDocumentGroup,
  deleteDocumentGroup,
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

export interface ConceptNode {
  id: string;
  label: string;
  description: string;
  type: "core" | "sub" | "related";
  connections: string[];
}

export interface ConceptCard {
  id: string;
  term: string;
  definition: string;
  example?: string;
  relatedTerms: string[];
  importance: "high" | "medium" | "low";
}

export interface TimelineItem {
  id: string;
  period: string;
  title: string;
  description: string;
  significance: string;
}

export interface ComparisonItem {
  id: string;
  subject: string;
  attributes: Record<string, string>;
}

export interface ComparisonTable {
  title: string;
  headers: string[];
  rows: ComparisonItem[];
}

export interface LearningPathStep {
  id: string;
  order: number;
  title: string;
  description: string;
  topicIds: string[];
  estimatedMinutes: number;
}

export interface DocumentStructure {
  title: string;
  summary: string;
  chapters: ChapterNode[];
  conceptMap?: ConceptNode[];
  keyConceptCards?: ConceptCard[];
  timeline?: TimelineItem[];
  comparisonTables?: ComparisonTable[];
  learningPath?: LearningPathStep[];
  documentType?: "textbook" | "research" | "manual" | "report" | "narrative" | "reference" | "other";
}

// ─── MIME type helpers ────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

type AllowedMime = typeof ALLOWED_MIME_TYPES[number];

const MIME_TO_FILE_TYPE: Record<AllowedMime, "pdf" | "doc" | "docx" | "ppt" | "pptx"> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

const MIME_TO_LLM_TYPE: Record<AllowedMime, "application/pdf"> = {
  "application/pdf": "application/pdf",
  "application/msword": "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "application/pdf",
  "application/vnd.ms-powerpoint": "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "application/pdf",
};

// ─── AI Helpers ───────────────────────────────────────────────────────────────

/**
 * Word/PPT 파일에서 텍스트를 추출하는 헬퍼
 * - docx: mammoth 사용
 * - doc: word-extractor 사용 (CFB 포맷 지원)
 * - ppt/pptx: officeparser 사용
 */
async function extractTextFromOfficeFile(fileUrl: string, mimeType: string): Promise<string | null> {
  try {
    // S3 signed URL에서 파일 다운로드
    const res = await fetch(fileUrl);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`파일 다운로드 실패: ${res.status} ${res.statusText} - ${body.slice(0, 200)}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 100) throw new Error(`다운로드된 파일이 너무 작습니다: ${buffer.length} bytes`);

    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      // DOCX → mammoth으로 텍스트 추출 (가장 안정적)
      const result = await mammoth.extractRawText({ buffer });
      return result.value || null;
    } else if (mimeType === "application/msword") {
      // DOC (Word 97-2003, CFB 포맷) → word-extractor 사용
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody() || null;
    } else {
      // PPT / PPTX → officeparser 사용
      const ast = await parseOffice(buffer);
      const text = ast.toText();
      return text || null;
    }
  } catch (e) {
    console.error("[extractTextFromOfficeFile] 텍스트 추출 실패:", e);
    return null;
  }
}

async function analyzeDocumentStructure(
  fileUrl: string,
  docTitle: string,
  mimeType: string = "application/pdf"
): Promise<DocumentStructure> {
  const systemPrompt = `You are an expert educational content analyzer.
Analyze the provided document comprehensively and extract its structure in MULTIPLE formats simultaneously.
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

  // PDF는 file_url로 직접 전달, Word/PPT는 텍스트 추출 후 텍스트로 전달
  const isPdf = mimeType === "application/pdf";
  let userContent: Message["content"];

  if (isPdf) {
    userContent = [
      {
        type: "file_url" as const,
        file_url: { url: fileUrl, mime_type: "application/pdf" },
      },
      {
        type: "text" as const,
        text: `Please analyze this document titled "${docTitle}" and return the hierarchical structure as JSON.`,
      },
    ];
  } else {
    // Word/PPT: 텍스트 추출 후 텍스트로 분석
    const extractedText = await extractTextFromOfficeFile(fileUrl, mimeType);
    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error("파일에서 텍스트를 추출할 수 없습니다. 파일이 손상되었거나 내용이 없습니다.");
    }
    // 너무 긴 텍스트는 앞부분 50,000자로 제한 (LLM 토큰 한도)
    const truncated = extractedText.length > 50000 ? extractedText.slice(0, 50000) + "\n...[truncated]" : extractedText;
    userContent = `Please analyze this document titled "${docTitle}".\n\nDocument content:\n${truncated}\n\nReturn the hierarchical structure as JSON.`;
  }

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user" as const,
        content: userContent,
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

/**
 * 첫 번째 질문 생성 — 문서를 직접 참조하지 않고 토픽 제목/설명만으로 질문 생성
 * 학습자가 문서를 읽지 않고 순수 문답으로 학습할 수 있도록 함
 */
async function generateFirstQuestion(
  topicTitle: string,
  topicDescription: string,
  docTitle: string,
  openQloopMode = false
): Promise<string> {
  const openQloopInstruction = openQloopMode
    ? `\nOPEN QLOOP MODE: You have access to all your knowledge beyond the provided document. Feel free to draw connections to related fields, current events, real-world applications, cutting-edge research, and interdisciplinary perspectives. Enrich the learning experience with broader context and diverse examples from the wider world.`
    : "";
  const response = await invokeLLM({
    messages: [
      {
        role: "system" as const,
        content: `You are an expert educational tutor using the Socratic method.
You are helping a learner study a specific topic.
Generate an engaging first question to start the learning session.
CRITICAL RULES:
- Do NOT ask the learner to read, look at, or refer to any document, book, or material.
- Do NOT say things like "according to the document", "as described in the text", "what does the document say about...".
- Ask questions that test the learner's own understanding and thinking.
- The question should be open-ended and thought-provoking.
- Assess the learner's baseline understanding of the topic concept itself.
- Be directly related to the topic.
- Use the same language as the topic title (Korean if Korean).${openQloopInstruction}
Return only the question text, nothing else.`,
      },
      {
        role: "user" as const,
        content: `Document context: "${docTitle}"\nTopic: "${topicTitle}"\nTopic description: "${topicDescription}"\n\nGenerate the first learning question for this topic. Remember: ask about the concept, not about the document.`,
      },
    ],
  });
  const raw = response.choices[0]?.message?.content;
  return (typeof raw === "string" ? raw : null) || "이 토픽에 대해 무엇을 알고 있나요?";
}

/**
 * 다음 AI 메시지 생성 — 문서 직접 참조 없이 순수 문답으로 학습 진행
 */
// ─── Socratic 백그라운드 평가 헬퍼 ──────────────────────────────────────────────
async function runSocraticEvaluation(opts: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  learnerId: number;
  sessionId: number;
  questionId: number;
  questionTypeId: number;
  responseText: string;
  sourceContext: string;
}) {
  try {
    const { db, learnerId, sessionId, questionId, questionTypeId, responseText, sourceContext } = opts;
    const [question] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
    if (!question) return;
    const [questionType] = await db.select().from(questionTypes).where(eq(questionTypes.id, questionTypeId)).limit(1);
    const weights = await db.select().from(questionTypeDimensionWeights).where(eq(questionTypeDimensionWeights.questionTypeId, questionTypeId));
    const dims = await db.select().from(evaluationDimensions).where(eq(evaluationDimensions.enabled, 1));
    const dimensionDescriptions = dims.map((d) => {
      const w = weights.find((ww) => ww.evaluationDimensionId === d.id);
      return `- ${d.displayName} (가중치: ${w?.weight ?? 0}%): ${d.description}`;
    }).join("\n");
    const prompt = `답변 평가\n질문유형: ${questionType?.displayName ?? ""}\n질문: ${question.questionText}\n학습자 답변: ${responseText}\n평가 요소:\n${dimensionDescriptions}\n\n각 요소 0-5점 평가. JSON만 출력:\n{"dimension_scores":{"accuracy":0,"reasoning":0,"evidence":0,"clarity":0,"depth":0,"application":0},"level":"Developing","strengths":[],"weaknesses":[],"detected_gaps":[],"misconceptions":[],"recommended_followup_question":"","short_feedback":"","evaluation_comment":"","confidence":0.8}`;
    const response = await invokeLLM({
      messages: [
        { role: "system" as const, content: "You are a Socratic evaluation engine. Always respond with valid JSON only." },
        { role: "user" as const, content: prompt },
      ] as Message[],
      response_format: { type: "json_object" as const },
    });
    let evalResult: Record<string, unknown> = {};
    try { evalResult = JSON.parse(response.choices[0].message.content as string); } catch { return; }
    let weightedScore = 0;
    let totalWeight = 0;
    for (const dim of dims) {
      const w = weights.find((ww) => ww.evaluationDimensionId === dim.id);
      const score = (evalResult.dimension_scores as Record<string, number>)?.[dim.name] ?? 0;
      const weight = w?.weight ?? 0;
      weightedScore += (score / 5) * 100 * (weight / 100);
      totalWeight += weight;
    }
    if (totalWeight > 0) weightedScore = Math.round(weightedScore);
    await db.insert(questionEvaluations).values({
      learnerId,
      sessionId,
      questionId,
      questionTypeId,
      responseText,
      dimensionScoresJson: evalResult.dimension_scores ?? {},
      weightedScore,
      level: (evalResult.level as string) ?? "Developing",
      strengthsJson: (evalResult.strengths as unknown[]) ?? [],
      weaknessesJson: (evalResult.weaknesses as unknown[]) ?? [],
      detectedGapsJson: (evalResult.detected_gaps as unknown[]) ?? [],
      misconceptionsJson: (evalResult.misconceptions as unknown[]) ?? [],
      recommendedFollowupQuestion: (evalResult.recommended_followup_question as string) ?? "",
      evaluationComment: (evalResult.evaluation_comment as string) ?? "",
      confidence: (evalResult.confidence as number) ?? 0.8,
      questionTypeSnapshotJson: { id: questionType?.id, name: questionType?.name, displayName: questionType?.displayName },
    });
  } catch (err) {
    console.warn("[Socratic] 평가 실행 오류:", err);
  }
}

async function generateNextMessage(
  docTitle: string,
  topicTitle: string,
  conversationHistory: Array<{ role: string; content: string; messageType: string }>,
  userMessage: string,
  isUserQuestion: boolean,
  openQloopMode = false
): Promise<{ content: string; messageType: string; isTopicComplete: boolean }> {
  const openQloopInstruction = openQloopMode
    ? `\nOPEN QLOOP MODE: You have access to all your knowledge beyond the provided document. Draw connections to related fields, current events, real-world applications, cutting-edge research, and interdisciplinary perspectives. Enrich the learning experience with broader context and diverse examples from the wider world.`
    : "";
  const historyText = conversationHistory
    .map((m) => `[${m.role === "ai" ? "AI 튜터" : "학습자"}]: ${m.content}`)
    .join("\n");

  const baseRules = `CRITICAL RULES:
- Do NOT ask the learner to read, look at, or refer to any document, book, or material.
- Do NOT say things like "according to the document", "as described in the text", "what does the document say about...".
- All questions and feedback must be based on the learner's own thinking and understanding.
- Use the same language as the conversation (Korean if Korean).`;

  if (isUserQuestion) {
    const response = await invokeLLM({
      messages: [
        {
          role: "system" as const,
          content: `You are an expert educational tutor. The learner has asked you a question.
Answer their question clearly and thoroughly based on your knowledge of the topic.
After answering, naturally transition back to the learning session with a follow-up question.
${baseRules}${openQloopInstruction}`,
        },
        {
          role: "user" as const,
          content: `Topic context: "${docTitle}" > "${topicTitle}"\n\nConversation so far:\n${historyText}\n\nLearner's question: ${userMessage}`,
        },
      ],
    });
    return {
      content: (typeof response.choices[0]?.message?.content === "string" ? response.choices[0]?.message?.content : null) || "좋은 질문입니다.",
      messageType: "ai_answer",
      isTopicComplete: false,
    };
  } else {
    const response = await invokeLLM({
      messages: [
        {
          role: "system" as const,
          content: `You are an expert educational tutor using the Socratic method.
The learner has answered your question. Follow these strict rules:

1. FEEDBACK: Keep it SHORT — maximum 1-2 sentences. Acknowledge correct points or briefly correct misconceptions. Do NOT summarize or repeat what the learner said.

2. NEXT QUESTION: Choose ONE question type from the following and vary them throughout the session:
   - [hint] Give a small hint and ask them to elaborate further
   - [compare] Ask them to compare two concepts or approaches
   - [cause] Ask about the cause or reason behind something
   - [effect] Ask about the consequence or result of something
   - [apply] Ask them to apply the concept to a real-world scenario
   - [define] Ask them to define or explain a specific term in their own words
   - [example] Ask them to give a concrete example
   - [challenge] Present a slightly incorrect statement and ask if they agree
   Do NOT always ask open-ended "what do you think" style questions.

3. COMPLETION: If the topic has been thoroughly covered (after 4-6 exchanges), provide a summary and indicate completion.
${baseRules}${openQloopInstruction}
Return a JSON with:
{
  "feedback": "1-2 sentence feedback only",
  "nextQuestion": "next question OR null if topic is complete",
  "topicSummary": "summary if topic is complete OR null",
  "isTopicComplete": boolean
}}`,
        },
        {
          role: "user" as const,
          content: `Topic context: "${docTitle}" > "${topicTitle}"\n\nConversation so far:\n${historyText}\n\nLearner's answer: ${userMessage}`,
        },
      ],
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
      messageType: parsed.isTopicComplete ? "feedback" : "question",
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
  socratic: socraticRouter,
  library: libraryRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Document Groups ─────────────────────────────────────────────────────────
  group: router({
    // 그룹 생성
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const groupId = await createDocumentGroup({
          userId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          analysisStatus: "pending",
        });
        return { groupId };
      }),

    // 그룹 목록 조회
    list: protectedProcedure.query(async ({ ctx }) => {
      const groups = await getDocumentGroupsByUserId(ctx.user.id);
      return groups;
    }),

    // 그룹 상세 조회 (소속 문서 포함)
    get: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ ctx, input }) => {
        const group = await getDocumentGroupById(input.groupId);
        if (!group || group.userId !== ctx.user.id) throw new Error("그룹을 찾을 수 없습니다.");
        const docs = await getDocumentsByGroupId(input.groupId);
        // 각 문서별 topicProgress 계산
        const topicProgressByDoc: Record<number, Record<string, "completed" | "active">> = {};
        for (const doc of docs) {
          const sessions = await getSessionsByDocumentId(doc.id, ctx.user.id);
          const progressMap: Record<string, "completed" | "active"> = {};
          for (const s of sessions) {
            if (s.startTopicId) {
              const tid = s.startTopicId;
              if (s.status === "completed") {
                progressMap[tid] = "completed";
              } else if (s.status === "active" && progressMap[tid] !== "completed") {
                progressMap[tid] = "active";
              }
            }
            if (Array.isArray(s.completedTopics)) {
              for (const ctid of s.completedTopics as string[]) {
                progressMap[ctid] = "completed";
              }
            }
          }
          topicProgressByDoc[doc.id] = progressMap;
        }
        return { ...group, documents: docs, topicProgressByDoc };
      }),

    // 그룹 이름/설명 수정
    update: protectedProcedure
      .input(z.object({ groupId: z.number(), name: z.string().min(1).optional(), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const group = await getDocumentGroupById(input.groupId);
        if (!group || group.userId !== ctx.user.id) throw new Error("그룹을 찾을 수 없습니다.");
        await updateDocumentGroup(input.groupId, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        });
        return { success: true };
      }),

    // 그룹 삭제 (소속 문서도 함께 삭제)
    delete: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const group = await getDocumentGroupById(input.groupId);
        if (!group || group.userId !== ctx.user.id) throw new Error("그룹을 찾을 수 없습니다.");
        const docs = await getDocumentsByGroupId(input.groupId);
        for (const doc of docs) {
          await deleteDocument(doc.id);
        }
        await deleteDocumentGroup(input.groupId);
        return { success: true };
      }),

    // 그룹 전체 분석 (소속 문서 통합 구조 생성)
    analyze: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const group = await getDocumentGroupById(input.groupId);
        if (!group || group.userId !== ctx.user.id) throw new Error("그룹을 찾을 수 없습니다.");
        const docs = await getDocumentsByGroupId(input.groupId);
        if (docs.length === 0) throw new Error("그룹에 문서가 없습니다.");

        await updateDocumentGroup(input.groupId, { analysisStatus: "analyzing" });

        try {
          // 각 문서를 개별 분석 후 통합
          const structures: DocumentStructure[] = [];
          for (const doc of docs) {
            if (doc.analysisStatus === "done" && doc.structure) {
              structures.push(doc.structure as DocumentStructure);
            } else {
              const actualKey = doc.storageUrl.replace(/^\/manus-storage\//, "");
              const signedUrl = await storageGetSignedUrl(actualKey);
              const mimeForAnalysis = doc.fileType === "pdf" ? "application/pdf" : doc.fileType === "doc" ? "application/msword" : doc.fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : doc.fileType === "ppt" ? "application/vnd.ms-powerpoint" : doc.fileType === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/pdf";
              const structure = await analyzeDocumentStructure(signedUrl, doc.title, mimeForAnalysis);
              await updateDocumentAnalysis(doc.id, "done", structure);
              structures.push(structure);
            }
          }

          // 통합 구조 생성
          const mergedStructure: DocumentStructure = {
            title: group.name,
            summary: structures.map((s) => s.summary).filter(Boolean).join(" | "),
            chapters: structures.flatMap((s, i) =>
              s.chapters.map((ch) => ({ ...ch, id: `doc${i}_${ch.id}`, title: `[${docs[i]?.title ?? ""}] ${ch.title}` }))
            ),
            conceptMap: structures.flatMap((s) => s.conceptMap ?? []),
            keyConceptCards: structures.flatMap((s) => s.keyConceptCards ?? []),
            timeline: structures.flatMap((s) => s.timeline ?? []),
            comparisonTables: structures.flatMap((s) => s.comparisonTables ?? []),
            learningPath: structures.flatMap((s) => s.learningPath ?? []),
            documentType: "other",
          };

          await updateDocumentGroup(input.groupId, { analysisStatus: "done", structure: mergedStructure });
          return { success: true, structure: mergedStructure };
        } catch (e) {
          await updateDocumentGroup(input.groupId, { analysisStatus: "error" });
          throw e;
        }
      }),
  }),

  // ─── Documents ──────────────────────────────────────────────────────────────
  document: router({
    // 파일 업로드 (PDF / DOC / DOCX / PPT / PPTX)
    upload: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileData: z.string(), // base64
          fileSize: z.number(),
          mimeType: z.string(),
          groupId: z.number().optional(), // 그룹에 추가할 경우
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 허용된 MIME 타입 검증
        if (!ALLOWED_MIME_TYPES.includes(input.mimeType as AllowedMime)) {
          throw new Error("지원하지 않는 파일 형식입니다. PDF, DOC, DOCX, PPT, PPTX만 업로드 가능합니다.");
        }

        const buffer = Buffer.from(input.fileData, "base64");
        const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `documents/${ctx.user.id}/${Date.now()}-${safeFileName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        const fileType = MIME_TO_FILE_TYPE[input.mimeType as AllowedMime] ?? "pdf";
        const titleWithoutExt = input.fileName.replace(/\.(pdf|doc|docx|ppt|pptx)$/i, "");

        const docId = await createDocument({
          userId: ctx.user.id,
          groupId: input.groupId ?? null,
          title: titleWithoutExt,
          fileType,
          storageKey: key,
          storageUrl: url,
          fileSize: input.fileSize,
          analysisStatus: "pending",
          analysisStep: "uploading",
        });
        return { documentId: docId, storageUrl: url };
      }),

    // AI 구조 분석 시작
     analyze: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        // 단계 1: extracting (파일 접근 중)
        await updateDocumentAnalysis(input.documentId, "analyzing", undefined, undefined, "extracting");
        try {
          const actualKey = doc.storageUrl.replace(/^\/manus-storage\//, "");
          const signedUrl = await storageGetSignedUrl(actualKey);
          const mimeForAnalysis = doc.fileType === "pdf" ? "application/pdf" : doc.fileType === "doc" ? "application/msword" : doc.fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : doc.fileType === "ppt" ? "application/vnd.ms-powerpoint" : doc.fileType === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/pdf";
          // 단계 2: structuring (AI 구조 분석 중)
          await updateDocumentAnalysis(input.documentId, "analyzing", undefined, undefined, "structuring");
          const structure = await analyzeDocumentStructure(signedUrl, doc.title, mimeForAnalysis);
          await updateDocumentAnalysis(input.documentId, "done", structure, undefined, "done");
          return { success: true, structure };
        } catch (e) {
          await updateDocumentAnalysis(input.documentId, "error", undefined, undefined, "error");
          throw e;
        }
      }),
    // 문서 목록 조회 (단독 문서만)
    list: protectedProcedure.query(async ({ ctx }) => {
      return getStandaloneDocumentsByUserId(ctx.user.id);
    }),

    // 전체 문서 목록 (그룹 포함)
    listAll: protectedProcedure.query(async ({ ctx }) => {
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

    // 문서 삭제
    delete: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        await deleteDocument(input.documentId);
        return { success: true };
      }),
    // 학습 구조 선택 고정 (한번만 선택 가능)
    setStructure: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        structure: z.enum(["tree", "conceptMap", "learningPath"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        // 이미 잠긴 경우 변경 불가
        if ((doc as any).structureLocked === 1) throw new Error("이미 학습 구조가 확정되었습니다. 재분석을 실행하면 초기화됩니다.");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        await db.update(documents).set({
          selectedStructure: input.structure,
          structureLocked: 1,
        }).where(eq(documents.id, input.documentId));
        return { success: true };
      }),
    // 재분석 (학습 구조 잠금 초기화 포함)
    reanalyze: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        // 학습 구조 잠금 해제 + 구조 선택 초기화
        const db2 = await getDb();
        if (!db2) throw new Error("DB 연결 실패");
        await db2.update(documents).set({
          selectedStructure: null,
          structureLocked: 0,
          analysisStatus: "analyzing",
          analysisStep: "extracting",
          structure: null,
        }).where(eq(documents.id, input.documentId));
        try {
          const actualKey = doc.storageUrl.replace(/^\/manus-storage\//, "");
          const signedUrl = await storageGetSignedUrl(actualKey);
          const mimeForAnalysis = doc.fileType === "pdf" ? "application/pdf" : doc.fileType === "doc" ? "application/msword" : doc.fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : doc.fileType === "ppt" ? "application/vnd.ms-powerpoint" : doc.fileType === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/pdf";
          await updateDocumentAnalysis(input.documentId, "analyzing", undefined, undefined, "structuring");
          const structure = await analyzeDocumentStructure(signedUrl, doc.title, mimeForAnalysis);
          await updateDocumentAnalysis(input.documentId, "done", structure, undefined, "done");
          return { success: true, structure };
        } catch (e) {
          await updateDocumentAnalysis(input.documentId, "error", undefined, undefined, "error");
          throw e;
        }
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
          groupId: z.number().optional(),
          evaluationEnabled: z.boolean().optional(),
          evaluationPolicyId: z.number().optional(),
          selectedStructure: z.enum(["tree", "conceptMap", "learningPath"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
         const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        const openQloopMode = (doc as any).openQloopEnabled === 1;
        const sessionId = await createLearningSession({
          userId: ctx.user.id,
          documentId: input.documentId,
          groupId: input.groupId ?? null,
          startTopicId: input.topicId,
          startTopicTitle: input.topicTitle,
          status: "active",
          currentTopicId: input.topicId,
          totalQuestions: 0,
          answeredQuestions: 0,
          openQloopMode: openQloopMode ? 1 : 0,
          evaluationEnabled: input.evaluationEnabled ? 1 : 0,
          evaluationPolicyId: input.evaluationPolicyId ?? null,
          selectedStructure: input.selectedStructure ?? null,
        });
        // 첫 번째 질문 생성 — 문서 직접 참조 없이 토픽 정보만 사용
        const firstQuestion = await generateFirstQuestion(
          input.topicTitle,
          input.topicDescription,
          doc.title,
          openQloopMode
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

        // AI 응답 생성 — 문서 직접 참조 없이 순수 문답
        const sessionOpenQloop = (session as any).openQloopMode === 1;
        const aiResponse = await generateNextMessage(
          doc.title,
          session.startTopicTitle || "",
          history,
          input.content,
          input.isUserQuestion,
          sessionOpenQloop
        );

        // AI 메시지 저장
        const msgCount = messages.filter((m) => m.messageType === "question").length;
        // Socratic 평가: 학습자 답변인 경우 이전 질문 ID 조회 후 백그라운드 평가
        let socraticQuestionId: number | undefined;
        let questionTypeName: string | undefined;
        if (!input.isUserQuestion) {
          try {
            const db = await getDb();
            if (db) {
              // 이전 AI 질문 메시지에서 socraticQuestionId 조회
              const prevAiMsg = [...messages].reverse().find(
                (m) => m.role === "ai" && m.socraticQuestionId
              );
              if (prevAiMsg?.socraticQuestionId) {
                // 백그라운드 평가 실행 (await 없이 fire-and-forget)
                const prevQId = prevAiMsg.socraticQuestionId;
                const [prevQ] = await db.select().from(questions).where(eq(questions.id, prevQId)).limit(1);
                if (prevQ) {
                  const [qt] = await db.select().from(questionTypes).where(eq(questionTypes.id, prevQ.questionTypeId)).limit(1);
                  questionTypeName = qt?.name;
                  // 비동기 평가 (응답 지연 방지)
                  runSocraticEvaluation({
                    db,
                    learnerId: ctx.user.id,
                    sessionId: input.sessionId,
                    questionId: prevQId,
                    questionTypeId: prevQ.questionTypeId,
                    responseText: input.content,
                    sourceContext: `${doc.title} > ${session.startTopicTitle}`,
                  }).catch(console.warn);
                }
              }
            }
          } catch (e) {
            console.warn("[Socratic] 평가 연결 오류:", e);
          }
        }
        // AI 질문인 경우 questions 테이블에도 저장하여 평가 연결
        let newSocraticQuestionId: number | undefined;
        if (!input.isUserQuestion && aiResponse.messageType === "question" && !aiResponse.isTopicComplete) {
          try {
            const db = await getDb();
            if (db) {
              // 활성 정책 조회 (global default)
              const [defaultPolicy] = await db
                .select()
                .from(socraticEvaluationPolicies)
                .where(eq(socraticEvaluationPolicies.courseType, "global"))
                .limit(1);
              if (defaultPolicy) {
                // 질문유형 조회 (이름으로)
                let qtId: number | undefined;
                if (questionTypeName) {
                  const [qt] = await db.select().from(questionTypes).where(eq(questionTypes.name, questionTypeName)).limit(1);
                  qtId = qt?.id;
                }
                if (!qtId) {
                  // 기본 질문유형 (definition)
                  const [qt] = await db.select().from(questionTypes).where(eq(questionTypes.name, "definition")).limit(1);
                  qtId = qt?.id;
                }
                if (qtId) {
                  const [qResult] = await db.insert(questions).values({
                    sessionId: input.sessionId,
                    learnerId: ctx.user.id,
                    questionTypeId: qtId,
                    questionText: aiResponse.content,
                    intent: "",
                    expectedKeyPointsJson: [],
                    difficultyLevel: "basic",
                    policySnapshotJson: { policyId: defaultPolicy.id, policyName: defaultPolicy.name },
                  });
                  newSocraticQuestionId = (qResult as any).insertId;
                }
              }
            }
          } catch (e) {
            console.warn("[Socratic] 질문 저장 오류:", e);
          }
        }
        await createSessionMessage({
          sessionId: input.sessionId,
          role: "ai",
          messageType: aiResponse.messageType as "question" | "answer" | "feedback" | "user_question" | "ai_answer" | "system",
          content: aiResponse.content,
          topicId: session.currentTopicId ?? undefined,
          topicTitle: session.startTopicTitle ?? undefined,
          questionIndex: aiResponse.isTopicComplete ? undefined : msgCount + 1,
          questionTypeName: questionTypeName,
          socraticQuestionId: newSocraticQuestionId,
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

        // 학습 완료 알림
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
    // 문서별 토픽 완성도 조회 (topicId → status 맵)
    // 완료: 해당 topicId로 completed 세션 존재
    // 진행중: 해당 topicId로 active 세션 존재 (completed 없음)
    // 미진행: 세션 없음
    getTopicProgress: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const sessions = await getSessionsByDocumentId(input.documentId, ctx.user.id);
        const progressMap: Record<string, "completed" | "active"> = {};
        for (const s of sessions) {
          // startTopicId 기준 완성도 기록
          if (s.startTopicId) {
            const tid = s.startTopicId;
            if (s.status === "completed") {
              progressMap[tid] = "completed";
            } else if (s.status === "active" && progressMap[tid] !== "completed") {
              progressMap[tid] = "active";
            }
          }
          // completedTopics 배열에 있는 모든 토픽도 완료로 표시
          // (학습 중 여러 토픽을 다룸는 세션에서도 일관성 유지)
          if (Array.isArray(s.completedTopics)) {
            for (const ctid of s.completedTopics as string[]) {
              progressMap[ctid] = "completed";
            }
          }
        }
        return progressMap;
      }),
  }),
});

export type AppRouter = typeof appRouter;
