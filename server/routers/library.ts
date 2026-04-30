import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  knowledgeLibrary,
  documents,
} from "../../drizzle/schema";
import { eq, and, desc, like, or } from "drizzle-orm";

// ─── Knowledge Library ────────────────────────────────────────────────────────

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
          // 원본 문서 정보
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

      // Library 항목 조회
      const [item] = await db
        .select()
        .from(knowledgeLibrary)
        .where(
          and(
            eq(knowledgeLibrary.id, input.libraryItemId),
            eq(knowledgeLibrary.isPublic, 1)
          )
        )
        .limit(1);

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Library 항목을 찾을 수 없습니다." });
      }

      // 원본 문서 조회
      const [originalDoc] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, item.documentId))
        .limit(1);

      if (!originalDoc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "원본 문서를 찾을 수 없습니다." });
      }

      // 복사본 생성 (동일한 storageKey/URL 참조, 소유자만 변경)
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

      // 다운로드 카운트 증가
      await db
        .update(knowledgeLibrary)
        .set({ downloadCount: (item.downloadCount ?? 0) + 1 })
        .where(eq(knowledgeLibrary.id, item.id));

      return { success: true, newDocumentId: (result as any).insertId };
    }),

  // 관리자: Library에 문서 추가
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

      // 문서 존재 확인
      const [doc] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, input.documentId))
        .limit(1);

      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "문서를 찾을 수 없습니다." });
      }

      // 이미 Library에 있는지 확인
      const [existing] = await db
        .select()
        .from(knowledgeLibrary)
        .where(eq(knowledgeLibrary.documentId, input.documentId))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "이미 Library에 등록된 문서입니다." });
      }

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
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
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
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      await db
        .delete(knowledgeLibrary)
        .where(eq(knowledgeLibrary.id, input.libraryItemId));
      return { success: true };
    }),

  // 관리자: Library 항목 공개/비공개 토글
  toggleLibraryVisibility: protectedProcedure
    .input(z.object({ libraryItemId: z.number(), isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });
      await db
        .update(knowledgeLibrary)
        .set({ isPublic: input.isPublic ? 1 : 0 })
        .where(eq(knowledgeLibrary.id, input.libraryItemId));
      return { success: true };
    }),

  // ─── Open QLoop ────────────────────────────────────────────────────────────

  // 문서의 Open QLoop 모드 토글
  setOpenQloop: protectedProcedure
    .input(z.object({ documentId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      // 문서 소유자 확인
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.documentId), eq(documents.userId, ctx.user.id)))
        .limit(1);

      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "문서를 찾을 수 없거나 권한이 없습니다." });
      }

      await db
        .update(documents)
        .set({ openQloopEnabled: input.enabled ? 1 : 0 })
        .where(eq(documents.id, input.documentId));

      return { success: true, openQloopEnabled: input.enabled };
    }),

  // 문서의 Open QLoop 상태 조회
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
