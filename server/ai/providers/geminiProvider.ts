import type { AIProviderAdapter, GenerateTextParams, GenerateStructuredOutputParams, EvaluateAnswerParams } from "../types";

export class GeminiProvider implements AIProviderAdapter {
  constructor(
    private apiKey: string,
    private model: string
  ) {}

  private getBaseUrl(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
  }

  private async callAPI(contents: unknown[], generationConfig?: Record<string, unknown>): Promise<string> {
    const body: Record<string, unknown> = { contents };
    if (generationConfig) body.generationConfig = generationConfig;

    const response = await fetch(this.getBaseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 400 && err.includes("API_KEY")) throw new Error("Invalid API Key");
      if (response.status === 404) throw new Error("Model not available");
      if (response.status === 429) throw new Error("사용량 한도 초과");
      throw new Error(`Provider API error: ${response.status} – ${err}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    const contents: unknown[] = [];
    if (params.systemPrompt) {
      // Gemini: system instruction은 별도 필드로 처리
      contents.push({ role: "user", parts: [{ text: params.systemPrompt + "\n\n" + params.prompt }] });
    } else {
      contents.push({ role: "user", parts: [{ text: params.prompt }] });
    }

    return this.callAPI(contents, {
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxTokens ?? 4096,
    });
  }

  async generateStructuredOutput(params: GenerateStructuredOutputParams): Promise<unknown> {
    const prompt = (params.systemPrompt ? params.systemPrompt + "\n\n" : "") +
      params.prompt + "\n\nReturn valid JSON only, matching the required schema.";

    const content = await this.callAPI(
      [{ role: "user", parts: [{ text: prompt }] }],
      {
        temperature: params.temperature ?? 0.3,
        maxOutputTokens: params.maxTokens ?? 8192,
        responseMimeType: "application/json",
      }
    );

    // JSON 파싱 시도
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  }

  async evaluateAnswer(params: EvaluateAnswerParams): Promise<string> {
    const systemPrompt = params.rubric
      ? `You are an educational evaluator. Rubric: ${params.rubric}`
      : "You are an educational evaluator. Provide constructive feedback.";

    const userContent = `Question: ${params.question}\nUser Answer: ${params.userAnswer}${
      params.referenceMaterial ? `\nReference: ${params.referenceMaterial}` : ""
    }`;

    return this.generateText({ prompt: userContent, systemPrompt });
  }

  async testConnectionWithDetail(): Promise<import("../types").TestConnectionResult> {
    try {
      const result = await this.callAPI([
        { role: "user", parts: [{ text: "Say hello" }] }
      ], { maxOutputTokens: 10 });
      if (typeof result === "string" && result.length > 0) {
        return { success: true };
      }
      return { success: false, error: "API 응답이 비어있습니다." };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "알 수 없는 오류" };
    }
  }
}
