/**
 * aiRouter - AI Provider 추상화 레이어
 *
 * 우선순위:
 * 1순위: 사용자 Default AI Provider (ai_connections 테이블)
 * 2순위: 시스템 환경변수에 저장된 기본 AI Provider (invokeLLM)
 */

import { getDb } from "../db";
import { aiConnections } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { decryptApiKey } from "./crypto";
import { OpenAIProvider } from "./providers/openaiProvider";
import { GeminiProvider } from "./providers/geminiProvider";
import { ClaudeProvider } from "./providers/claudeProvider";
import { invokeLLM, type Message } from "../_core/llm";
import type {
  AIProviderAdapter,
  GenerateTextParams,
  GenerateStructuredOutputParams,
  EvaluateAnswerParams,
  ProviderName,
} from "./types";

/**
 * 사용자의 Default AI Provider 어댑터를 반환
 * 설정이 없으면 null 반환 (시스템 기본 사용)
 */
export async function getUserAIAdapter(userId: number): Promise<AIProviderAdapter | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const connections = await db
      .select()
      .from(aiConnections)
      .where(and(eq(aiConnections.userId, userId), eq(aiConnections.isDefault, 1)))
      .limit(1);

    if (connections.length === 0) return null;

    const conn = connections[0];
    const apiKey = decryptApiKey(conn.apiKeyEncrypted);

    return createProviderAdapter(conn.providerName as ProviderName, apiKey, conn.selectedModel);
  } catch {
    return null;
  }
}

/**
 * Provider 어댑터 생성 팩토리
 */
export function createProviderAdapter(
  provider: ProviderName,
  apiKey: string,
  model: string
): AIProviderAdapter {
  switch (provider) {
    case "openai":
      return new OpenAIProvider(apiKey, model);
    case "gemini":
      return new GeminiProvider(apiKey, model);
    case "claude":
      return new ClaudeProvider(apiKey, model);
    default:
      throw new Error(`지원하지 않는 Provider: ${provider}`);
  }
}

// ─── invokeLLM 래퍼 (시스템 기본 AI) ──────────────────────────────────────────

/**
 * 시스템 기본 AI로 텍스트 생성 (invokeLLM 사용)
 */
async function systemGenerateText(params: GenerateTextParams): Promise<string> {
  const messages: Message[] = [];
  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }
  messages.push({ role: "user", content: params.prompt });

  const result = await invokeLLM({ messages });
  const content = result.choices[0]?.message?.content ?? "";
  return typeof content === "string" ? content : JSON.stringify(content);
}

/**
 * 시스템 기본 AI로 구조화 출력 생성 (invokeLLM 사용)
 */
async function systemGenerateStructuredOutput(params: GenerateStructuredOutputParams): Promise<unknown> {
  const messages: Message[] = [];
  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }
  messages.push({ role: "user", content: params.prompt });

  const result = await invokeLLM({
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: params.schema.name,
        strict: params.schema.strict ?? true,
        schema: params.schema.schema,
      },
    },
  });

  const content = result.choices[0]?.message?.content ?? "{}";
  return typeof content === "string" ? JSON.parse(content) : content;
}

// ─── 공개 AI Router 함수들 ────────────────────────────────────────────────────

/**
 * 텍스트 생성 (사용자 설정 우선, 없으면 시스템 기본)
 */
export async function aiGenerateText(
  userId: number | null,
  params: GenerateTextParams
): Promise<string> {
  if (userId) {
    const adapter = await getUserAIAdapter(userId);
    if (adapter) return adapter.generateText(params);
  }
  return systemGenerateText(params);
}

/**
 * 구조화 출력 생성 (사용자 설정 우선, 없으면 시스템 기본)
 */
export async function aiGenerateStructuredOutput(
  userId: number | null,
  params: GenerateStructuredOutputParams
): Promise<unknown> {
  if (userId) {
    const adapter = await getUserAIAdapter(userId);
    if (adapter) return adapter.generateStructuredOutput(params);
  }
  return systemGenerateStructuredOutput(params);
}

/**
 * 답변 평가 (사용자 설정 우선, 없으면 시스템 기본)
 */
export async function aiEvaluateAnswer(
  userId: number | null,
  params: EvaluateAnswerParams
): Promise<string> {
  if (userId) {
    const adapter = await getUserAIAdapter(userId);
    if (adapter) return adapter.evaluateAnswer(params);
  }
  // 시스템 기본: invokeLLM으로 평가
  const systemPrompt = params.rubric
    ? `You are an educational evaluator. Rubric: ${params.rubric}`
    : "You are an educational evaluator. Provide constructive feedback.";
  const prompt = `Question: ${params.question}\nUser Answer: ${params.userAnswer}${
    params.referenceMaterial ? `\nReference: ${params.referenceMaterial}` : ""
  }`;
  return systemGenerateText({ prompt, systemPrompt });
}

/**
 * invokeLLM 호환 래퍼 - 기존 코드와 동일한 인터페이스 제공
 * messages 배열을 받아 AI 응답 반환
 */
export async function aiInvoke(
  userId: number | null,
  params: {
    messages: Message[];
    response_format?: {
      type: "json_schema";
      json_schema: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      };
    };
  }
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  // 사용자 어댑터 확인
  if (userId) {
    const adapter = await getUserAIAdapter(userId);
    if (adapter) {
      // messages에서 system/user 분리
      const systemMsg = params.messages.find((m) => m.role === "system");
      const userMsgs = params.messages.filter((m) => m.role !== "system");
      const userContent = userMsgs.map((m) =>
        typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      ).join("\n");

      let content: string;

      if (params.response_format?.type === "json_schema") {
        const result = await adapter.generateStructuredOutput({
          prompt: userContent,
          systemPrompt: systemMsg ? (typeof systemMsg.content === "string" ? systemMsg.content : "") : undefined,
          schema: params.response_format.json_schema,
        });
        content = typeof result === "string" ? result : JSON.stringify(result);
      } else {
        content = await adapter.generateText({
          prompt: userContent,
          systemPrompt: systemMsg ? (typeof systemMsg.content === "string" ? systemMsg.content : "") : undefined,
        });
      }

      return { choices: [{ message: { content } }] };
    }
  }

  // 시스템 기본: invokeLLM 직접 호출
  const sysResult = await invokeLLM(params as Parameters<typeof invokeLLM>[0]);
  // 반환 타입 정규화: content가 배열일 수 있으므로 string으로 변환
  return {
    choices: sysResult.choices.map((c) => ({
      message: {
        content: typeof c.message.content === "string"
          ? c.message.content
          : JSON.stringify(c.message.content),
      },
    })),
  };
}
