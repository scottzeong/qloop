import type { AIProviderAdapter, GenerateTextParams, GenerateStructuredOutputParams, EvaluateAnswerParams } from "../types";

export class ClaudeProvider implements AIProviderAdapter {
  constructor(
    private apiKey: string,
    private model: string
  ) {}

  private async callAPI(
    messages: Array<{ role: string; content: string }>,
    system?: string,
    extra?: Record<string, unknown>
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: extra?.max_tokens ?? 4096,
      messages,
    };
    if (system) body.system = system;
    if (extra?.temperature !== undefined) body.temperature = extra.temperature;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401) throw new Error("Invalid API Key");
      if (response.status === 404) throw new Error("Model not available");
      if (response.status === 429) throw new Error("사용량 한도 초과");
      throw new Error(`Provider API error: ${response.status} – ${err}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content?.[0]?.text ?? "";
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    return this.callAPI(
      [{ role: "user", content: params.prompt }],
      params.systemPrompt,
      {
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 4096,
      }
    );
  }

  async generateStructuredOutput(params: GenerateStructuredOutputParams): Promise<unknown> {
    const prompt = params.prompt + "\n\nReturn valid JSON only, matching the required schema. No markdown.";

    const content = await this.callAPI(
      [{ role: "user", content: prompt }],
      params.systemPrompt,
      {
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 8192,
      }
    );

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

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.callAPI(
        [{ role: "user", content: "Reply only with: connection_success" }],
        undefined,
        { max_tokens: 20 }
      );
      return result.toLowerCase().includes("connection_success");
    } catch {
      return false;
    }
  }
}
