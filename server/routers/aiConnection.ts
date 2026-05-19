import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { aiConnections } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { encryptApiKey, decryptApiKey, maskApiKey } from "../ai/crypto";
import { createProviderAdapter } from "../ai/aiRouter";
import type { ProviderName } from "../ai/types";

const PROVIDER_MODELS: Record<ProviderName, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"],
  claude: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
};

export const aiConnectionRouter = router({
  /** 사용자의 AI Connection 목록 조회 (API Key는 마스킹) */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

    const connections = await db
      .select()
      .from(aiConnections)
      .where(eq(aiConnections.userId, ctx.user.id));

    return connections.map((c) => ({
      id: c.id,
      providerName: c.providerName,
      apiKeyMasked: c.apiKeyMasked,
      selectedModel: c.selectedModel,
      isDefault: c.isDefault === 1,
      connectionStatus: c.connectionStatus,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }),

  /** Provider 목록 및 지원 모델 조회 */
  getProviderModels: protectedProcedure.query(() => {
    return PROVIDER_MODELS;
  }),

  /** API Key 저장 또는 업데이트 */
  save: protectedProcedure
    .input(
      z.object({
        providerName: z.enum(["openai", "gemini", "claude"]),
        apiKey: z.string().min(1, "API Key를 입력해주세요."),
        selectedModel: z.string().min(1, "모델을 선택해주세요."),
        setAsDefault: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const encrypted = encryptApiKey(input.apiKey);
      const masked = maskApiKey(input.apiKey);

      // 기존 연결 확인
      const existing = await db
        .select()
        .from(aiConnections)
        .where(
          and(
            eq(aiConnections.userId, ctx.user.id),
            eq(aiConnections.providerName, input.providerName)
          )
        )
        .limit(1);

      // setAsDefault가 true이면 기존 default 해제
      if (input.setAsDefault) {
        await db
          .update(aiConnections)
          .set({ isDefault: 0 })
          .where(eq(aiConnections.userId, ctx.user.id));
      }

      if (existing.length > 0) {
        // 업데이트
        await db
          .update(aiConnections)
          .set({
            apiKeyEncrypted: encrypted,
            apiKeyMasked: masked,
            selectedModel: input.selectedModel,
            isDefault: input.setAsDefault ? 1 : existing[0].isDefault,
            connectionStatus: "untested",
          })
          .where(eq(aiConnections.id, existing[0].id));
      } else {
        // 신규 생성
        await db.insert(aiConnections).values({
          userId: ctx.user.id,
          providerName: input.providerName,
          apiKeyEncrypted: encrypted,
          apiKeyMasked: masked,
          selectedModel: input.selectedModel,
          isDefault: input.setAsDefault ? 1 : 0,
          connectionStatus: "untested",
        });
      }

      return { success: true };
    }),

  /** API Key 삭제 */
  delete: protectedProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      // 본인 소유 확인
      const conn = await db
        .select()
        .from(aiConnections)
        .where(
          and(
            eq(aiConnections.id, input.connectionId),
            eq(aiConnections.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (conn.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "연결을 찾을 수 없습니다." });
      }

      await db.delete(aiConnections).where(eq(aiConnections.id, input.connectionId));
      return { success: true };
    }),

  /** 연결 테스트 (connectionId 기반) */
  test: protectedProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const existing = await db
        .select()
        .from(aiConnections)
        .where(
          and(
            eq(aiConnections.id, input.connectionId),
            eq(aiConnections.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "연결을 찾을 수 없습니다." });
      }

      const decrypted = decryptApiKey(existing[0].apiKeyEncrypted);
      if (!decrypted) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "API Key 복호화 실패" });

      let success = false;
      let errorMessage: string | null = null;

      try {
        const adapter = createProviderAdapter(existing[0].providerName as ProviderName, decrypted, existing[0].selectedModel);
        const result = await adapter.testConnectionWithDetail();
        success = result.success;
        if (!success) errorMessage = result.error ?? "연결 테스트 실패";
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : "알 수 없는 오류";
      }

      await db
        .update(aiConnections)
        .set({ connectionStatus: success ? "connected" : "failed" })
        .where(eq(aiConnections.id, input.connectionId));

      return { success, errorMessage };
    }),

  /** 기본 Provider 설정 */
  setDefault: protectedProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      // 본인 소유 확인
      const conn = await db
        .select()
        .from(aiConnections)
        .where(
          and(
            eq(aiConnections.id, input.connectionId),
            eq(aiConnections.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (conn.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "연결을 찾을 수 없습니다." });
      }

      // 기존 default 해제
      await db
        .update(aiConnections)
        .set({ isDefault: 0 })
        .where(eq(aiConnections.userId, ctx.user.id));

      // 새 default 설정
      await db
        .update(aiConnections)
        .set({ isDefault: 1 })
        .where(eq(aiConnections.id, input.connectionId));

      return { success: true };
    }),

  /** 모델 변경 */
  updateModel: protectedProcedure
    .input(
      z.object({
        connectionId: z.number(),
        selectedModel: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      await db
        .update(aiConnections)
        .set({ selectedModel: input.selectedModel, connectionStatus: "untested" })
        .where(
          and(
            eq(aiConnections.id, input.connectionId),
            eq(aiConnections.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),
});
