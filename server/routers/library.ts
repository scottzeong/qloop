import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, createDocument, updateDocumentAnalysis } from "../db";
import {
  knowledgeLibrary,
  documents,
} from "../../drizzle/schema";
import { eq, and, desc, like, or } from "drizzle-orm";
import { storagePut, storageGetSignedUrl } from "../storage";
import { invokeLLM, type Message } from "../_core/llm";
import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import WordExtractor from "word-extractor";

// ─── 허용 MIME 타입 ────────────────────────────────────────────────────────────

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

// ─── AI 문서 분석 (routers.ts의 analyzeDocumentStructure와 동일 로직) ──────────

const MIME_TO_LLM_TYPE: Record<AllowedMime, "application/pdf"> = {
  "application/pdf": "application/pdf",
  "application/msword": "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "application/pdf",
  "application/vnd.ms-powerpoint": "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "application/pdf",
};

async function extractTextForLibrary(fileUrl: string, mimeType: string): Promise<string | null> {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      // DOCX → mammoth
      const result = await mammoth.extractRawText({ buffer });
      return result.value || null;
    } else if (mimeType === "application/msword") {
      // DOC (Word 97-2003, CFB 포맷) → word-extractor
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody() || null;
    } else {
      // PPT / PPTX → officeparser
      const ast = await parseOffice(buffer);
      return ast.toText() || null;
    }
  } catch { return null; }
}

async function analyzeDocForLibrary(fileUrl: string, docTitle: string, mimeType: string = "application/pdf") {
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
For conceptMap nodes: type "core"/"sub"/"related", connections = array of other node IDs.
For keyConceptCards: importance "high"/"medium"/"low".
For learningPath: estimatedMinutes per step.
Be thorough. Use the same language as the document (Korean if Korean).
Return ONLY valid JSON matching the schema exactly.`;

  // PDF는 file_url로 직접, Word/PPT는 텍스트 추출 후 텍스트로 전달
  const isPdf = mimeType === "application/pdf";
  let userContent: Message["content"];
  if (isPdf) {
    userContent = [
      { type: "file_url" as const, file_url: { url: fileUrl, mime_type: "application/pdf" } },
      { type: "text" as const, text: `Please analyze this document titled "${docTitle}" and return the hierarchical structure as JSON.` },
    ];
  } else {
    const extractedText = await extractTextForLibrary(fileUrl, mimeType);
    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error("파일에서 텍스트를 추출할 수 없습니다.");
    }
    const truncated = extractedText.length > 50000 ? extractedText.slice(0, 50000) + "\n...[truncated]" : extractedText;
    userContent = `Please analyze this document titled "${docTitle}".\n\nDocument content:\n${truncated}\n\nReturn the hierarchical structure as JSON.`;
  }

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user" as const, content: userContent },
    ] satisfies Message[],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "document_structure",
        strict: false,
        schema: {
          type: "object",
          properties: {
            chapters: { type: "array" },
            conceptMap: { type: "object" },
            keyConceptCards: { type: "array" },
            timeline: { type: "array" },
            comparisonTables: { type: "array" },
            learningPath: { type: "array" },
            documentType: { type: "string" },
          },
        },
      },
    },
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") throw new Error("AI 분석 결과를 받지 못했습니다.");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.chapters)) parsed.chapters = [];
    if (!Array.isArray(parsed.conceptMap)) parsed.conceptMap = [];
    if (!Array.isArray(parsed.keyConceptCards)) parsed.keyConceptCards = [];
    if (!Array.isArray(parsed.timeline)) parsed.timeline = [];
    if (!Array.isArray(parsed.comparisonTables)) parsed.comparisonTables = [];
    if (!Array.isArray(parsed.learningPath)) parsed.learningPath = [];
    if (!parsed.documentType) parsed.documentType = "other";
    if (!parsed.title) parsed.title = docTitle;
    if (!parsed.summary) parsed.summary = "";
    return parsed;
  } catch {
    throw new Error("AI 분석 결과를 파싱하지 못했습니다. 다시 시도해 주세요.");
  }
}

// ─── Knowledge Library Router ─────────────────────────────────────────────────

export const libraryRouter = router({
  // 공개 Library 목록 조회 (학습자)
  listLibrary: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        tag: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      const conditions = [eq(knowledgeLibrary.isPublic, 1)];

      if (input.search) {
        conditions.push(
          or(
            like(knowledgeLibrary.title, `%${input.search}%`),
            like(knowledgeLibrary.description ?? "", `%${input.search}%`)
          ) as any
        );
      }
      if (input.tag) {
        conditions.push(like(knowledgeLibrary.tags ?? "", `%${input.tag}%`));
      }

      const items = await db
        .select({
          id: knowledgeLibrary.id,
          documentId: knowledgeLibrary.documentId,
          title: knowledgeLibrary.title,
          description: knowledgeLibrary.description,
          tags: knowledgeLibrary.tags,
          downloadCount: knowledgeLibrary.downloadCount,
          createdAt: knowledgeLibrary.createdAt,
          fileType: documents.fileType,
          pageCount: documents.pageCount,
          analysisStatus: documents.analysisStatus,
        })
        .from(knowledgeLibrary)
        .leftJoin(documents, eq(knowledgeLibrary.documentId, documents.id))
        .where(and(...conditions))
        .orderBy(desc(knowledgeLibrary.createdAt));

      return { items };
    }),

  // Library 자료를 내 문서로 가져오기 (복사본 생성)
  importFromLibrary: protectedProcedure
    .input(z.object({ libraryItemId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const [item] = await db
        .select()
        .from(knowledgeLibrary)
        .where(and(eq(knowledgeLibrary.id, input.libraryItemId), eq(knowledgeLibrary.isPublic, 1)))
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Library 항목을 찾을 수 없습니다." });

      const [originalDoc] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, item.documentId))
        .limit(1);

      if (!originalDoc) throw new TRPCError({ code: "NOT_FOUND", message: "원본 문서를 찾을 수 없습니다." });

      const [result] = await db.insert(documents).values({
        userId: ctx.user.id,
        title: `[Library] ${originalDoc.title}`,
        fileType: originalDoc.fileType,
        storageKey: originalDoc.storageKey,
        storageUrl: originalDoc.storageUrl,
        fileSize: originalDoc.fileSize,
        pageCount: originalDoc.pageCount,
        analysisStatus: originalDoc.analysisStatus,
        structure: originalDoc.structure,
        openQloopEnabled: originalDoc.openQloopEnabled,
      });

      await db
        .update(knowledgeLibrary)
        .set({ downloadCount: (item.downloadCount ?? 0) + 1 })
        .where(eq(knowledgeLibrary.id, item.id));

      return { success: true, newDocumentId: (result as any).insertId };
    }),

  // 관리자: 파일 직접 업로드 → AI 분석 → Library 등록 (원스텝)
  uploadAndRegister: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.string(), // base64
        fileSize: z.number(),
        mimeType: z.string(),
        description: z.string().optional(),
        tags: z.string().optional(),
        isPublic: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "관리자만 Library에 업로드할 수 있습니다." });
      }
      if (!ALLOWED_MIME_TYPES.includes(input.mimeType as AllowedMime)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "지원하지 않는 파일 형식입니다. PDF, DOC, DOCX, PPT, PPTX만 가능합니다." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      // 1. S3 업로드
      const buffer = Buffer.from(input.fileData, "base64");
      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `library/${ctx.user.id}/${Date.now()}-${safeFileName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      const fileType = MIME_TO_FILE_TYPE[input.mimeType as AllowedMime] ?? "pdf";
      const titleWithoutExt = input.fileName.replace(/\.(pdf|doc|docx|ppt|pptx)$/i, "");

      // 2. documents 레코드 생성 (관리자 소유)
      const docId = await createDocument({
        userId: ctx.user.id,
        groupId: null,
        title: titleWithoutExt,
        fileType,
        storageKey: key,
        storageUrl: url,
        fileSize: input.fileSize,
        analysisStatus: "analyzing",
      });

      // 3. AI 분석
      let structure: any = null;
      let analysisError: string | null = null;
      try {
        const signedUrl = await storageGetSignedUrl(key);
        structure = await analyzeDocForLibrary(signedUrl, titleWithoutExt, input.mimeType);
        await updateDocumentAnalysis(docId, "done", structure);
      } catch (e) {
        analysisError = e instanceof Error ? e.message : "AI 분석 실패";
        await updateDocumentAnalysis(docId, "error");
      }

      // 분석 실패 시 Library 등록 차단
      if (analysisError || !structure) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `AI 분석에 실패했습니다. 파일이 S3에 저장되었으나 Library 등록은 취소되었습니다. (documentId: ${docId})`,
        });
      }

      // 4. Knowledge Library 등록
      await db.insert(knowledgeLibrary).values({
        documentId: docId,
        addedBy: ctx.user.id,
        title: titleWithoutExt,
        description: input.description ?? null,
        tags: input.tags ?? null,
        isPublic: input.isPublic ? 1 : 0,
      });

      return { success: true, documentId: docId, analysisStatus: "done" };
    }),

  // 관리자: Library에 기존 문서 추가
  addToLibrary: protectedProcedure
    .input(
      z.object({
        documentId: z.number(),
        description: z.string().optional(),
        tags: z.string().optional(),
        isPublic: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "관리자만 Library에 추가할 수 있습니다." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const [doc] = await db.select().from(documents).where(eq(documents.id, input.documentId)).limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "문서를 찾을 수 없습니다." });

      const [existing] = await db
        .select()
        .from(knowledgeLibrary)
        .where(eq(knowledgeLibrary.documentId, input.documentId))
        .limit(1);

      if (existing) throw new TRPCError({ code: "CONFLICT", message: "이미 Library에 등록된 문서입니다." });

      await db.insert(knowledgeLibrary).values({
        documentId: input.documentId,
        addedBy: ctx.user.id,
        title: doc.title,
        description: input.description ?? null,
        tags: input.tags ?? null,
        isPublic: input.isPublic ? 1 : 0,
      });

      return { success: true };
    }),

  // 관리자: Library 목록 조회 (비공개 포함)
  listLibraryAdmin: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

    const items = await db
      .select({
        id: knowledgeLibrary.id,
        documentId: knowledgeLibrary.documentId,
        title: knowledgeLibrary.title,
        description: knowledgeLibrary.description,
        tags: knowledgeLibrary.tags,
        isPublic: knowledgeLibrary.isPublic,
        downloadCount: knowledgeLibrary.downloadCount,
        createdAt: knowledgeLibrary.createdAt,
        fileType: documents.fileType,
        pageCount: documents.pageCount,
        analysisStatus: documents.analysisStatus,
      })
      .from(knowledgeLibrary)
      .leftJoin(documents, eq(knowledgeLibrary.documentId, documents.id))
      .orderBy(desc(knowledgeLibrary.createdAt));

    return { items };
  }),

  // 관리자: Library에서 제거
  removeFromLibrary: protectedProcedure
    .input(z.object({ libraryItemId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      await db.delete(knowledgeLibrary).where(eq(knowledgeLibrary.id, input.libraryItemId));
      return { success: true };
    }),

  // 관리자: Library 항목 공개/비공개 토글
  toggleLibraryVisibility: protectedProcedure
    .input(z.object({ libraryItemId: z.number(), isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      await db
        .update(knowledgeLibrary)
        .set({ isPublic: input.isPublic ? 1 : 0 })
        .where(eq(knowledgeLibrary.id, input.libraryItemId));
      return { success: true };
    }),

  // ─── Open QLoop ──────────────────────────────────────────────────────────────

  setOpenQloop: protectedProcedure
    .input(z.object({ documentId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.documentId), eq(documents.userId, ctx.user.id)))
        .limit(1);

      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "문서를 찾을 수 없거나 권한이 없습니다." });

      await db
        .update(documents)
        .set({ openQloopEnabled: input.enabled ? 1 : 0 })
        .where(eq(documents.id, input.documentId));

      return { success: true, openQloopEnabled: input.enabled };
    }),

  getDocumentSettings: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      const [doc] = await db
        .select({ openQloopEnabled: documents.openQloopEnabled })
        .from(documents)
        .where(and(eq(documents.id, input.documentId), eq(documents.userId, ctx.user.id)))
        .limit(1);

      return { openQloopEnabled: doc?.openQloopEnabled === 1 };
    }),
});
