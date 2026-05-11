import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  knowledgeLibrary,
  documents,
} from "../../drizzle/schema";
import { eq, and, desc, like, or, inArray } from "drizzle-orm";
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

// ─── 텍스트 추출 헬퍼 ─────────────────────────────────────────────────────────

async function extractTextFromFile(fileUrl: string, mimeType: string): Promise<string | null> {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || null;
    } else if (mimeType === "application/msword") {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody() || null;
    } else if (mimeType !== "application/pdf") {
      // PPT / PPTX → officeparser
      const ast = await parseOffice(buffer);
      return ast.toText() || null;
    }
    // PDF: LLM이 직접 처리하므로 null 반환
    return null;
  } catch { return null; }
}

// ─── AI 문서 요약 추출 (Library 컨텍스트용, 간략 버전) ────────────────────────

async function extractLibraryContext(fileUrl: string, docTitle: string, mimeType: string): Promise<string> {
  const isPdf = mimeType === "application/pdf";
  let userContent: Message["content"];

  if (isPdf) {
    userContent = [
      { type: "file_url" as const, file_url: { url: fileUrl, mime_type: "application/pdf" } },
      { type: "text" as const, text: `Please extract the key concepts, main topics, and important facts from this document titled "${docTitle}". Provide a comprehensive summary that can be used as context for generating learning questions. Include: main themes, key terms, important facts, and core arguments. Be thorough but concise.` },
    ];
  } else {
    const extractedText = await extractTextFromFile(fileUrl, mimeType);
    if (!extractedText || extractedText.trim().length < 50) {
      return `[Document: ${docTitle}] (텍스트 추출 실패)`;
    }
    const truncated = extractedText.length > 30000 ? extractedText.slice(0, 30000) + "\n...[truncated]" : extractedText;
    userContent = `Please extract the key concepts, main topics, and important facts from this document titled "${docTitle}".\n\nDocument content:\n${truncated}\n\nProvide a comprehensive summary for learning context.`;
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert educational content analyzer. Extract key concepts and important information from documents to create learning context summaries. Be comprehensive and use the same language as the document.",
      },
      { role: "user" as const, content: userContent },
    ] satisfies Message[],
  });

  const raw = response.choices?.[0]?.message?.content;
  return (typeof raw === "string" ? raw : null) ?? `[Document: ${docTitle}]`;
}

// ─── Knowledge Library Router ─────────────────────────────────────────────────

export const libraryRouter = router({
  // 공개 Library 목록 조회 (학습자/관리자 공통)
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
          title: knowledgeLibrary.title,
          description: knowledgeLibrary.description,
          tags: knowledgeLibrary.tags,
          downloadCount: knowledgeLibrary.downloadCount,
          createdAt: knowledgeLibrary.createdAt,
          fileType: knowledgeLibrary.fileType,
          fileSize: knowledgeLibrary.fileSize,
          // 기존 호환성
          documentId: knowledgeLibrary.documentId,
        })
        .from(knowledgeLibrary)
        .where(and(...conditions))
        .orderBy(desc(knowledgeLibrary.createdAt));

      return { items };
    }),

  // Library 자료를 내 문서로 가져오기 (복사본 생성 — documentId 있는 구형 항목만 지원)
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

      // 독립 파일 업로드 방식 항목: documents 복사 대신 다운로드 카운트만 증가
      if (!item.documentId) {
        await db
          .update(knowledgeLibrary)
          .set({ downloadCount: (item.downloadCount ?? 0) + 1 })
          .where(eq(knowledgeLibrary.id, item.id));
        return { success: true, newDocumentId: null, message: "Library 자료를 학습 컨텍스트로 사용할 수 있습니다." };
      }

      const [originalDoc] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, item.documentId as number))
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

  // ─── 독립 파일 업로드 (관리자 + 학습자 공통) ──────────────────────────────────
  // 관리자: isPublic=true로 전체 공개 가능
  // 학습자: isPublic=false로 본인만 사용 가능 (학습 컨텍스트용)
  uploadFile: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.string(), // base64
        fileSize: z.number(),
        mimeType: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.string().optional(),
        isPublic: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 모든 학습자가 본인 Library에 등록 가능 (본인 자료는 항상 비공개로 저장)
      if (!ALLOWED_MIME_TYPES.includes(input.mimeType as AllowedMime)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "지원하지 않는 파일 형식입니다. PDF, DOC, DOCX, PPT, PPTX만 가능합니다." });
      }
      if (input.fileSize > 20 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "파일 크기가 20MB를 초과합니다." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      // 1. S3 업로드
      const buffer = Buffer.from(input.fileData, "base64");
      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const prefix = input.isPublic ? "library/public" : `library/user/${ctx.user.id}`;
      const key = `${prefix}/${Date.now()}-${safeFileName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      const fileType = MIME_TO_FILE_TYPE[input.mimeType as AllowedMime] ?? "pdf";
      const titleWithoutExt = input.title || input.fileName.replace(/\.(pdf|doc|docx|ppt|pptx)$/i, "");

      // 2. 텍스트/컨텍스트 추출 (AI 활용)
      let extractedText: string | null = null;
      try {
        const signedUrl = await storageGetSignedUrl(key);
        extractedText = await extractLibraryContext(signedUrl, titleWithoutExt, input.mimeType);
      } catch (_) {
        // 추출 실패 시 null로 저장 (업로드는 계속 진행)
      }

      // 3. knowledgeLibrary 레코드 직접 생성 (documents 테이블 불필요)
      const [result] = await db.insert(knowledgeLibrary).values({
        storageKey: key,
        storageUrl: url,
        fileType,
        fileSize: input.fileSize,
        extractedText,
        documentId: null,
        addedBy: ctx.user.id,
        title: titleWithoutExt,
        description: input.description ?? null,
        tags: input.tags ?? null,
        isPublic: input.isPublic ? 1 : 0,
      });

      return {
        success: true,
        libraryItemId: (result as any).insertId,
        hasContext: !!extractedText,
      };
    }),

  // 기존 uploadAndRegister 호환 유지 (관리자 전용, 공개 등록)
  uploadAndRegister: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.string(),
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "지원하지 않는 파일 형식입니다." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      const buffer = Buffer.from(input.fileData, "base64");
      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `library/public/${Date.now()}-${safeFileName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      const fileType = MIME_TO_FILE_TYPE[input.mimeType as AllowedMime] ?? "pdf";
      const titleWithoutExt = input.fileName.replace(/\.(pdf|doc|docx|ppt|pptx)$/i, "");
      let extractedText: string | null = null;
      try {
        const signedUrl = await storageGetSignedUrl(key);
        extractedText = await extractLibraryContext(signedUrl, titleWithoutExt, input.mimeType);
      } catch (_) {}
      const [result] = await db.insert(knowledgeLibrary).values({
        storageKey: key, storageUrl: url, fileType, fileSize: input.fileSize,
        extractedText, documentId: null, addedBy: ctx.user.id,
        title: titleWithoutExt, description: input.description ?? null,
        tags: input.tags ?? null, isPublic: input.isPublic ? 1 : 0,
      });
      return { success: true, libraryItemId: (result as any).insertId, hasContext: !!extractedText };
    }),

  // 관리자: Library에 기존 문서 추가 (구형 방식, 호환성 유지)
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
        title: knowledgeLibrary.title,
        description: knowledgeLibrary.description,
        tags: knowledgeLibrary.tags,
        isPublic: knowledgeLibrary.isPublic,
        downloadCount: knowledgeLibrary.downloadCount,
        createdAt: knowledgeLibrary.createdAt,
        fileType: knowledgeLibrary.fileType,
        fileSize: knowledgeLibrary.fileSize,
        documentId: knowledgeLibrary.documentId,
        storageKey: knowledgeLibrary.storageKey,
        hasContext: knowledgeLibrary.extractedText,
      })
      .from(knowledgeLibrary)
      .orderBy(desc(knowledgeLibrary.createdAt));

    return {
      items: items.map(item => ({
        ...item,
        hasContext: !!item.hasContext,
      })),
    };
  }),

  // 학습자: 본인이 업로드한 Library 자료 목록 (isPublic=0, addedBy=me)
  listMyLibrary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

    const items = await db
      .select({
        id: knowledgeLibrary.id,
        title: knowledgeLibrary.title,
        description: knowledgeLibrary.description,
        tags: knowledgeLibrary.tags,
        fileType: knowledgeLibrary.fileType,
        fileSize: knowledgeLibrary.fileSize,
        createdAt: knowledgeLibrary.createdAt,
        isPublic: knowledgeLibrary.isPublic,
      })
      .from(knowledgeLibrary)
      .where(eq(knowledgeLibrary.addedBy, ctx.user.id))
      .orderBy(desc(knowledgeLibrary.createdAt));

    return { items };
  }),

  // Library 자료 컨텍스트 조회 (학습 세션에서 AI 프롬프트 구성용)
  getLibraryContexts: protectedProcedure
    .input(z.object({ libraryItemIds: z.array(z.number()) }))
    .query(async ({ ctx, input }) => {
      if (input.libraryItemIds.length === 0) return { contexts: [] };
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const items = await db
        .select({
          id: knowledgeLibrary.id,
          title: knowledgeLibrary.title,
          extractedText: knowledgeLibrary.extractedText,
          isPublic: knowledgeLibrary.isPublic,
          addedBy: knowledgeLibrary.addedBy,
        })
        .from(knowledgeLibrary)
        .where(inArray(knowledgeLibrary.id, input.libraryItemIds));

      // 접근 권한 확인: 공개이거나 본인 업로드만 허용
      const accessible = items.filter(
        item => item.isPublic === 1 || item.addedBy === ctx.user.id
      );

      return {
        contexts: accessible.map(item => ({
          id: item.id,
          title: item.title,
          text: item.extractedText ?? "",
        })),
      };
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

  // 학습자: 본인 Library 자료 삭제
  deleteMyLibraryItem: protectedProcedure
    .input(z.object({ libraryItemId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      const [item] = await db
        .select({ addedBy: knowledgeLibrary.addedBy })
        .from(knowledgeLibrary)
        .where(eq(knowledgeLibrary.id, input.libraryItemId))
        .limit(1);
      if (!item || item.addedBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "삭제 권한이 없습니다." });
      }
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
