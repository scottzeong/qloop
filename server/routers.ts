import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { hashPassword, verifyPassword } from "./_core/password";
import { sdk } from "./_core/sdk";
import { nanoid } from "nanoid";
import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import WordExtractor from "word-extractor";
import PDFParser from "pdf2json";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { aiInvoke } from "./ai/aiRouter";
import { storagePut, storageGetSignedUrl } from "./storage";
import { notifyOwner } from "./_core/notification";
import { socraticRouter } from "./routers/socratic";
import { libraryRouter } from "./routers/library";
import { aiConnectionRouter } from "./routers/aiConnection";
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
  getSessionsByGroupId,
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
  /** Column values in the same order as headers */
  values: string[];
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

const MIME_TO_FILE_TYPE: Record<AllowedMime, "pdf" | "doc" | "docx" | "ppt" | "pptx" | "text"> = {
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

async function extractTextFromPdf(fileUrl: string): Promise<string | null> {
  try {
    console.log("[extractTextFromPdf] 시작:", fileUrl.slice(0, 80));
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`PDF 다운로드 실패: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log("[extractTextFromPdf] 버퍼 크기:", buffer.length);
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    console.log("[extractTextFromPdf] 추출 텍스트 길이:", data.text?.length ?? 0);
    return data.text && data.text.trim().length > 0 ? data.text : null;
  } catch (e) {
    console.error("[extractTextFromPdf] 실패:", e);
    return null;
  }
}

async function analyzeDocumentStructure(
  fileUrl: string,
  docTitle: string,
  mimeType: string = "application/pdf",
  userId: number | null = null
): Promise<DocumentStructure & { detectedLanguage?: string }> {
  const systemPrompt = `You are an expert educational content analyzer.
Analyze the provided document comprehensively and extract its structure in MULTIPLE formats simultaneously.
Return a single JSON object containing ALL of the following fields:

1. title (string): Document title
2. summary (string): Brief summary
3. documentType (string): One of: textbook, research, manual, report, narrative, reference, other
4. chapters (array): Hierarchical chapter/topic/subtopic tree. Each chapter: {id, title, order, topics[]}. Each topic: {id, title, description, order, subtopics[]}. Each subtopic: {id, title, description, order}.
5. conceptMap (array, max 15): Key concept nodes. Each: {id, label, description, type (core/sub/related), connections (array of other node ids)}
6. keyConceptCards (array, max 20): Important terms. Each: {id, term, definition, example, relatedTerms[], importance (high/medium/low)}
7. timeline (array): Chronological events IF applicable, else []. Each: {id, period, title, description, significance}
8. comparisonTables (array): Comparison tables IF applicable, else []. Each: {title, headers[], rows[]}. Each row: {id, subject, values[] (values in same order as headers)}
9. learningPath (array, 3-6 steps): Recommended learning steps. Each: {id, order, title, description, topicIds[], estimatedMinutes}

Be thorough. Use the same language as the document (Korean if Korean).
Return ONLY raw valid JSON. No markdown, no code blocks, no explanation.`;

  // 모든 파일 형식(PDF 포함)을 텍스트 추출 후 텍스트로 분석
  // (이전 PDF file_url 방식은 Forge API에서 파싱 실패 발생)
  const isPdf = mimeType === "application/pdf";
  let userContent: Message["content"];
  let extractedText: string | null = null;

  if (isPdf) {
    extractedText = await extractTextFromPdf(fileUrl);
    if (extractedText && extractedText.trim().length >= 50) {
      const truncated = extractedText.length > 50000 ? extractedText.slice(0, 50000) + "\n...[truncated]" : extractedText;
      userContent = `Please analyze this document titled "${docTitle}".\n\nDocument content:\n${truncated}\n\nReturn the hierarchical structure as JSON.`;
    } else {
      throw new Error("PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF는 지원되지 않습니다. 텍스트가 포함된 PDF를 업로드해주세요.");
    }
  } else {
    // Word/PPT: 텍스트 추출 후 텍스트로 분석
    extractedText = await extractTextFromOfficeFile(fileUrl, mimeType);
    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error("파일에서 텍스트를 추출할 수 없습니다. 파일이 손상되었거나 내용이 없습니다.");
    }
    const truncated = extractedText.length > 50000 ? extractedText.slice(0, 50000) + "\n...[truncated]" : extractedText;
    userContent = `Please analyze this document titled "${docTitle}".\n\nDocument content:\n${truncated}\n\nReturn the hierarchical structure as JSON.`;
  }

  // PDF 모드: response_format 없이 호출 (Forge API는 file_url + json_schema 동시 미지원)
  // 텍스트 모드(Word/PPT): json_schema로 구조화 출력 요청
  const baseMessages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user" as const, content: userContent },
  ];

  const jsonSchema = {
    type: "json_schema" as const,
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
                        values: {
                          type: "array",
                          items: { type: "string" },
                          description: "Column values in the same order as headers",
                        },
                      },
                      required: ["id", "subject", "values"],
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
    };

  console.log(`[ANALYZE] isPdf=${isPdf}, mimeType=${mimeType}, userId=${userId}`);
  let response: Awaited<ReturnType<typeof aiInvoke>>;
  try {
    response = await aiInvoke(userId, {
      messages: baseMessages,
      ...(isPdf ? {} : { response_format: jsonSchema }),
    });
  } catch (invokeErr) {
    console.error(`[ANALYZE] aiInvoke error:`, invokeErr);
    throw invokeErr;
  }

  const rawContent = response.choices[0]?.message?.content;
  console.log(`[ANALYZE] rawContent type=${typeof rawContent}, length=${typeof rawContent === 'string' ? rawContent.length : 'N/A'}, preview=${typeof rawContent === 'string' ? rawContent.slice(0, 200) : JSON.stringify(rawContent)?.slice(0, 200)}`);

  // Forge API가 json_schema 모드에서 content를 이미 파싱된 객체로 반환할 수 있음
  let parsed: DocumentStructure;
  if (!rawContent) {
    throw new Error("AI 분석 결과를 받지 못했습니다. (빈 응답)");
  } else if (typeof rawContent === "object") {
    // 이미 파싱된 JSON 객체
    parsed = rawContent as unknown as DocumentStructure;
  } else {
    // 문자열 → JSON 파싱
    // stripped를 catch 블록에서도 접근 가능하도록 try 블록 밖에 선언
    let stripped = (rawContent as string).trim();
    // 마크다운 코드 블록 제거 (```json ... ``` 형태, 멀티라인 대응)
    stripped = stripped.replace(/^```(?:json)?[\s\S]*?\n/, "").replace(/\n```[\s\S]*$/, "").trim();
    if (stripped.startsWith('```')) stripped = stripped.replace(/^```[^\n]*/, '').trim();
    if (stripped.endsWith('```')) stripped = stripped.replace(/```$/, '').trim();
    // 시작 { 이전 텍스트 제거
    const jsonStart = stripped.indexOf('{');
    if (jsonStart > 0) stripped = stripped.slice(jsonStart);
    // 마지막 } 이후 텍스트 제거
    const jsonEnd = stripped.lastIndexOf('}');
    if (jsonEnd !== -1 && jsonEnd < stripped.length - 1) stripped = stripped.slice(0, jsonEnd + 1);
    try {
      parsed = JSON.parse(stripped) as DocumentStructure;
    } catch (parseErr) {
      const fullContent = rawContent as string;
      console.error(`[ANALYZE] JSON parse error. length=${fullContent.length}`);
      console.error(`[ANALYZE] First 1000: ${fullContent.slice(0, 1000)}`);
      console.error(`[ANALYZE] Last 500: ${fullContent.slice(-500)}`);
      // 잘린 JSON 복구 시도: 마지막 완전한 } 위치까지만 파싱
      try {
        const lastBrace = stripped.lastIndexOf('}');
        if (lastBrace > 0) {
          const truncated = stripped.slice(0, lastBrace + 1);
          parsed = JSON.parse(truncated) as DocumentStructure;
          console.log('[ANALYZE] Recovered truncated JSON successfully');
        } else {
          throw new Error('no closing brace');
        }
      } catch {
        throw new Error(`AI 분석 결과를 파싱하지 못했습니다: ${fullContent.slice(0, 200)}`);
      }
    }
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

  // 원문 언어 감지: 첫 번째 토픽 제목으로 언어 판단
  let detectedLanguage = "ko";
  try {
    const sampleText = parsed.chapters?.[0]?.title || parsed.title || docTitle || "";
    const langResp = await aiInvoke(userId, {
      messages: [
        { role: "system", content: "Detect the language of the given text and return ONLY the ISO 639-1 language code (e.g. en, ko, ja, zh, fr, de, es, pt, ar). Return nothing else." },
        { role: "user", content: sampleText },
      ],
    });
    const raw = langResp.choices[0]?.message?.content;
    const code = (typeof raw === "string" ? raw.trim().toLowerCase() : "").slice(0, 5);
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(code)) detectedLanguage = code.slice(0, 2);
  } catch (_) { /* 감지 실패 시 ko 폴백 */ }

  return { ...parsed, detectedLanguage };
}

/**
 * 텍스트 콘텐츠를 직접 분석하는 공통 함수 (fileType=text 문서용)
 */
async function analyzeTextContent(
  text: string,
  docTitle: string,
  userId: number | null = null
): Promise<DocumentStructure & { detectedLanguage?: string }> {
  const systemPrompt = `You are an expert educational content analyzer.
Analyze the provided document comprehensively and extract its structure in MULTIPLE formats simultaneously.
Return a single JSON object containing ALL of the following fields:

1. title (string): Document title
2. summary (string): Brief summary
3. documentType (string): One of: textbook, research, manual, report, narrative, reference, other
4. chapters (array): Hierarchical chapter/topic/subtopic tree. Each chapter: {id, title, order, topics[]}. Each topic: {id, title, description, order, subtopics[]}. Each subtopic: {id, title, description, order}.
5. conceptMap (array, max 15): Key concept nodes. Each: {id, label, description, type (core/sub/related), connections (array of other node ids)}
6. keyConceptCards (array, max 20): Important terms. Each: {id, term, definition, example, relatedTerms[], importance (high/medium/low)}
7. timeline (array): Chronological events IF applicable, else []. Each: {id, period, title, description, significance}
8. comparisonTables (array): Comparison tables IF applicable, else []. Each: {title, headers[], rows[]}. Each row: {id, subject, values[] (values in same order as headers)}
9. learningPath (array, 3-6 steps): Recommended learning steps. Each: {id, order, title, description, topicIds[], estimatedMinutes}

Be thorough. Use the same language as the document (Korean if Korean).
Return ONLY raw valid JSON. No markdown, no code blocks, no explanation.`;
  const truncated = text.length > 50000 ? text.slice(0, 50000) + "\n...[truncated]" : text;
  const response = await aiInvoke(userId, {
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `Please analyze this document titled "${docTitle}".\n\nDocument content:\n${truncated}\n\nReturn the hierarchical structure as JSON.` },
    ],
  });
  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) throw new Error("AI 분석 결과를 받지 못했습니다. (빈 응답)");
  let parsed: DocumentStructure;
  if (typeof rawContent === "object") {
    parsed = rawContent as unknown as DocumentStructure;
  } else {
    let stripped = (rawContent as string).trim();
    stripped = stripped.replace(/^```(?:json)?[\s\S]*?\n/, "").replace(/\n```[\s\S]*$/, "").trim();
    if (stripped.startsWith('```')) stripped = stripped.replace(/^```[^\n]*/, '').trim();
    if (stripped.endsWith('```')) stripped = stripped.replace(/```$/, '').trim();
    const jsonStart = stripped.indexOf('{');
    if (jsonStart > 0) stripped = stripped.slice(jsonStart);
    const jsonEnd = stripped.lastIndexOf('}');
    if (jsonEnd !== -1 && jsonEnd < stripped.length - 1) stripped = stripped.slice(0, jsonEnd + 1);
    try {
      parsed = JSON.parse(stripped) as DocumentStructure;
    } catch {
      // 잘린 JSON 복구 시도
      const lastBrace = stripped.lastIndexOf('}');
      if (lastBrace > 0) {
        try { parsed = JSON.parse(stripped.slice(0, lastBrace + 1)) as DocumentStructure; }
        catch { throw new Error(`AI 분석 결과를 파싱하지 못했습니다: ${(rawContent as string).slice(0, 200)}`); }
      } else {
        throw new Error(`AI 분석 결과를 파싱하지 못했습니다: ${(rawContent as string).slice(0, 200)}`);
      }
    }
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
  // 언어 감지
  let detectedLanguage = "ko";
  try {
    const sampleText = parsed.chapters?.[0]?.title || parsed.title || docTitle || "";
    const langResp = await aiInvoke(userId, {
      messages: [
        { role: "system", content: "Detect the language of the given text and return ONLY the ISO 639-1 language code (e.g. en, ko, ja, zh, fr, de, es, pt, ar). Return nothing else." },
        { role: "user", content: sampleText },
      ],
    });
    const raw = langResp.choices[0]?.message?.content;
    const code = (typeof raw === "string" ? raw.trim().toLowerCase() : "").slice(0, 5);
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(code)) detectedLanguage = code.slice(0, 2);
  } catch (_) { /* 감지 실패 시 ko 폴백 */ }
  return { ...parsed, detectedLanguage };
}

/**
 * 첫 번째 질문 생성 — 문서를 직접 참조하지 않고 토픽 제목/설명만으로 질문 생성
 * 학습자가 문서를 읽지 않고 순수 문답으로 학습할 수 있도록 함
 */
// 언어 코드 → 이름 맵
const LANGUAGE_NAMES: Record<string, string> = {
  ko: "Korean", en: "English", ja: "Japanese", zh: "Chinese",
  fr: "French", de: "German", es: "Spanish", pt: "Portuguese",
  ar: "Arabic", ru: "Russian", it: "Italian", nl: "Dutch",
};

/**
 * Open QLoop: 인터넷 검색으로 토픽 관련 최신 컨텍스트 수집
 */
async function fetchWebContext(topicTitle: string, docTitle: string): Promise<string> {
  const snippets: string[] = [];
  // 1단계: DuckDuckGo Instant Answer API (단순 키워드)
  try {
    const ddgQuery = encodeURIComponent(topicTitle);
    const ddgRes = await fetch(
      `https://api.duckduckgo.com/?q=${ddgQuery}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
      { headers: { "User-Agent": "QLoop-Educational-Bot/1.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      if (ddgData.AbstractText) snippets.push(`[Overview] ${ddgData.AbstractText}`);
      if (ddgData.RelatedTopics) {
        for (const t of (ddgData.RelatedTopics as Array<{Text?: string}>).slice(0, 3)) {
          if (t.Text) snippets.push(`[Related] ${t.Text}`);
        }
      }
    }
  } catch { /* ignore */ }

  // 2단계: Wikipedia OpenSearch → REST summary (DuckDuckGo 결과 부족 시)
  if (snippets.length === 0) {
    try {
      const wikiSearch = encodeURIComponent(topicTitle);
      const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${wikiSearch}&limit=3&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json() as [string, string[], string[], string[]];
        const titles = searchData[1] ?? [];
        for (const title of titles.slice(0, 2)) {
          try {
            const summaryRes = await fetch(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (summaryRes.ok) {
              const summaryData = await summaryRes.json() as { extract?: string; title?: string };
              if (summaryData.extract) {
                snippets.push(`[Wikipedia: ${summaryData.title ?? title}] ${summaryData.extract.slice(0, 800)}`);
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  // 3단계: 한국어 Wikipedia 시도 (여전히 결과 없을 때)
  if (snippets.length === 0) {
    try {
      const koQuery = encodeURIComponent(topicTitle);
      const koSearchRes = await fetch(
        `https://ko.wikipedia.org/w/api.php?action=opensearch&search=${koQuery}&limit=2&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (koSearchRes.ok) {
        const koData = await koSearchRes.json() as [string, string[], string[], string[]];
        const koTitles = koData[1] ?? [];
        for (const title of koTitles.slice(0, 1)) {
          try {
            const koSummaryRes = await fetch(
              `https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (koSummaryRes.ok) {
              const koSummary = await koSummaryRes.json() as { extract?: string; title?: string };
              if (koSummary.extract) {
                snippets.push(`[위키백과: ${koSummary.title ?? title}] ${koSummary.extract.slice(0, 800)}`);
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  return snippets.filter(Boolean).join("\n\n").slice(0, 4000);
}

async function generateFirstQuestion(
  topicTitle: string,
  topicDescription: string,
  docTitle: string,
  openQloopMode = false,
  learningLanguage = "ko",
  libraryContext = "",
  userId: number | null = null
): Promise<string> {
  let webContext = "";
  if (openQloopMode) {
    webContext = await fetchWebContext(topicTitle, docTitle);
  }
  const openQloopInstruction = openQloopMode
    ? `\nOPEN QLOOP MODE: You have access to real-time internet search results about this topic. Use the following web context to enrich your questions with current events, recent research, and real-world applications. Draw connections beyond the document.${webContext ? `\n\nWEB SEARCH CONTEXT:\n${webContext}` : ""}`
    : "";
  const libraryContextInstruction = libraryContext
    ? `\n\nADDITIONAL KNOWLEDGE LIBRARY CONTEXT (use to enrich questions and feedback, but do NOT ask the learner to read these materials):\n${libraryContext.slice(0, 8000)}`
    : "";
  const langName = LANGUAGE_NAMES[learningLanguage] || "Korean";
  const languageInstruction = `\nIMPORTANT: The document may be written in a foreign language, but you MUST ask your question in ${langName}. The learner will also answer in ${langName}. Do NOT use the source document's language if it differs from ${langName}.`;
  const response = await aiInvoke(userId, {
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
- Use the same language as the topic title (Korean if Korean).${openQloopInstruction}${languageInstruction}${libraryContextInstruction}
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
  userId?: number | null;
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
    const response = await aiInvoke(opts.userId ?? null, {
      messages: [
        { role: "system" as const, content: "You are a Socratic evaluation engine. Always respond with valid JSON only." },
        { role: "user" as const, content: prompt },
      ] as Message[],
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

// 질문 유형 3단계 난이도 매핑
// 초반 (1~8번): 기초 이해 확인
const QUESTION_TYPES_EASY = ["definition", "clarification"];
// 중반 (9~16번): 논리적 사고 요구
const QUESTION_TYPES_MEDIUM = ["justification", "assumption", "implication", "perspective", "value", "application"];
// 후반 (17번~): 고차원 사고
const QUESTION_TYPES_HARD = ["counterexample", "consistency", "synthesis", "reflection"];

function getDifficultyTier(answeredCount: number): { tier: string; allowedTypes: string[]; instruction: string } {
  if (answeredCount < 8) {
    return {
      tier: "easy",
      allowedTypes: QUESTION_TYPES_EASY,
      instruction: `DIFFICULTY TIER: EASY (questions 1-8). Use ONLY these types: ${QUESTION_TYPES_EASY.join(", ")}. Focus on basic comprehension and clarification.`,
    };
  } else if (answeredCount < 16) {
    return {
      tier: "medium",
      allowedTypes: QUESTION_TYPES_MEDIUM,
      instruction: `DIFFICULTY TIER: MEDIUM (questions 9-16). Use ONLY these types: ${QUESTION_TYPES_MEDIUM.join(", ")}. Push for reasoning, evidence, and application.`,
    };
  } else {
    return {
      tier: "hard",
      allowedTypes: QUESTION_TYPES_HARD,
      instruction: `DIFFICULTY TIER: HARD (questions 17+). Use ONLY these types: ${QUESTION_TYPES_HARD.join(", ")}. Challenge with synthesis, counterexamples, and deep reflection.`,
    };
  }
}

async function generateNextMessage(
  docTitle: string,
  topicTitle: string,
  conversationHistory: Array<{ role: string; content: string; messageType: string }>,
  userMessage: string,
  isUserQuestion: boolean,
  openQloopMode = false,
  answeredQuestions = 0,
  learningLanguage = "ko",
  libraryContext = "",
  userId: number | null = null
): Promise<{ content: string; messageType: string; isTopicComplete: boolean; questionType?: string }> {
  // Open QLoop: 대화 초반(1~3번째 답변)에만 웹 검색 수행 (비용 절감)
  let webContextForNext = "";
  if (openQloopMode && answeredQuestions <= 3) {
    webContextForNext = await fetchWebContext(topicTitle, docTitle);
  }
  const openQloopInstruction = openQloopMode
    ? `\nOPEN QLOOP MODE: You have access to real-time internet search results about this topic. Use the following web context to enrich your questions and feedback with current events, recent research, and real-world applications.${webContextForNext ? `\n\nWEB SEARCH CONTEXT:\n${webContextForNext}` : ""}`
    : "";
  const libraryContextInstruction = libraryContext
    ? `\n\nADDITIONAL KNOWLEDGE LIBRARY CONTEXT (use to enrich questions and feedback, but do NOT ask the learner to read these materials):\n${libraryContext.slice(0, 8000)}`
    : "";
  const historyText = conversationHistory
    .map((m) => `[${m.role === "ai" ? "AI 튜터" : "학습자"}]: ${m.content}`)
    .join("\n");

  // 최근 사용된 질문 유형 추출 (반복 방지용) - messageType 필드에 questionType이 저장된 경우 활용
  const recentQuestionTypes: string[] = [];
  for (const m of [...conversationHistory].reverse()) {
    if (m.role === "ai" && m.messageType === "question" && recentQuestionTypes.length < 3) {
      // messageType 필드에 questionType이 포함된 경우 (형식: "question:definition")
      const qtMatch = m.messageType.match(/^question:(.+)$/);
      if (qtMatch) {
        recentQuestionTypes.push(qtMatch[1]);
      }
    }
  }
  const recentTypesInstruction = recentQuestionTypes.length > 0
    ? `\nRECENTLY USED question types (DO NOT repeat these in next 2 turns): ${recentQuestionTypes.join(", ")}. You MUST choose a DIFFERENT type.`
    : "";

  // 진행도 기반 난이도 단계 결정
  const difficultyTier = getDifficultyTier(answeredQuestions);

  // 학습자 답변 품질 평가: 오답/어려움 감지 시 한 단계 낮춰
  // 답변이 매우 짧거나(어려움 신호) 또는 일반적으로 잘 모르갪다는 표현이 있으면 쉬운 유형으로 하향
  const isStruggling = !isUserQuestion && (
    userMessage.trim().length < 20 ||
    /모르|\uc798 모르|어렵다|이해가 안|몰라|뭐지|잘 모르겠|어렵습니다|이해가 안 됨|잘 모르겠습니다/.test(userMessage)
  );
  const effectiveTier = isStruggling && difficultyTier.tier !== "easy"
    ? getDifficultyTier(Math.max(0, answeredQuestions - 8)) // 한 단계 하향
    : difficultyTier;

  const langName2 = LANGUAGE_NAMES[learningLanguage] || "Korean";
  const langInstruction2 = learningLanguage !== "ko"
    ? `\nIMPORTANT: The source document may be in a foreign language. You MUST write ALL feedback and questions in ${langName2}. The learner will respond in ${langName2}.`
    : `\nIMPORTANT: Always write ALL feedback and questions in Korean (한국어). The learner will respond in Korean.`;
  const baseRules = `CRITICAL RULES:
- Do NOT ask the learner to read, look at, or refer to any document, book, or material.
- Do NOT say things like "according to the document", "as described in the text", "what does the document say about...".
- All questions and feedback must be based on the learner's own thinking and understanding.
- Use the same language as the conversation (Korean if Korean).${langInstruction2}`;

  if (isUserQuestion) {
    const response = await aiInvoke(userId, {
      messages: [
        {
          role: "system" as const,
          content: `You are an expert educational tutor. The learner has asked you a question.
Answer their question clearly and thoroughly based on your knowledge of the topic.
After answering, naturally transition back to the learning session with a follow-up question.
${baseRules}${openQloopInstruction}${libraryContextInstruction}`,
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
    const response = await aiInvoke(userId, {
      messages: [
        {
          role: "system" as const,
          content: `You are an expert educational tutor using the Socratic method.
The learner has answered your question. Follow these strict rules:

1. FEEDBACK: Keep it SHORT — maximum 1 sentence. Do NOT repeat or paraphrase what the learner said. Do NOT start with confirmation phrases like "네,", "맞습니다", "좋습니다", "그렇군요", "말씀하신 것처럼", "Yes,", "That's right", "Good point". Instead, briefly note whether the answer is on track or needs refinement — then move directly to the next question.

2. NEXT QUESTION: Choose ONE question type from the ALLOWED LIST for the current difficulty tier.
   ${effectiveTier.instruction}
   All available types for reference:
   - definition: Ask learner to define or explain a key term in their own words — mention the specific keyword to define
   - clarification: Ask learner to clarify a specific claim or phrase they used
   - justification: Ask learner to provide evidence or reasoning for a specific claim
   - assumption: Ask learner to identify a specific underlying assumption
   - counterexample: Ask learner to think of a counterexample to a specific claim
   - consistency: Ask learner to check consistency between two specific ideas
   - perspective: Ask learner to consider a specific alternative viewpoint
   - implication: Ask learner about the consequence of a specific idea or decision
   - value: Ask learner about the importance of a specific concept in context
   - synthesis: Ask learner to connect two specific concepts or ideas
   - application: Ask learner to apply a specific concept to a concrete real-world scenario
   - reflection: Ask learner to reflect on a specific aspect of their understanding
   IMPORTANT: Questions MUST be concrete and specific — mention key terms, concepts, or scenarios from the topic. Do NOT ask vague generic questions. Do NOT give hints or guidance.${recentTypesInstruction}

3. COMPLETION: The session has a MINIMUM of 24 questions. Do NOT set isTopicComplete=true unless at least 24 questions have been asked (current count: ${answeredQuestions}). Only complete after 24+ exchanges AND the topic is thoroughly covered.
${baseRules}${openQloopInstruction}${libraryContextInstruction}
Return a JSON with:
{
  "feedback": "1 sentence feedback only — no confirmation openers",
  "nextQuestion": "specific, concrete question mentioning key terms/concepts OR null if topic is complete",
  "questionType": "MUST be one of the ALLOWED types for current tier: ${effectiveTier.allowedTypes.join("|")}",
  "topicSummary": "summary if topic is complete OR null",
  "isTopicComplete": boolean
}`,
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
              questionType: { type: ["string", "null"] },
              topicSummary: { type: ["string", "null"] },
              isTopicComplete: { type: "boolean" },
            },
            required: ["feedback", "nextQuestion", "questionType", "topicSummary", "isTopicComplete"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawResp = response.choices[0]?.message?.content;
    const parsed = JSON.parse((typeof rawResp === "string" ? rawResp : null) || "{}");
    // 서버에서 24문항 미만 시 isTopicComplete 강제 false 처리
    const MIN_QUESTIONS = 24;
    const forceNotComplete = answeredQuestions < MIN_QUESTIONS;
    const isComplete = !forceNotComplete && (parsed.isTopicComplete || false);

    const content = isComplete
      ? `${parsed.feedback}\n\n**토픽 완료!** ${parsed.topicSummary}`
      : `${parsed.feedback}\n\n${parsed.nextQuestion}`;

    return {
      content,
      messageType: isComplete ? "feedback" : "question",
      isTopicComplete: isComplete,
      questionType: parsed.questionType ?? undefined,
    };
  }
}

async function generateSessionSummary(
  docTitle: string,
  topicTitle: string,
  messages: Array<{ role: string; content: string }>,
  userId: number | null = null
): Promise<string> {
  const historyText = messages.map((m) => `[${m.role === "ai" ? "AI" : "학습자"}]: ${m.content}`).join("\n");
  const response = await aiInvoke(userId, {
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
  aiConnection: aiConnectionRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    register: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
        name: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (existing.length > 0) throw new Error("이미 사용 중인 이메일입니다");
        const openId = nanoid();
        const passwordHash = await hashPassword(input.password);
        const userCount = await db.select().from(users);
        const isFirstUser = userCount.length === 0;
        const role = isFirstUser ? "superadmin" : "user";
        await db.insert(users).values({ openId, email: input.email, name: input.name, passwordHash, role, loginMethod: "email", lastSignedIn: new Date() });
        const sessionToken = await sdk.createSessionToken(openId, { name: input.name, expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (!user || !user.passwordHash) throw new Error("이메일 또는 비밀번호가 올바르지 않습니다");
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) throw new Error("이메일 또는 비밀번호가 올바르지 않습니다");
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // ── 사용자 관리 (superadmin 전용) ──────────────────────────────────────────
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "superadmin") throw new Error("권한이 없습니다");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { users } = await import("../drizzle/schema");
      return db.select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        loginMethod: users.loginMethod,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users).orderBy(users.createdAt);
    }),

    updateUserRole: protectedProcedure
      .input(z.object({
        openId: z.string(),
        role: z.enum(["user", "admin", "instructor", "superadmin"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "superadmin") throw new Error("권한이 없습니다");
        if (input.openId === ctx.user.openId) throw new Error("자기 자신의 역할은 변경할 수 없습니다");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(users).set({ role: input.role }).where(eq(users.openId, input.openId));
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
          // 모든 문서의 텍스트 추출 (PDF 포함 모두 텍스트로 처리)
          const docTextEntries: { title: string; text: string }[] = [];
          for (const doc of docs) {
            const actualKey = doc.storageUrl.replace(/^\/r2-storage\//, "").replace(/^\/manus-storage\//, "");
            const signedUrl = await storageGetSignedUrl(actualKey);
            const mimeType = doc.fileType === "pdf" ? "application/pdf"
              : doc.fileType === "doc" ? "application/msword"
              : doc.fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : doc.fileType === "ppt" ? "application/vnd.ms-powerpoint"
              : doc.fileType === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
              : "application/pdf";

            let text: string | null = null;
            if (mimeType === "application/pdf") {
              text = await extractTextFromPdf(signedUrl);
            } else {
              text = await extractTextFromOfficeFile(signedUrl, mimeType);
            }
            if (text && text.trim().length > 50) {
              const truncated = text.length > 30000 ? text.slice(0, 30000) + "\n...[truncated]" : text;
              docTextEntries.push({ title: doc.title, text: `[문서: ${doc.title}]\n${truncated}` });
            }
          }

          if (docTextEntries.length === 0) throw new Error("분석할 수 있는 문서 내용이 없습니다. 텍스트가 포함된 PDF 또는 문서를 업로드해주세요.");

          const combinedText = docTextEntries.map(e => e.text).join("\n\n" + "=".repeat(50) + "\n\n");
          const maxLen = 60000;
          const truncatedCombined = combinedText.length > maxLen ? combinedText.slice(0, maxLen) + "\n...[truncated]" : combinedText;

          const groupSystemPrompt = `You are an expert educational content synthesizer.
You are given ${docs.length} document(s) that belong to a learning group titled "${group.name}".
Your task is to analyze ALL the documents TOGETHER and create a UNIFIED, COHERENT educational structure.
Do NOT simply list each document separately. Instead, SYNTHESIZE the content across all documents to create:
1. A unified chapter/topic tree that integrates concepts from all documents
2. A unified concept map showing how concepts across all documents relate to each other
3. A unified learning path that guides learners through all the material in the optimal order
The result should feel like a single integrated curriculum, not a collection of separate documents.
Return ONLY valid JSON matching the schema exactly.`;

          const analysisContent = `Analyze these ${docTextEntries.length} document(s) together as a unified learning group titled "${group.name}". Create a single integrated educational structure that synthesizes content from all documents.\n\n${truncatedCombined}`;

          const response = await aiInvoke(ctx.user.id, {
            messages: [
              { role: "system", content: groupSystemPrompt },
              { role: "user" as const, content: analysisContent },
            ] satisfies Message[],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "group_structure",
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
                          concept: { type: "string" },
                          relatedConcepts: { type: "array", items: { type: "string" } },
                        },
                        required: ["id", "concept", "relatedConcepts"],
                        additionalProperties: false,
                      },
                    },
                    learningPath: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          step: { type: "integer" },
                          title: { type: "string" },
                          description: { type: "string" },
                          topics: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "string" },
                                title: { type: "string" },
                              },
                              required: ["id", "title"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["step", "title", "description", "topics"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["title", "summary", "documentType", "chapters", "conceptMap", "learningPath"],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = response.choices[0]?.message?.content;
          if (!rawContent) throw new Error("AI 통합 분석 결과를 받지 못했습니다.");

          let unifiedStructure: DocumentStructure;
          try {
            // Forge API가 객체로 반환하거나 마크다운 코드블록으로 반환할 수 있음
            const parsed = typeof rawContent === "object"
              ? rawContent as any
              : JSON.parse((rawContent as string).replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()) as any;
            unifiedStructure = {
              title: parsed.title || group.name,
              summary: parsed.summary || "",
              documentType: parsed.documentType || "other",
              chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
              conceptMap: Array.isArray(parsed.conceptMap) ? parsed.conceptMap : [],
              learningPath: Array.isArray(parsed.learningPath) ? parsed.learningPath : [],
              keyConceptCards: [],
              timeline: [],
              comparisonTables: [],
            };
          } catch {
            throw new Error("AI 통합 분석 결과를 파싱하지 못했습니다. 다시 시도해 주세요.");
          }

          await updateDocumentGroup(input.groupId, { analysisStatus: "done", structure: unifiedStructure });
          return { success: true, structure: unifiedStructure };
        } catch (e) {
          await updateDocumentGroup(input.groupId, { analysisStatus: "error" });
          throw e;
        }
      }),
     // 통합 분석 구조 선택 확정 (고정)
    setGroupStructure: protectedProcedure
      .input(z.object({ groupId: z.number(), structure: z.enum(["tree", "conceptMap", "learningPath"]) }))
      .mutation(async ({ ctx, input }) => {
        const group = await getDocumentGroupById(input.groupId);
        if (!group || group.userId !== ctx.user.id) throw new Error("그룹을 찾을 수 없습니다.");
        await updateDocumentGroup(input.groupId, { selectedStructure: input.structure, structureLocked: 1 });
        return { success: true };
      }),
    // 구조 고정 해제 (structureLocked=0, selectedStructure=null)
    unlockGroupStructure: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const group = await getDocumentGroupById(input.groupId);
        if (!group || group.userId !== ctx.user.id) throw new Error("그룹을 찾을 수 없습니다.");
        await updateDocumentGroup(input.groupId, { structureLocked: 0, selectedStructure: null });
        return { success: true };
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

    // 텍스트 직접 입력으로 문서 생성
    uploadText: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1, "제목을 입력해주세요."),
          text: z.string().min(10, "내용을 10자 이상 입력해주세요."),
          groupId: z.number().optional(),
          learningLanguage: z.string().default("ko"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 텍스트를 S3에 저장하여 재분석 시에도 사용 가능하도록
        const textKey = `text-documents/${ctx.user.id}/${Date.now()}.txt`;
        const { url: textUrl } = await storagePut(textKey, Buffer.from(input.text, "utf8"), "text/plain; charset=utf-8");
        const docId = await createDocument({
          userId: ctx.user.id,
          groupId: input.groupId ?? null,
          title: input.title,
          fileType: "text",
          storageKey: textKey,
          storageUrl: textUrl,
          fileSize: Buffer.byteLength(input.text, "utf8"),
          analysisStatus: "pending",
          analysisStep: "uploading",
          learningLanguage: input.learningLanguage,
        });
        return { documentId: docId, storageUrl: textUrl };
      }),

    // 텍스트 문서 AI 분석
    analyzeText: protectedProcedure
      .input(z.object({ documentId: z.number(), text: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        await updateDocumentAnalysis(input.documentId, "analyzing", undefined, undefined, "structuring");
        try {
          // 텍스트를 직접 analyzeDocumentStructure에 전달
          const truncated = input.text.length > 50000 ? input.text.slice(0, 50000) + "\n...[truncated]" : input.text;
          const systemPrompt = `You are an expert educational content analyzer.
Analyze the provided document comprehensively and extract its structure in MULTIPLE formats simultaneously.
Return a single JSON object containing ALL of the following fields:

1. title (string): Document title
2. summary (string): Brief summary
3. documentType (string): One of: textbook, research, manual, report, narrative, reference, other
4. chapters (array): Hierarchical chapter/topic/subtopic tree. Each chapter: {id, title, order, topics[]}. Each topic: {id, title, description, order, subtopics[]}. Each subtopic: {id, title, description, order}.
5. conceptMap (array, max 15): Key concept nodes. Each: {id, label, description, type (core/sub/related), connections (array of other node ids)}
6. keyConceptCards (array, max 20): Important terms. Each: {id, term, definition, example, relatedTerms[], importance (high/medium/low)}
7. timeline (array): Chronological events IF applicable, else []. Each: {id, period, title, description, significance}
8. comparisonTables (array): Comparison tables IF applicable, else []. Each: {title, headers[], rows[]}. Each row: {id, subject, values[] (values in same order as headers)}
9. learningPath (array, 3-6 steps): Recommended learning steps. Each: {id, order, title, description, topicIds[], estimatedMinutes}

Be thorough. Use the same language as the document (Korean if Korean).
Return ONLY raw valid JSON. No markdown, no code blocks, no explanation.`;
          const response = await aiInvoke(ctx.user.id, {
            messages: [
              { role: "system" as const, content: systemPrompt },
              { role: "user" as const, content: `Please analyze this document titled "${doc.title}".\n\nDocument content:\n${truncated}\n\nReturn the hierarchical structure as JSON.` },
            ],
          });
          const rawContent = response.choices[0]?.message?.content;
          if (!rawContent) throw new Error("AI 분석 결과를 받지 못했습니다. (빈 응답)");
          let parsed: Record<string, unknown>;
          if (typeof rawContent === "object") {
            parsed = rawContent as Record<string, unknown>;
          } else {
            let stripped = (rawContent as string).trim();
            stripped = stripped.replace(/^```(?:json)?[\s\S]*?\n/, "").replace(/\n```[\s\S]*$/, "").trim();
            if (stripped.startsWith('```')) stripped = stripped.replace(/^```[^\n]*/, '').trim();
            if (stripped.endsWith('```')) stripped = stripped.replace(/```$/, '').trim();
            const jsonStart = stripped.indexOf('{');
            if (jsonStart > 0) stripped = stripped.slice(jsonStart);
            const jsonEnd = stripped.lastIndexOf('}');
            if (jsonEnd !== -1 && jsonEnd < stripped.length - 1) stripped = stripped.slice(0, jsonEnd + 1);
            try { parsed = JSON.parse(stripped); } catch {
              throw new Error(`AI 분석 결과를 파싱하지 못했습니다: ${(rawContent as string).slice(0, 200)}`);
            }
          }
          if (!parsed.title) parsed.title = doc.title;
          if (!parsed.summary) parsed.summary = "";
          if (!Array.isArray(parsed.chapters)) parsed.chapters = [];
          if (!Array.isArray(parsed.conceptMap)) parsed.conceptMap = [];
          if (!Array.isArray(parsed.keyConceptCards)) parsed.keyConceptCards = [];
          if (!Array.isArray(parsed.timeline)) parsed.timeline = [];
          if (!Array.isArray(parsed.comparisonTables)) parsed.comparisonTables = [];
          if (!Array.isArray(parsed.learningPath)) parsed.learningPath = [];
          if (!parsed.documentType) parsed.documentType = "other";
          await updateDocumentAnalysis(input.documentId, "done", parsed, undefined, "done");
          return { success: true, structure: parsed };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await updateDocumentAnalysis(input.documentId, "error", undefined, undefined, "error", errMsg);
          throw e;
        }
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
          // 텍스트 타입 문서: S3에서 텍스트 읽어서 분석
          if (doc.fileType === "text") {
            const signedUrl = await storageGetSignedUrl(doc.storageKey);
            const res = await fetch(signedUrl);
            if (!res.ok) throw new Error("텍스트 파일을 불러올 수 없습니다.");
            const text = await res.text();
            await updateDocumentAnalysis(input.documentId, "analyzing", undefined, undefined, "structuring");
            const structureResult = await analyzeTextContent(text, doc.title, ctx.user.id);
            const { detectedLanguage, ...structure } = structureResult;
            if (detectedLanguage) {
              const db2 = await getDb();
              if (db2) await db2.update(documents).set({ sourceLanguage: detectedLanguage }).where(eq(documents.id, input.documentId));
            }
            await updateDocumentAnalysis(input.documentId, "done", structure, undefined, "done");
            return { success: true, structure, detectedLanguage };
          }
          const actualKey = doc.storageUrl.replace(/^\/r2-storage\//, "").replace(/^\/manus-storage\//, "");
          console.log("[ANALYZE] storageUrl:", doc.storageUrl, "=> actualKey:", actualKey);
          const signedUrl = await storageGetSignedUrl(actualKey);
          console.log("[ANALYZE] signedUrl:", signedUrl.slice(0, 100));
          const mimeForAnalysis = doc.fileType === "pdf" ? "application/pdf" : doc.fileType === "doc" ? "application/msword" : doc.fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : doc.fileType === "ppt" ? "application/vnd.ms-powerpoint" : doc.fileType === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/pdf";
          // 단계 2: structuring (AI 구조 분석 중)
          await updateDocumentAnalysis(input.documentId, "analyzing", undefined, undefined, "structuring");
          const structureResult = await analyzeDocumentStructure(signedUrl, doc.title, mimeForAnalysis, ctx.user.id);
          const { detectedLanguage, ...structure } = structureResult;
          // 원문 언어 저장
          if (detectedLanguage) {
            const db2 = await getDb();
            if (db2) {
              await db2.update(documents).set({ sourceLanguage: detectedLanguage }).where(eq(documents.id, input.documentId));
            }
          }
          await updateDocumentAnalysis(input.documentId, "done", structure, undefined, "done");
          return { success: true, structure, detectedLanguage };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await updateDocumentAnalysis(input.documentId, "error", undefined, undefined, "error", errMsg);
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
        // 그룹 소속 문서인 경우 그룹 구조 완전 초기화 (자료 변경 시 기존 통합 분석 결과가 일관성 없어짐)
        if (doc.groupId) {
          await updateDocumentGroup(doc.groupId, {
            selectedStructure: null,
            structureLocked: 0,
            structure: null,
            analysisStatus: "pending",
          });
        }
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
    // 학습 언어 설정 (B방식: 원문 유지 + 지정 언어로 문답)
    setLearningLanguage: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        learningLanguage: z.string().min(2).max(5), // ISO 639-1 코드
      }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        await db.update(documents).set({ learningLanguage: input.learningLanguage }).where(eq(documents.id, input.documentId));
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
          // 텍스트 타입 문서: S3에서 텍스트 읽어서 분석
          if (doc.fileType === "text") {
            const signedUrl = await storageGetSignedUrl(doc.storageKey);
            const res = await fetch(signedUrl);
            if (!res.ok) throw new Error("텍스트 파일을 불러올 수 없습니다.");
            const text = await res.text();
            await updateDocumentAnalysis(input.documentId, "analyzing", undefined, undefined, "structuring");
            const structureResult = await analyzeTextContent(text, doc.title, ctx.user.id);
            const { detectedLanguage, ...structure } = structureResult;
            if (detectedLanguage) {
              const db3 = await getDb();
              if (db3) await db3.update(documents).set({ sourceLanguage: detectedLanguage }).where(eq(documents.id, input.documentId));
            }
            await updateDocumentAnalysis(input.documentId, "done", structure, undefined, "done");
            return { success: true, structure, detectedLanguage };
          }
          const actualKey = doc.storageUrl.replace(/^\/r2-storage\//, "").replace(/^\/manus-storage\//, "");
          const signedUrl = await storageGetSignedUrl(actualKey);
          const mimeForAnalysis = doc.fileType === "pdf" ? "application/pdf" : doc.fileType === "doc" ? "application/msword" : doc.fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : doc.fileType === "ppt" ? "application/vnd.ms-powerpoint" : doc.fileType === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/pdf";
          await updateDocumentAnalysis(input.documentId, "analyzing", undefined, undefined, "structuring");
          const structureResult = await analyzeDocumentStructure(signedUrl, doc.title, mimeForAnalysis, ctx.user.id);
          const { detectedLanguage, ...structure } = structureResult;
          // 원문 언어 저장
          if (detectedLanguage) {
            const db2 = await getDb();
            if (db2) {
              await db2.update(documents).set({ sourceLanguage: detectedLanguage }).where(eq(documents.id, input.documentId));
            }
          }
          await updateDocumentAnalysis(input.documentId, "done", structure, undefined, "done");
          return { success: true, structure, detectedLanguage };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await updateDocumentAnalysis(input.documentId, "error", undefined, undefined, "error", errMsg);
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
          qloopModel: z.enum(["core", "curated", "open"]).default("core"),
        })
      )
      .mutation(async ({ ctx, input }) => {
         const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new Error("문서를 찾을 수 없습니다.");
        // QLoop 모델 분기: core=0, curated=2, open=1
        const openQloopModeVal = input.qloopModel === "open" ? 1 : input.qloopModel === "curated" ? 2 : 0;
        const openQloopMode = openQloopModeVal === 1; // 인터넷 검색 여부 (Open QLoop)
        // Curated / Open: Library 자동 로드
        let libraryContext = "";
        if (input.qloopModel === "curated" || input.qloopModel === "open") {
          try {
            const db = await getDb();
            if (db) {
              const { knowledgeLibrary } = await import("../drizzle/schema");
              const libItems = await db
                .select({ id: knowledgeLibrary.id, title: knowledgeLibrary.title, extractedText: knowledgeLibrary.extractedText })
                .from(knowledgeLibrary)
                .where(eq(knowledgeLibrary.addedBy, ctx.user.id));
              if (libItems.length > 0) {
                libraryContext = libItems
                  .map(item => `[Knowledge Library: ${item.title}]\n${item.extractedText ?? ""}`.trim())
                  .filter(Boolean)
                  .join("\n\n---\n\n");
              }
            }
          } catch (e) {
            console.warn("[Library Context] 컨텍스트 조회 실패:", e);
          }
        }

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
          openQloopMode: openQloopModeVal,
          evaluationEnabled: input.evaluationEnabled ? 1 : 0,
          evaluationPolicyId: input.evaluationPolicyId ?? null,
          selectedStructure: input.selectedStructure ?? null,
          libraryContextIds: null, // qloopModel로 대체 (Curated/Open은 런타임에 자동 로드)
        });
        // 첫 번째 질문 생성 — 문서 직접 참조 없이 토픽 정보만 사용
        const learningLang = (doc as any).learningLanguage || "ko";
        const firstQuestion = await generateFirstQuestion(
          input.topicTitle,
          input.topicDescription,
          doc.title,
          openQloopMode, // open=true
          learningLang,
          libraryContext,
          ctx.user.id
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
        // questionTypeName을 messageType에 포함하여 generateNextMessage에서 이전 질문 유형 추적 가능
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
          // AI 질문 메시지에 questionTypeName이 있으면 "question:TYPE" 형식으로 저장
          messageType: (m.role === "ai" && m.messageType === "question" && (m as any).questionTypeName)
            ? `question:${(m as any).questionTypeName}`
            : m.messageType,
        }));

        // AI 응답 생성 — 문서 직접 참조 없이 순수 문답
        const sessionOpenQloopVal = (session as any).openQloopMode as number ?? 0;
        const sessionOpenQloop = sessionOpenQloopVal === 1; // Open: 인터넷 검색
        const sessionIsCurated = sessionOpenQloopVal >= 1; // Curated(2) or Open(1): Library 참조
        // 다음 질문 생성 시 현재 답변을 반영한 누적 답변 수 기준으로 난이도 계산
        const currentAnsweredForTier = (session.answeredQuestions || 0) + (input.isUserQuestion ? 0 : 1);
        const docLearningLang = (doc as any).learningLanguage || "ko";
        // Curated / Open: 세션 openQloopMode 기반으로 Library 자동 로드
        let libraryContext = "";
        if (sessionIsCurated) {
          try {
            const db = await getDb();
            if (db) {
              const { knowledgeLibrary } = await import("../drizzle/schema");
              const libItems = await db
                .select({ id: knowledgeLibrary.id, title: knowledgeLibrary.title, extractedText: knowledgeLibrary.extractedText })
                .from(knowledgeLibrary)
                .where(eq(knowledgeLibrary.addedBy, ctx.user.id));
              if (libItems.length > 0) {
                libraryContext = libItems
                  .map(item => `[Knowledge Library: ${item.title}]\n${item.extractedText ?? ""}`.trim())
                  .filter(Boolean)
                  .join("\n\n---\n\n");
              }
            }
          } catch (e) {
            console.warn("[Library Context] 컨텍스트 조회 실패:", e);
          }
        }

        const aiResponse = await generateNextMessage(
          doc.title,
          session.startTopicTitle || "",
          history,
          input.content,
          input.isUserQuestion,
          sessionOpenQloop,
          currentAnsweredForTier,
          docLearningLang,
          libraryContext,
          ctx.user.id
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
                    userId: ctx.user.id,
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
                // 질문유형 조회: AI 응답의 questionType 우선 사용, 없으면 이전 질문 유형, 최후 폴백은 definition
                let qtId: number | undefined;
                const resolvedTypeName = aiResponse.questionType || questionTypeName;
                if (resolvedTypeName) {
                  // AI 응답 questionType을 DB questionTypes 이름으로 매핑
                  // AI가 반환하는 questionType은 DB의 name과 직접 일치함 (12종)
                  const dbTypeName = resolvedTypeName;
                  const [qt] = await db.select().from(questionTypes).where(eq(questionTypes.name, dbTypeName)).limit(1);
                  qtId = qt?.id;
                }
                if (!qtId) {
                  // 최후 폴백: definition
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
        // AI 질문 메시지 저장 시 questionType을 questionTypeName에 포함 (이전 유형 추적용)
        const resolvedQuestionTypeName = aiResponse.questionType || questionTypeName;
        await createSessionMessage({
          sessionId: input.sessionId,
          role: "ai",
          messageType: aiResponse.messageType as "question" | "answer" | "feedback" | "user_question" | "ai_answer" | "system",
          content: aiResponse.content,
          topicId: session.currentTopicId ?? undefined,
          topicTitle: session.startTopicTitle ?? undefined,
          questionIndex: aiResponse.isTopicComplete ? undefined : msgCount + 1,
          questionTypeName: resolvedQuestionTypeName,
          socraticQuestionId: newSocraticQuestionId,
        });

        // 진행 상황 업데이트
        // answeredQuestions: 역질문(isUserQuestion)은 학습자 답변이 아니므로 제외
        // totalQuestions: 역질문에 대한 AI 답변은 새 질문이 아니므로 제외
        const newAnswered = (session.answeredQuestions || 0) + (input.isUserQuestion ? 0 : 1);
        const newTotal = (session.totalQuestions || 0) + (aiResponse.isTopicComplete || input.isUserQuestion ? 0 : 1);

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
            allMessages.map((m) => ({ role: m.role, content: m.content })),
            ctx.user.id
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

    // QLoop 모델 변경 (세션 중)
    updateModel: protectedProcedure
      .input(z.object({
        sessionId: z.number(),
        qloopModel: z.enum(["core", "curated", "open"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const session = await getLearningSessionById(input.sessionId);
        if (!session || session.userId !== ctx.user.id) throw new Error("세션을 찾을 수 없습니다.");
        const openQloopMode = input.qloopModel === "open" ? 1 : input.qloopModel === "curated" ? 2 : 0;
        await updateLearningSession(input.sessionId, { openQloopMode });
        return { success: true, qloopModel: input.qloopModel };
      }),
    // 세션 종료
       complete: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const session = await getLearningSessionById(input.sessionId);
        if (!session || session.userId !== ctx.user.id) throw new Error("세션을 찾을 수 없습니다.");
        // 그룹 세션 또는 개별 문서 세션 모두 지원
        const doc = session.documentId ? await getDocumentById(session.documentId) : null;
        const group = session.groupId ? await getDocumentGroupById(session.groupId) : null;
        const titleForSummary = group?.name ?? doc?.title ?? "학습 자료";
        const allMessages = await getSessionMessages(input.sessionId);
        // 요약 생성 실패 시에도 세션은 반드시 completed 처리
        let summary = "";
        try {
          summary = await generateSessionSummary(
            titleForSummary,
            session.startTopicTitle || "",
            allMessages.map((m) => ({ role: m.role, content: m.content })),
            ctx.user.id
          );
        } catch (summaryErr) {
          console.warn("[QLoop] 요약 생성 실패 (세션은 완료 처리):", summaryErr);
          summary = "학습 요약을 생성하지 못했습니다.";
        }
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
          `**${group ? "그룹" : "문서"}:** ${titleForSummary}`,
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
    listByGroup: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ ctx, input }) => {
        return getSessionsByGroupId(input.groupId, ctx.user.id);
      }),
    getGroupTopicProgress: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ ctx, input }) => {
        const sessions = await getSessionsByGroupId(input.groupId, ctx.user.id);
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
        return progressMap;
      }),
    // 문서별 토픽 완성도 조회 (topicId → status 맵)
    // 완료: 해당 topicId로 completed 세션 존재
    // 진행중: 해당 topicId로 active 세션 존재 (completed 없음)
    // 미진행: 세션 없음
    getTopicProgress: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const sessions = await getSessionsByUserId(ctx.user.id);
        const progressMap: Record<string, string> = {};
        for (const s of sessions) {
          if (s.documentId !== input.documentId) continue;
          if (s.currentTopicId) {
            if (!progressMap[s.currentTopicId] || progressMap[s.currentTopicId] !== "completed") {
              progressMap[s.currentTopicId] = "active";
            }
          }
          if (Array.isArray(s.completedTopics)) {
            for (const ctid of s.completedTopics as string[]) {
              progressMap[ctid] = "completed";
            }
          }
        }
        return progressMap;
      }),

    // QLoop 모델별 세션 통계 (Core/Curated/Open 세션 수 + 평균 점수)
    getModelStats: protectedProcedure.query(async ({ ctx }) => {
      const sessions = await getSessionsByUserId(ctx.user.id);
      const modelMap: Record<string, { count: number; totalScore: number; scoredCount: number }> = {
        core: { count: 0, totalScore: 0, scoredCount: 0 },
        curated: { count: 0, totalScore: 0, scoredCount: 0 },
        open: { count: 0, totalScore: 0, scoredCount: 0 },
      };
      for (const s of sessions) {
        const mode = (s as any).openQloopMode as number ?? 0;
        const key = mode === 1 ? "open" : mode === 2 ? "curated" : "core";
        modelMap[key].count++;
        const score = (s as any).evaluationScore as number | null;
        if (score !== null && score !== undefined) {
          modelMap[key].totalScore += score;
          modelMap[key].scoredCount++;
        }
      }
      return {
        core: { count: modelMap.core.count, avgScore: modelMap.core.scoredCount > 0 ? Math.round(modelMap.core.totalScore / modelMap.core.scoredCount) : null },
        curated: { count: modelMap.curated.count, avgScore: modelMap.curated.scoredCount > 0 ? Math.round(modelMap.curated.totalScore / modelMap.curated.scoredCount) : null },
        open: { count: modelMap.open.count, avgScore: modelMap.open.scoredCount > 0 ? Math.round(modelMap.open.totalScore / modelMap.open.scoredCount) : null },
      };
    }),
  }),
});
export type AppRouter = typeof appRouter;
