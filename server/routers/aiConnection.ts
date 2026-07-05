import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { aiConnections } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { encryptApiKey, decryptApiKey, maskApiKey } from "../ai/crypto";
import { createProviderAdapter, invalidateUserConnectionCache } from "../ai/aiRouter";
import type { ProviderName } from "../ai/types";

const PROVIDER_MODELS: Record<ProviderName, string[]> = {
  // OpenAI: GPT-5.x 최신 모델 우선, GPT-4.1 시리즈 포함
  openai: [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
  ],
  // Gemini: 2.5 시리즈 최신 stable 우선
  gemini: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
  ],
  // Claude: 4.x 최신 시리즈 우선
  claude: [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-opus-4-6",
    "claude-sonnet-4-5",
  ],
};

export const aiConnectionRouter = router({
  /** 시스템 기본 AI 상태 조회 */
  systemAiStatus: protectedProcedure.query(async () => {
    const { ENV } = await import("../_core/env");
    const hasKey = !!ENV.openaiApiKey;
    return {
      active: hasKey,
      provider: "openai" as const,
      model: "gpt-4o",
      apiKeyMasked: hasKey
        ? `sk-...${ENV.openaiApiKey.slice(-4)}`
        : null,
    };
  }),

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

      // API Key 앞뒤 공백/줄바꿈 제거 및 ASCII 범위 외 문자 제거
      const cleanApiKey = input.apiKey.trim().replace(/[^\x20-\x7E]/g, "");
      if (!cleanApiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "유효하지 않은 API Key 형식입니다." });

      const encrypted = encryptApiKey(cleanApiKey);
      const masked = maskApiKey(cleanApiKey);

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

      await db.transaction(async (tx) => {
        // setAsDefault가 true이면 기존 default 해제
        if (input.setAsDefault) {
          await tx
            .update(aiConnections)
            .set({ isDefault: 0 })
            .where(eq(aiConnections.userId, ctx.user.id));
        }

        if (existing.length > 0) {
          // 업데이트
          await tx
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
          await tx.insert(aiConnections).values({
            userId: ctx.user.id,
            providerName: input.providerName,
            apiKeyEncrypted: encrypted,
            apiKeyMasked: masked,
            selectedModel: input.selectedModel,
            isDefault: input.setAsDefault ? 1 : 0,
            connectionStatus: "untested",
          });
        }
      });

      invalidateUserConnectionCache(ctx.user.id);
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
      invalidateUserConnectionCache(ctx.user.id);
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

      const rawDecrypted = decryptApiKey(existing[0].apiKeyEncrypted);
      if (!rawDecrypted) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "API Key 복호화 실패" });
      // 복호화 후에도 비ASCII 문자 제거 (구 DB 데이터 호환성)
      const decrypted = rawDecrypted.trim().replace(/[^\x20-\x7E]/g, "");

      let success = false;
      let errorMessage: string | null = null;

      try {
        const adapter = createProviderAdapter(existing[0].providerName as ProviderName, decrypted, existing[0].selectedModel);
        const result = await adapter.testConnectionWithDetail();
        success = result.success;
        if (!success) errorMessage = result.error ?? "연결 테스트 실패";
      } catch (e) {
        console.error("[aiConnection.test] 연결 테스트 실패:", e);
        errorMessage = "연결 테스트 중 오류가 발생했습니다. API Key와 모델 설정을 확인해 주세요.";
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

      await db.transaction(async (tx) => {
        // 기존 default 해제
        await tx
          .update(aiConnections)
          .set({ isDefault: 0 })
          .where(eq(aiConnections.userId, ctx.user.id));

        // 새 default 설정
        await tx
          .update(aiConnections)
          .set({ isDefault: 1 })
          .where(eq(aiConnections.id, input.connectionId));
      });

      invalidateUserConnectionCache(ctx.user.id);
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

      invalidateUserConnectionCache(ctx.user.id);
      return { success: true };
    }),
});
