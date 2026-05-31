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
 * 사용자의 Default AI Provider 이름을 반환 (null이면 시스템 기본)
 */
export async function getUserProviderName(userId: number): Promise<ProviderName | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const connections = await db
      .select()
      .from(aiConnections)
      .where(and(eq(aiConnections.userId, userId), eq(aiConnections.isDefault, 1)))
      .limit(1);
    if (connections.length === 0) return null;
    return connections[0].providerName as ProviderName;
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
 * messages 배열에서 PDF file_url 콘텐츠가 있는지 확인
 */
function hasPdfFileUrl(messages: Message[]): boolean {
  return messages.some((m) => {
    if (Array.isArray(m.content)) {
      return m.content.some(
        (part) =>
          typeof part === "object" &&
          "type" in part &&
          part.type === "file_url" &&
          "file_url" in part &&
          typeof part.file_url === "object" &&
          part.file_url !== null &&
          "mime_type" in part.file_url &&
          (part.file_url as { mime_type: string }).mime_type === "application/pdf"
      );
    }
    return false;
  });
}

/**
 * invokeLLM 호환 래퍼 - 기존 코드와 동일한 인터페이스 제공
 * messages 배열을 받아 AI 응답 반환
 *
 * PDF file_url이 포함된 경우:
 * - 시스템 기본(invokeLLM): 그대로 전달 (Forge API가 처리)
 * - 사용자 Provider: 각 Provider별 PDF 지원 방식으로 변환하여 전달
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
    // getUserAIAdapter를 통해 DB 조회 (mock 호환)
    const adapter = await getUserAIAdapter(userId);
    if (adapter) {
      // Provider 이름 조회 (PDF 처리 분기용)
      const providerName = await getUserProviderName(userId);

      // PDF file_url이 포함된 경우 각 Provider별 네이티브 PDF 처리
      if (providerName && hasPdfFileUrl(params.messages)) {
        // API Key와 모델 정보를 다시 조회
        const db = await getDb();
        if (db) {
          const connections = await db
            .select()
            .from(aiConnections)
            .where(and(eq(aiConnections.userId, userId), eq(aiConnections.isDefault, 1)))
            .limit(1);
          if (connections.length > 0) {
            const conn = connections[0];
            const apiKey = decryptApiKey(conn.apiKeyEncrypted);
            const content = await invokePdfWithProvider(
              providerName,
              apiKey,
              conn.selectedModel,
              params.messages,
              params.response_format
            );
            return { choices: [{ message: { content } }] };
          }
        }
      }

      // 일반 텍스트 요청: 기존 어댑터 방식
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
  // 반환 타입 정규화: content가 배열이거나 null일 수 있으므로 string으로 변환
  return {
    choices: sysResult.choices.map((c) => ({
      message: {
        content: c.message.content === null || c.message.content === undefined
          ? null
          : typeof c.message.content === "string"
            ? c.message.content
            : JSON.stringify(c.message.content),
      },
    })),
  } as { choices: Array<{ message: { content: string } }> };
}

/**
 * PDF URL을 각 Provider별 네이티브 API 형식으로 변환하여 호출
 */
async function invokePdfWithProvider(
  providerName: ProviderName,
  apiKey: string,
  model: string,
  messages: Message[],
  responseFormat?: {
    type: "json_schema";
    json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> };
  }
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const systemPrompt = systemMsg
    ? (typeof systemMsg.content === "string" ? systemMsg.content : "")
    : undefined;

  // user 메시지에서 PDF URL과 텍스트 분리
  const userMsg = messages.find((m) => m.role === "user");
  if (!userMsg) throw new Error("No user message found");

  let pdfUrl = "";
  let textPrompt = "";

  if (Array.isArray(userMsg.content)) {
    for (const part of userMsg.content) {
      if (
        typeof part === "object" && part !== null && "type" in part
      ) {
        if (
          part.type === "file_url" &&
          "file_url" in part &&
          typeof part.file_url === "object" &&
          part.file_url !== null &&
          "url" in part.file_url
        ) {
          pdfUrl = (part.file_url as { url: string }).url;
        } else if (part.type === "text" && "text" in part) {
          textPrompt += (part as { text: string }).text + "\n";
        }
      }
    }
  } else if (typeof userMsg.content === "string") {
    textPrompt = userMsg.content;
  }

  textPrompt = textPrompt.trim();

  switch (providerName) {
    case "openai":
      return invokePdfOpenAI(apiKey, model, systemPrompt, pdfUrl, textPrompt, responseFormat);
    case "gemini":
      return invokePdfGemini(apiKey, model, systemPrompt, pdfUrl, textPrompt, responseFormat);
    case "claude":
      return invokePdfClaude(apiKey, model, systemPrompt, pdfUrl, textPrompt, responseFormat);
    default:
      throw new Error(`지원하지 않는 Provider: ${providerName}`);
  }
}

/**
 * OpenAI: PDF URL을 직접 전달 (GPT-4o vision 방식)
 * OpenAI는 file_url 타입을 지원하지 않으므로 PDF를 fetch하여 base64로 변환
 */
async function invokePdfOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  pdfUrl: string,
  textPrompt: string,
  responseFormat?: { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> } }
): Promise<string> {
  // PDF를 fetch하여 base64로 인코딩
  const pdfResp = await fetch(pdfUrl);
  if (!pdfResp.ok) throw new Error(`PDF 다운로드 실패: ${pdfResp.status}`);
  const pdfBuffer = await pdfResp.arrayBuffer();
  const base64Pdf = Buffer.from(pdfBuffer).toString("base64");

  const userContent: unknown[] = [
    {
      type: "file",
      file: {
        filename: "document.pdf",
        file_data: `data:application/pdf;base64,${base64Pdf}`,
      },
    },
    { type: "text", text: textPrompt || "Analyze this document and return the hierarchical structure as JSON." },
  ];

  const messages: unknown[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userContent });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: 8192,
  };
  if (responseFormat) body.response_format = responseFormat;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI PDF 분석 오류: ${response.status} – ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

/**
 * Gemini: PDF URL을 file_data inline으로 전달
 */
async function invokePdfGemini(
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  pdfUrl: string,
  textPrompt: string,
  responseFormat?: { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> } }
): Promise<string> {
  // PDF를 fetch하여 base64로 인코딩
  const pdfResp = await fetch(pdfUrl);
  if (!pdfResp.ok) throw new Error(`PDF 다운로드 실패: ${pdfResp.status}`);
  const pdfBuffer = await pdfResp.arrayBuffer();
  const base64Pdf = Buffer.from(pdfBuffer).toString("base64");

  const promptText = (systemPrompt ? systemPrompt + "\n\n" : "") +
    (textPrompt || "Analyze this document and return the hierarchical structure as JSON.");

  const parts: unknown[] = [
    {
      inline_data: {
        mime_type: "application/pdf",
        data: base64Pdf,
      },
    },
    { text: promptText },
  ];

  const contents = [{ role: "user", parts }];

  const generationConfig: Record<string, unknown> = {
    temperature: 0.3,
    maxOutputTokens: 8192,
  };
  if (responseFormat) {
    generationConfig.responseMimeType = "application/json";
  }

  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini PDF 분석 오류: ${response.status} – ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (responseFormat) {
    // JSON 응답 정제
    return content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }
  return content;
}

/**
 * Claude: PDF URL을 document source로 전달
 */
async function invokePdfClaude(
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  pdfUrl: string,
  textPrompt: string,
  responseFormat?: { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> } }
): Promise<string> {
  // PDF를 fetch하여 base64로 인코딩
  const pdfResp = await fetch(pdfUrl);
  if (!pdfResp.ok) throw new Error(`PDF 다운로드 실패: ${pdfResp.status}`);
  const pdfBuffer = await pdfResp.arrayBuffer();
  const base64Pdf = Buffer.from(pdfBuffer).toString("base64");

  const finalPrompt = responseFormat
    ? (textPrompt || "Analyze this document.") + "\n\nReturn valid JSON only, matching the required schema. No markdown."
    : (textPrompt || "Analyze this document.");

  const userContent: unknown[] = [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64Pdf,
      },
    },
    { type: "text", text: finalPrompt },
  ];

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content: userContent }],
  };
  if (systemPrompt) body.system = systemPrompt;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude PDF 분석 오류: ${response.status} – ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const content = data.content?.[0]?.text ?? "";

  if (responseFormat) {
    return content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }
  return content;
}
