import type { AIProviderAdapter, GenerateTextParams, GenerateStructuredOutputParams, EvaluateAnswerParams } from "../types";

export class OpenAIProvider implements AIProviderAdapter {
  constructor(
    private apiKey: string,
    private model: string
  ) {}

  private async callAPI(body: Record<string, unknown>): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, ...body }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401) throw new Error("Invalid API Key");
      if (response.status === 404) throw new Error("Model not available");
      if (response.status === 429) throw new Error("사용량 한도 초과");
      throw new Error(`Provider API error: ${response.status} – ${err}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? "";
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (params.systemPrompt) messages.push({ role: "system", content: params.systemPrompt });
    messages.push({ role: "user", content: params.prompt });

    return this.callAPI({
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
    });
  }

  async generateStructuredOutput(params: GenerateStructuredOutputParams): Promise<unknown> {
    const messages: Array<{ role: string; content: string }> = [];
    if (params.systemPrompt) messages.push({ role: "system", content: params.systemPrompt });
    messages.push({ role: "user", content: params.prompt });

    const content = await this.callAPI({
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: params.schema.name,
          strict: params.schema.strict ?? true,
          schema: params.schema.schema,
        },
      },
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens ?? 8192,
    });

    return JSON.parse(content);
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
      const result = await this.callAPI({
        messages: [{ role: "user", content: 'Reply only with: connection_success' }],
        max_tokens: 20,
      });
      return result.toLowerCase().includes("connection_success");
    } catch {
      return false;
    }
  }
}
