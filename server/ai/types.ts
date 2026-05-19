// ─── AI Provider 공통 인터페이스 ────────────────────────────────────────────────

export type ProviderName = "openai" | "gemini" | "claude";

export interface GenerateTextParams {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateStructuredOutputParams {
  prompt: string;
  systemPrompt?: string;
  schema: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  };
  temperature?: number;
  maxTokens?: number;
}

export interface EvaluateAnswerParams {
  question: string;
  userAnswer: string;
  rubric?: string;
  referenceMaterial?: string;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
}

export interface AIProviderAdapter {
  generateText(params: GenerateTextParams): Promise<string>;
  generateStructuredOutput(params: GenerateStructuredOutputParams): Promise<unknown>;
  evaluateAnswer(params: EvaluateAnswerParams): Promise<string>;
  /** 연결 테스트: 성공 여부 및 에러 메시지 반환 */
  testConnectionWithDetail(): Promise<TestConnectionResult>;
}

export interface AICallParams {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  responseFormat?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
  temperature?: number;
  maxTokens?: number;
}

export interface AICallResult {
  content: string;
}
