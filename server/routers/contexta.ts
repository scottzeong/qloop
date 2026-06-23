/**
 * CONTEXTA 자료 분석 라우터
 * 문서를 6단계로 심층 분석: 내용 → 구조 → 논리 → 개념요약 → 이해요약 → 비판적 사고
 * 결과는 documents.contextaAnalysis (JSON)에 저장
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { documents } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { storageGetSignedUrl } from "../storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextaAnalysis {
  contentAnalysis: ContentAnalysis | null;
  structureAnalysis: StructureAnalysis | null;
  logicAnalysis: LogicAnalysis | null;
  conceptSummary: ConceptSummary | null;
  understandingSummary: UnderstandingSummary | null;
  criticalThinking: CriticalThinkingAnalysis | null;
  analyzedAt: string;
}

export interface ContentAnalysis {
  main_topic: string;
  one_sentence_summary: string;
  difficulty_level: "초급" | "중급" | "고급";
  target_audience: string;
  prerequisite_knowledge: string[];
  core_claims: string[];
  key_concepts: Array<{ name: string; definition: string; importance: string }>;
  keywords: string[];
  important_facts: string[];
  examples: string[];
  misconceptions: string[];
  practical_applications: string[];
}

export interface StructureAnalysis {
  structure_type: string;
  flow: string[];
  section_roles: Array<{ section_id: string; title: string; role: string; summary: string }>;
  paragraph_roles: Array<{ paragraph_id: string; role: string; summary: string }>;
}

export interface LogicAnalysis {
  arguments: Array<{
    claim: string;
    grounds: string[];
    assumptions: string[];
    conclusion: string;
    weaknesses: string[];
    counterpoints: string[];
    strength: "strong" | "medium" | "weak";
  }>;
  overall_logic_summary: string;
}

export interface ConceptSummary {
  concepts: Array<{
    name: string;
    definition: string;
    why_it_matters: string;
    examples: string[];
    related_concepts: Array<{ name: string; relation: string }>;
  }>;
  concept_map: {
    nodes: Array<{ id: string; label: string }>;
    edges: Array<{ source: string; target: string; label: string }>;
  };
}

export interface UnderstandingSummary {
  learning_path: Array<{ step: number; title: string; explanation: string }>;
  plain_language_summary: string;
  check_questions: string[];
}

export interface CriticalThinkingAnalysis {
  overall_assessment: string;
  strengths: string[];
  weaknesses: string[];
  logical_fallacies: Array<{ type: string; description: string; example: string }>;
  bias_analysis: string;
  alternative_perspectives: Array<{ viewpoint: string; rationale: string }>;
  unanswered_questions: string[];
  reliability_score: "높음" | "보통" | "낮음";
  reliability_reason: string;
}

// ─── 텍스트 전처리 ────────────────────────────────────────────────────────────

const MAX_TEXT = 16000;

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT) return text;
  const head = text.slice(0, Math.floor(MAX_TEXT * 0.7));
  const tail = text.slice(-Math.floor(MAX_TEXT * 0.3));
  return head + "\n\n[... 중간 내용 생략 ...]\n\n" + tail;
}

// ─── LLM 호출 헬퍼 ───────────────────────────────────────────────────────────

async function callAnalysis<T>(systemPrompt: string, userContent: string): Promise<T> {
  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    responseFormat: { type: "json_object" },
    maxTokens: 3000,
  });
  const raw = result.choices[0]?.message?.content;
  if (!raw || typeof raw !== "string") throw new Error("LLM 응답이 비어 있습니다.");
  return JSON.parse(raw) as T;
}

// ─── Step 1: 내용 분석 ───────────────────────────────────────────────────────

async function analyzeContent(text: string, title: string): Promise<ContentAnalysis> {
  const system = `You are an expert educational content analyzer. Analyze the provided learning material and return a JSON object with these exact fields:
{
  "main_topic": "핵심 주제 (한 문장)",
  "one_sentence_summary": "전체 내용 한 줄 요약",
  "difficulty_level": "초급|중급|고급",
  "target_audience": "대상 독자",
  "prerequisite_knowledge": ["사전 지식1", "사전 지식2"],
  "core_claims": ["핵심 주장1", "핵심 주장2", "핵심 주장3"],
  "key_concepts": [{"name": "개념명", "definition": "정의", "importance": "중요성"}],
  "keywords": ["키워드1", "키워드2"],
  "important_facts": ["핵심 사실1", "핵심 사실2"],
  "examples": ["예시1", "예시2"],
  "misconceptions": ["흔한 오해1"],
  "practical_applications": ["실용적 적용1"]
}
Use the same language as the document. Return ONLY valid JSON.`;
  return callAnalysis<ContentAnalysis>(system, `문서 제목: "${title}"\n\n내용:\n${truncateText(text)}`);
}

// ─── Step 2: 구조 분석 ───────────────────────────────────────────────────────

async function analyzeStructure(text: string, title: string): Promise<StructureAnalysis> {
  const system = `You are a document structure analyst. Analyze the document structure and return JSON:
{
  "structure_type": "서론-본론-결론|문제-해결|원인-결과|주장-근거|기타",
  "flow": ["전개 흐름 1", "전개 흐름 2", "전개 흐름 3"],
  "section_roles": [{"section_id": "s1", "title": "섹션 제목", "role": "서론|본론|결론|부록", "summary": "이 섹션의 역할 요약"}],
  "paragraph_roles": [{"paragraph_id": "p1", "role": "서론|주장|근거|예시|결론", "summary": "이 문단 요약"}]
}
Use the same language as the document. Return ONLY valid JSON.`;
  return callAnalysis<StructureAnalysis>(system, `문서 제목: "${title}"\n\n내용:\n${truncateText(text)}`);
}

// ─── Step 3: 논리 분석 ───────────────────────────────────────────────────────

async function analyzeLogic(text: string, title: string): Promise<LogicAnalysis> {
  const system = `You are a critical thinking and logic analyst. Analyze the logical structure and return JSON:
{
  "arguments": [
    {
      "claim": "핵심 주장",
      "grounds": ["근거1", "근거2"],
      "assumptions": ["전제1", "전제2"],
      "conclusion": "결론",
      "weaknesses": ["약점1"],
      "counterpoints": ["반론1"],
      "strength": "strong|medium|weak"
    }
  ],
  "overall_logic_summary": "전체 논리 구조 요약"
}
Identify 2-4 main arguments. Use the same language as the document. Return ONLY valid JSON.`;
  return callAnalysis<LogicAnalysis>(system, `문서 제목: "${title}"\n\n내용:\n${truncateText(text)}`);
}

// ─── Step 4: 개념 요약 ───────────────────────────────────────────────────────

async function generateConceptSummary(text: string, title: string): Promise<ConceptSummary> {
  const system = `You are a knowledge mapping expert. Create a concept map and return JSON:
{
  "concepts": [
    {
      "name": "개념명",
      "definition": "정의",
      "why_it_matters": "왜 중요한가",
      "examples": ["예시1"],
      "related_concepts": [{"name": "연관 개념", "relation": "원인|결과|예시|대조|포함|연관"}]
    }
  ],
  "concept_map": {
    "nodes": [{"id": "node_0", "label": "개념명"}],
    "edges": [{"source": "node_0", "target": "node_1", "label": "관계"}]
  }
}
Identify 4-8 key concepts. Use the same language as the document. Return ONLY valid JSON.`;
  return callAnalysis<ConceptSummary>(system, `문서 제목: "${title}"\n\n내용:\n${truncateText(text)}`);
}

// ─── Step 5: 이해 요약 ───────────────────────────────────────────────────────

async function generateUnderstandingSummary(text: string, title: string): Promise<UnderstandingSummary> {
  const system = `You are a learning path designer. Create a step-by-step understanding guide and return JSON:
{
  "learning_path": [
    {"step": 1, "title": "학습 단계 제목", "explanation": "이 단계에서 이해해야 할 내용"}
  ],
  "plain_language_summary": "누구나 이해할 수 있는 쉬운 요약 (3-5문장)",
  "check_questions": ["이해도 확인 질문1?", "이해도 확인 질문2?", "이해도 확인 질문3?"]
}
Create 4-6 learning steps. Use the same language as the document. Return ONLY valid JSON.`;
  return callAnalysis<UnderstandingSummary>(system, `문서 제목: "${title}"\n\n내용:\n${truncateText(text)}`);
}

// ─── Step 6: 비판적 사고 ─────────────────────────────────────────────────────

async function analyzeCriticalThinking(text: string, title: string): Promise<CriticalThinkingAnalysis> {
  const system = `You are a critical thinking educator. Evaluate this material critically and return JSON:
{
  "overall_assessment": "전반적 평가",
  "strengths": ["강점1", "강점2"],
  "weaknesses": ["약점1", "약점2"],
  "logical_fallacies": [{"type": "오류 유형", "description": "설명", "example": "해당 텍스트의 예시"}],
  "bias_analysis": "편향 분석",
  "alternative_perspectives": [{"viewpoint": "대안적 관점", "rationale": "근거"}],
  "unanswered_questions": ["미답 질문1?", "미답 질문2?"],
  "reliability_score": "높음|보통|낮음",
  "reliability_reason": "신뢰도 판단 근거"
}
Use the same language as the document. Return ONLY valid JSON.`;
  return callAnalysis<CriticalThinkingAnalysis>(system, `문서 제목: "${title}"\n\n내용:\n${truncateText(text)}`);
}

// ─── DB 상태 업데이트 헬퍼 ───────────────────────────────────────────────────

type ContextaStep = "content" | "structure" | "logic" | "concept" | "understanding" | "critical" | "done" | "error";
type ContextaStatus = "pending" | "analyzing" | "done" | "error" | "skipped";

async function updateContextaProgress(
  documentId: number,
  status: ContextaStatus,
  step?: ContextaStep,
  analysis?: ContextaAnalysis
) {
  const db = await getDb();
  if (!db) return;
  const update: Record<string, unknown> = { contextaStatus: status };
  if (step) update.contextaStep = step;
  if (analysis) update.contextaAnalysis = analysis;
  await db.update(documents).set(update).where(eq(documents.id, documentId));
}

// ─── 텍스트 추출 (문서 타입별) ───────────────────────────────────────────────

async function extractDocumentText(doc: {
  fileType: string;
  storageUrl: string;
  storageKey: string;
}): Promise<string> {
  const actualKey = doc.storageUrl
    .replace(/^\/r2-storage\//, "")
    .replace(/^\/manus-storage\//, "");
  const signedUrl = await storageGetSignedUrl(actualKey);

  if (doc.fileType === "text") {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error("텍스트 파일을 불러올 수 없습니다.");
    return await res.text();
  }

  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`파일 다운로드 실패: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (doc.fileType === "pdf") {
    const text = await new Promise<string | null>((resolve) => {
      import("pdf2json").then(({ default: PDFParser }) => {
        const parser = new PDFParser(null, true);
        parser.on("pdfParser_dataReady", (pdfData: unknown) => {
          try {
            const pages = (pdfData as { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }).Pages || [];
            const extracted = pages.map(page =>
              (page.Texts || []).map(t =>
                (t.R || []).map(r => decodeURIComponent(r.T || "")).join("")
              ).join(" ")
            ).join("\n");
            resolve(extracted.trim() || null);
          } catch { resolve(null); }
        });
        parser.on("pdfParser_dataError", () => resolve(null));
        parser.parseBuffer(buffer);
      });
    });
    if (!text || text.length < 50) throw new Error("PDF에서 텍스트를 추출할 수 없습니다.");
    return text;
  }

  if (doc.fileType === "docx") {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value) throw new Error("DOCX에서 텍스트를 추출할 수 없습니다.");
    return result.value;
  }

  if (doc.fileType === "doc") {
    const WordExtractor = (await import("word-extractor")).default;
    const extractor = new WordExtractor();
    const wordDoc = await extractor.extract(buffer);
    const body = wordDoc.getBody();
    if (!body) throw new Error("DOC에서 텍스트를 추출할 수 없습니다.");
    return body;
  }

  // ppt / pptx
  const { parseOffice } = await import("officeparser");
  const ast = await parseOffice(buffer);
  const text = ast.toText();
  if (!text) throw new Error("PPT/PPTX에서 텍스트를 추출할 수 없습니다.");
  return text;
}

// ─── tRPC Router ─────────────────────────────────────────────────────────────

export const contextaRouter = router({
  /**
   * 단일 문서 CONTEXTA 6단계 분석 실행
   * 백그라운드에서 순차 실행, 각 단계 완료 시 DB 업데이트
   */
  runAnalysis: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const [doc] = await db.select().from(documents).where(eq(documents.id, input.documentId)).limit(1);
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "문서를 찾을 수 없습니다." });
      }

      // 이미 완료된 경우 재실행 허용 (재분석)
      await updateContextaProgress(input.documentId, "analyzing", "content");

      // 백그라운드 실행
      (async () => {
        try {
          const text = await extractDocumentText(doc);

          const analysis: ContextaAnalysis = {
            contentAnalysis: null,
            structureAnalysis: null,
            logicAnalysis: null,
            conceptSummary: null,
            understandingSummary: null,
            criticalThinking: null,
            analyzedAt: new Date().toISOString(),
          };

          // Step 1: 내용 분석
          await updateContextaProgress(input.documentId, "analyzing", "content");
          analysis.contentAnalysis = await analyzeContent(text, doc.title);

          // Step 2: 구조 분석
          await updateContextaProgress(input.documentId, "analyzing", "structure");
          analysis.structureAnalysis = await analyzeStructure(text, doc.title);

          // Step 3: 논리 분석
          await updateContextaProgress(input.documentId, "analyzing", "logic");
          analysis.logicAnalysis = await analyzeLogic(text, doc.title);

          // Step 4: 개념 요약
          await updateContextaProgress(input.documentId, "analyzing", "concept");
          analysis.conceptSummary = await generateConceptSummary(text, doc.title);

          // Step 5: 이해 요약
          await updateContextaProgress(input.documentId, "analyzing", "understanding");
          analysis.understandingSummary = await generateUnderstandingSummary(text, doc.title);

          // Step 6: 비판적 사고
          await updateContextaProgress(input.documentId, "analyzing", "critical");
          analysis.criticalThinking = await analyzeCriticalThinking(text, doc.title);

          // 완료
          analysis.analyzedAt = new Date().toISOString();
          await updateContextaProgress(input.documentId, "done", "done", analysis);
        } catch (e) {
          console.error("[contextaRouter.runAnalysis] 실패:", e);
          await updateContextaProgress(input.documentId, "error", "error");
        }
      })();

      return { success: true };
    }),

  /**
   * 분석 결과 조회
   */
  getAnalysis: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [doc] = await db
        .select({
          contextaStatus: documents.contextaStatus,
          contextaStep: documents.contextaStep,
          contextaAnalysis: documents.contextaAnalysis,
        })
        .from(documents)
        .where(eq(documents.id, input.documentId))
        .limit(1);

      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      return doc as {
        contextaStatus: string | null;
        contextaStep: string | null;
        contextaAnalysis: ContextaAnalysis | null;
      };
    }),
});
