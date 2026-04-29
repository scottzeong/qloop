import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { invokeLLM, type Message } from "../_core/llm";
import {
  questionTypes,
  evaluationDimensions,
  questionTypeDimensionWeights,
  socraticEvaluationPolicies,
  questions,
  questionEvaluations,
  moduleEvaluations,
  learnerSocraticProfiles,
  learningSessions,
  sessionMessages,
} from "../../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

// ============================================================
// Helper: 활성 정책 조회
// ============================================================
async function getActivePolicy(courseId?: number, courseType?: "document" | "group") {
  const db = await getDb();
  if (!db) return null;
  // 코스별 정책 → 없으면 global default
  if (courseId && courseType) {
    const [coursePolicy] = await db
      .select()
      .from(socraticEvaluationPolicies)
      .where(
        and(
          eq(socraticEvaluationPolicies.courseId, courseId),
          eq(socraticEvaluationPolicies.courseType, courseType)
        )
      )
      .limit(1);
    if (coursePolicy) return coursePolicy;
  }
  const [globalDefault] = await db
    .select()
    .from(socraticEvaluationPolicies)
    .where(
      and(
        eq(socraticEvaluationPolicies.courseType, "global"),
        eq(socraticEvaluationPolicies.isDefault, 1)
      )
    )
    .limit(1);
  return globalDefault ?? null;
}

// ============================================================
// Helper: 가중치 매트릭스 조회
// ============================================================
async function getWeightsForQuestionType(questionTypeId: number) {
  const db = await getDb();
  if (!db) return [];
  const weights = await db
    .select()
    .from(questionTypeDimensionWeights)
    .where(eq(questionTypeDimensionWeights.questionTypeId, questionTypeId));
  return weights;
}

// ============================================================
// Helper: Path Orchestrator - 다음 질문유형 선택
// ============================================================
async function selectNextQuestionType(
  policy: typeof socraticEvaluationPolicies.$inferSelect,
  previousQuestionTypeNames: string[],
  detectedWeaknesses: string[],
  sessionQuestionCount: number
): Promise<typeof questionTypes.$inferSelect | null> {
  const enabledIds = (policy.enabledQuestionTypeIdsJson as number[]) ?? [];
  if (enabledIds.length === 0) return null;

  const db = await getDb();
  if (!db) return null;
  const allTypes = await db
    .select()
    .from(questionTypes)
    .where(inArray(questionTypes.id, enabledIds))
    .orderBy(questionTypes.sortOrder);

  if (allTypes.length === 0) return null;

  const frequency = (policy.questionFrequencyJson as Record<string, number>) ?? {};
  const sequence = (policy.questionSequenceJson as string[]) ?? [];

  // 마지막 질문이 reflection이면 다시 reflection 방지
  const lastType = previousQuestionTypeNames[previousQuestionTypeNames.length - 1];

  // 약점 기반 우선 선택
  const weaknessTypeMap: Record<string, string> = {
    "근거 부족": "justification",
    "숨은 전제": "assumption",
    "과도한 일반화": "counterexample",
    "논리 모순": "consistency",
    "좁은 관점": "perspective",
    "결과 예측 부족": "implication",
    "불명확한 가치": "value",
  };

  for (const weakness of detectedWeaknesses) {
    for (const [key, typeName] of Object.entries(weaknessTypeMap)) {
      if (weakness.includes(key)) {
        const found = allTypes.find((t: typeof allTypes[0]) => t.name === typeName && t.name !== lastType);
        if (found) return found;
      }
    }
  }

  // 세션 마무리 시 reflection
  const constraints = (policy.constraintsJson as { maxQuestionsPerSession?: number }) ?? {};
  const maxQ = constraints.maxQuestionsPerSession ?? 15;
  if (sessionQuestionCount >= maxQ - 1) {
    const reflection = allTypes.find((t: typeof allTypes[0]) => t.name === "reflection");
    if (reflection) return reflection;
  }

  // 빈도 기반 선택 (아직 적게 사용된 유형 우선)
  const usageCounts: Record<string, number> = {};
  for (const name of previousQuestionTypeNames) {
    usageCounts[name] = (usageCounts[name] ?? 0) + 1;
  }

  // 시퀀스 기반 선택
  for (const typeName of sequence) {
    if (typeName === lastType) continue;
    const type = allTypes.find((t: typeof allTypes[0]) => t.name === typeName);
    if (!type) continue;
    const targetFreq = frequency[typeName] ?? 0;
    const currentUsage = (usageCounts[typeName] ?? 0) / Math.max(sessionQuestionCount, 1) * 100;
    if (currentUsage < targetFreq) return type;
  }

  // fallback: 가장 적게 사용된 유형
  const sorted = allTypes
    .filter((t: typeof allTypes[0]) => t.name !== "reflection" && t.name !== lastType)
    .sort((a: typeof allTypes[0], b: typeof allTypes[0]) => (usageCounts[a.name] ?? 0) - (usageCounts[b.name] ?? 0));

  return sorted[0] ?? allTypes[0];
}

// ============================================================
// Socratic Router
// ============================================================
export const socraticRouter = router({
  // ── 질문유형 조회 (공개) ──────────────────────────────────
  getQuestionTypes: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(questionTypes).orderBy(questionTypes.sortOrder);
  }),

  // ── 평가요소 조회 (공개) ──────────────────────────────────
  getEvaluationDimensions: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(evaluationDimensions);
  }),

  // ── 가중치 매트릭스 조회 (공개) ───────────────────────────
  getWeightMatrix: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { weights: [], types: [], dims: [] };
    const weights = await db.select().from(questionTypeDimensionWeights);
    const types = await db.select().from(questionTypes).orderBy(questionTypes.sortOrder);
    const dims = await db.select().from(evaluationDimensions);
    return { weights, types, dims };
  }),

  // ── 정책 목록 조회 ────────────────────────────────────────
  getPolicies: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(socraticEvaluationPolicies).orderBy(desc(socraticEvaluationPolicies.createdAt));
  }),

  // ── 관리자: 질문유형 업데이트 ─────────────────────────────
  updateQuestionType: protectedProcedure
    .input(z.object({
      id: z.number(),
      displayName: z.string().optional(),
      description: z.string().optional(),
      purpose: z.string().optional(),
      promptInstruction: z.string().optional(),
      defaultEnabled: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(questionTypes).set(data).where(eq(questionTypes.id, id));
      return { success: true };
    }),

  // ── 관리자: 평가요소 업데이트 ─────────────────────────────
  updateEvaluationDimension: protectedProcedure
    .input(z.object({
      id: z.number(),
      displayName: z.string().optional(),
      description: z.string().optional(),
      enabled: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(evaluationDimensions).set(data).where(eq(evaluationDimensions.id, id));
      return { success: true };
    }),

  // ── 관리자: 가중치 업데이트 ───────────────────────────────
  updateWeights: protectedProcedure
    .input(z.object({
      questionTypeId: z.number(),
      weights: z.array(z.object({
        evaluationDimensionId: z.number(),
        weight: z.number().min(0).max(100),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const total = input.weights.reduce((s, w) => s + w.weight, 0);
      if (total !== 100) throw new TRPCError({ code: "BAD_REQUEST", message: "가중치 합계는 100이어야 합니다" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      for (const w of input.weights) {
        await db
          .update(questionTypeDimensionWeights)
          .set({ weight: w.weight })
          .where(
            and(
              eq(questionTypeDimensionWeights.questionTypeId, input.questionTypeId),
              eq(questionTypeDimensionWeights.evaluationDimensionId, w.evaluationDimensionId)
            )
          );
      }
      return { success: true };
    }),

  // ── 관리자: 정책 생성/업데이트 ────────────────────────────
  upsertPolicy: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      courseId: z.number().optional(),
      courseType: z.enum(["document", "group", "global"]).default("global"),
      name: z.string(),
      description: z.string().optional(),
      mode: z.enum(["socratic", "exam_prep", "project", "critical_thinking", "custom"]).default("socratic"),
      enabledQuestionTypeIds: z.array(z.number()).optional(),
      enabledDimensionIds: z.array(z.number()).optional(),
      constraintsJson: z.record(z.string(), z.unknown()).optional(),
      moduleCompletionRulesJson: z.record(z.string(), z.unknown()).optional(),
      isDefault: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "instructor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const data = {
        courseId: input.courseId ?? null,
        courseType: input.courseType,
        name: input.name,
        description: input.description ?? null,
        mode: input.mode,
        enabledQuestionTypeIdsJson: input.enabledQuestionTypeIds ?? null,
        enabledDimensionIdsJson: input.enabledDimensionIds ?? null,
        constraintsJson: input.constraintsJson ?? null,
        moduleCompletionRulesJson: input.moduleCompletionRulesJson ?? null,
        isDefault: input.isDefault ?? 0,
        createdBy: ctx.user.id,
      };
      if (input.id) {
        await db.update(socraticEvaluationPolicies).set(data).where(eq(socraticEvaluationPolicies.id, input.id));
        return { id: input.id };
      } else {
        const [result] = await db.insert(socraticEvaluationPolicies).values(data);
        return { id: (result as any).insertId };
      }
    }),

  // ── 질문 생성 엔진 ────────────────────────────────────────
  generateQuestion: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      concept: z.string(),
      sourceContext: z.string(),
      previousAnswersSummary: z.string().optional(),
      detectedWeaknesses: z.array(z.string()).optional(),
      previousQuestionTypeNames: z.array(z.string()).optional(),
      sessionQuestionCount: z.number().default(0),
      courseId: z.number().optional(),
      courseType: z.enum(["document", "group"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const policy = await getActivePolicy(input.courseId, input.courseType);
      if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "활성 정책을 찾을 수 없습니다" });

      const selectedType = await selectNextQuestionType(
        policy,
        input.previousQuestionTypeNames ?? [],
        input.detectedWeaknesses ?? [],
        input.sessionQuestionCount
      );
      if (!selectedType) throw new TRPCError({ code: "NOT_FOUND", message: "사용 가능한 질문유형이 없습니다" });

      const prompt = `당신은 Neural Campus의 Socratic Question Generator입니다.

입력 정보:
- 현재 학습 개념: ${input.concept}
- 관련 학습자료: ${input.sourceContext}
- 이전 답변 요약: ${input.previousAnswersSummary ?? "없음"}
- 발견된 약점: ${(input.detectedWeaknesses ?? []).join(", ") || "없음"}
- 선택된 질문유형: ${selectedType.displayName}
- 질문유형 목적: ${selectedType.purpose ?? ""}
- 질문 생성 지침: ${selectedType.promptInstruction ?? ""}

질문 생성 조건:
1. 반드시 관련 학습자료에 근거해 질문을 생성하십시오.
2. 선택된 질문유형의 목적에 맞는 질문을 생성하십시오.
3. 학습자가 스스로 생각하도록 유도하십시오.
4. 정답을 직접 알려주지 마십시오.
5. 한 번에 하나의 질문만 생성하십시오.
6. 한국어로 질문을 생성하십시오.

반드시 JSON 형식으로만 출력하십시오:
{
  "question_text": "질문 내용",
  "intent": "이 질문의 의도",
  "expected_key_points": ["핵심 포인트1", "핵심 포인트2"],
  "difficulty_level": "basic|intermediate|advanced",
  "why_this_question": "이 질문을 선택한 이유"
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system" as const, content: "You are a Socratic Question Generator. Always respond with valid JSON only." },
          { role: "user" as const, content: prompt },
        ] as Message[],
        response_format: { type: "json_object" as const },
      });

      let parsed: any = {};
      try {
        const content = response.choices[0].message.content as string;
        parsed = JSON.parse(content);
      } catch {
        parsed = { question_text: response.choices[0].message.content, intent: "", expected_key_points: [], difficulty_level: "basic" };
      }

      // 질문 저장
      const [result] = await db.insert(questions).values({
        sessionId: input.sessionId,
        learnerId: ctx.user.id,
        questionTypeId: selectedType.id,
        questionText: parsed.question_text ?? "",
        intent: parsed.intent ?? "",
        expectedKeyPointsJson: parsed.expected_key_points ?? [],
        difficultyLevel: parsed.difficulty_level ?? "basic",
        policySnapshotJson: { policyId: policy.id, policyName: policy.name },
      });

      return {
        questionId: (result as any).insertId,
        questionText: parsed.question_text ?? "",
        questionTypeName: selectedType.name,
        questionTypeDisplayName: selectedType.displayName,
        intent: parsed.intent ?? "",
        expectedKeyPoints: parsed.expected_key_points ?? [],
        difficultyLevel: parsed.difficulty_level ?? "basic",
        whyThisQuestion: parsed.why_this_question ?? "",
      };
    }),

  // ── 답변 평가 엔진 ────────────────────────────────────────
  evaluateAnswer: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      questionId: z.number(),
      responseText: z.string(),
      sourceContext: z.string().optional(),
      conversationHistorySummary: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 질문 조회
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [question] = await db.select().from(questions).where(eq(questions.id, input.questionId)).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "질문을 찾을 수 없습니다" });

      const [questionType] = await db.select().from(questionTypes).where(eq(questionTypes.id, question.questionTypeId)).limit(1);
      const weights = await getWeightsForQuestionType(question.questionTypeId);
      const dims = await db.select().from(evaluationDimensions).where(eq(evaluationDimensions.enabled, 1));

      // 평가 프롬프트 구성
      const dimensionDescriptions = dims.map((d) => {
        const w = weights.find((ww) => ww.evaluationDimensionId === d.id);
        return `- ${d.displayName} (가중치: ${w?.weight ?? 0}%): ${d.description}`;
      }).join("\n");

      const prompt = `당신은 Socratic Tutor의 학습자 답변 평가 엔진입니다.

입력 정보:
- 질문유형: ${questionType?.displayName ?? ""}
- 질문 내용: ${question.questionText}
- 학습자 답변: ${input.responseText}
- 학습 자료 근거: ${input.sourceContext ?? "없음"}
- 기대 핵심 요소: ${JSON.stringify(question.expectedKeyPointsJson ?? [])}
- 이전 대화 요약: ${input.conversationHistorySummary ?? "없음"}

평가 요소 (0~5점):
${dimensionDescriptions}

평가 지침:
- 각 평가 요소를 0~5점으로 평가하십시오.
- 질문유형의 목적에 맞게 답변의 사고 품질을 평가하십시오.
- 학습자의 강점, 약점, 오개념을 한국어로 제시하십시오.
- 다음 질문유형을 추천하십시오 (definition/clarification/justification/assumption/counterexample/consistency/perspective/implication/value/synthesis/application/reflection 중 하나).
- 학습자에게 보여줄 짧은 피드백(1-2문장)과 후속 질문을 생성하십시오.
- 반드시 JSON 형식으로만 출력하십시오.

출력 JSON:
{
  "dimension_scores": {"accuracy": 0, "reasoning": 0, "evidence": 0, "clarity": 0, "depth": 0, "application": 0},
  "weighted_score": 0,
  "level": "Fragmented|Emerging|Developing|Proficient|Advanced",
  "strengths": [],
  "weaknesses": [],
  "detected_gaps": [],
  "misconceptions": [],
  "recommended_next_question_type": "",
  "recommended_followup_question": "",
  "short_feedback": "",
  "evaluation_comment": "",
  "confidence": 0.0
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system" as const, content: "You are a Socratic evaluation engine. Always respond with valid JSON only." },
          { role: "user" as const, content: prompt },
        ] as Message[],
        response_format: { type: "json_object" as const },
      });

      let eval_result: any = {};
      try {
        eval_result = JSON.parse(response.choices[0].message.content as string);
      } catch {
        eval_result = { dimension_scores: {}, weighted_score: 50, level: "Developing", strengths: [], weaknesses: [], short_feedback: "답변을 평가했습니다.", recommended_followup_question: "" };
      }

      // 가중치 기반 점수 재계산
      let weightedScore = 0;
      let totalWeight = 0;
      for (const dim of dims) {
        const w = weights.find((ww) => ww.evaluationDimensionId === dim.id);
        const score = eval_result.dimension_scores?.[dim.name] ?? 0;
        const weight = w?.weight ?? 0;
        weightedScore += (score / 5) * 100 * (weight / 100);
        totalWeight += weight;
      }
      if (totalWeight > 0) weightedScore = Math.round(weightedScore);
      else weightedScore = eval_result.weighted_score ?? 50;

      // 평가 결과 저장 (내부용)
      const [evalResult] = await db.insert(questionEvaluations).values({
        learnerId: ctx.user.id,
        sessionId: input.sessionId,
        questionId: input.questionId,
        questionTypeId: question.questionTypeId,
        responseText: input.responseText,
        dimensionScoresJson: eval_result.dimension_scores ?? {},
        weightedScore,
        level: eval_result.level ?? "Developing",
        strengthsJson: eval_result.strengths ?? [],
        weaknessesJson: eval_result.weaknesses ?? [],
        detectedGapsJson: eval_result.detected_gaps ?? [],
        misconceptionsJson: eval_result.misconceptions ?? [],
        recommendedFollowupQuestion: eval_result.recommended_followup_question ?? "",
        evaluationComment: eval_result.evaluation_comment ?? "",
        confidence: eval_result.confidence ?? 0.8,
        questionTypeSnapshotJson: { id: questionType?.id, name: questionType?.name, displayName: questionType?.displayName },
      });

      // 학습자에게는 짧은 피드백과 후속 질문만 반환
      return {
        evaluationId: (evalResult as any).insertId,
        shortFeedback: eval_result.short_feedback ?? "",
        recommendedFollowupQuestion: eval_result.recommended_followup_question ?? "",
        level: eval_result.level ?? "Developing",
        weaknesses: eval_result.weaknesses ?? [],
        // 내부 점수는 학습자에게 노출하지 않음
      };
    }),

  // ── 모듈 완료 & 종합 평가 생성 ───────────────────────────
  completeModule: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      moduleTitle: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 세션의 모든 질문 평가 수집
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const evals = await db
        .select()
        .from(questionEvaluations)
        .where(
          and(
            eq(questionEvaluations.sessionId, input.sessionId),
            eq(questionEvaluations.learnerId, ctx.user.id)
          )
        );

      if (evals.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "평가할 답변이 없습니다" });
      }

      // 질문유형별 평균 점수
      const typeScores: Record<string, number[]> = {};
      const dimScores: Record<string, number[]> = {};
      const allWeaknesses: string[] = [];
      const allMisconceptions: string[] = [];
      const allStrengths: string[] = [];

      for (const ev of evals) {
        const [qt] = await db.select().from(questionTypes).where(eq(questionTypes.id, ev.questionTypeId)).limit(1);
        if (qt) {
          if (!typeScores[qt.name]) typeScores[qt.name] = [];
          typeScores[qt.name].push(ev.weightedScore ?? 0);
        }
        const ds = (ev.dimensionScoresJson as Record<string, number>) ?? {};
        for (const [k, v] of Object.entries(ds)) {
          if (!dimScores[k]) dimScores[k] = [];
          dimScores[k].push(v);
        }
        allWeaknesses.push(...((ev.weaknessesJson as string[]) ?? []));
        allMisconceptions.push(...((ev.misconceptionsJson as string[]) ?? []));
        allStrengths.push(...((ev.strengthsJson as string[]) ?? []));
      }

      const avgTypeScores: Record<string, number> = {};
      for (const [k, v] of Object.entries(typeScores)) {
        avgTypeScores[k] = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
      }
      const avgDimScores: Record<string, number> = {};
      for (const [k, v] of Object.entries(dimScores)) {
        avgDimScores[k] = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 20); // 0-5 → 0-100
      }

      const moduleScore = Math.round(evals.reduce((s, e) => s + (e.weightedScore ?? 0), 0) / evals.length);
      const moduleLevel = moduleScore >= 80 ? "Advanced" : moduleScore >= 65 ? "Proficient" : moduleScore >= 50 ? "Developing" : moduleScore >= 35 ? "Emerging" : "Fragmented";

      // LLM으로 학습자용 피드백 생성
      const feedbackPrompt = `당신은 학습자의 자기학습을 돕는 Socratic Learning Coach입니다.

입력 정보:
- 학습모듈명: ${input.moduleTitle ?? "학습 세션"}
- 질문유형별 점수: ${JSON.stringify(avgTypeScores)}
- 평가요소별 점수: ${JSON.stringify(avgDimScores)}
- 강점: ${Array.from(new Set(allStrengths)).slice(0, 5).join(", ")}
- 약점: ${Array.from(new Set(allWeaknesses)).slice(0, 5).join(", ")}
- 반복 오개념: ${Array.from(new Set(allMisconceptions)).slice(0, 3).join(", ")}
- 총 답변 수: ${evals.length}

학습자에게 이번 모듈에서 무엇을 잘했고, 무엇을 보완해야 하며, 다음 학습에서 무엇에 집중해야 하는지 한국어로 작성하십시오.

원칙:
1. 문항별 점수표를 나열하지 마십시오.
2. 잘한 점을 먼저 설명하십시오.
3. 보완할 점은 구체적이지만 부담스럽지 않게 표현하십시오.
4. 낮은 점수는 "부족"보다 "연습할 사고 요소"로 표현하십시오.

반드시 JSON으로만 출력:
{
  "module_summary": "",
  "key_concepts_learned": [],
  "what_you_did_well": [],
  "what_to_practice_next": [],
  "thinking_patterns": [],
  "recurring_misconceptions_explained": [],
  "recommended_next_steps": [],
  "reflection_question": "",
  "encouraging_comment": "",
  "dimension_status": {"accuracy": "강점|양호|보완 필요|집중 연습 필요", ...}
}`;

      const feedbackResponse = await invokeLLM({
        messages: [
          { role: "system" as const, content: "You are a learning coach. Always respond with valid JSON only." },
          { role: "user" as const, content: feedbackPrompt },
        ] as Message[],
        response_format: { type: "json_object" as const },
      });

      let learnerFeedback: any = {};
      try {
        learnerFeedback = JSON.parse(feedbackResponse.choices[0].message.content as string);
      } catch {
        learnerFeedback = { module_summary: "학습을 완료했습니다.", encouraging_comment: "수고하셨습니다!" };
      }

      // 모듈 평가 저장
      const [moduleEvalResult] = await db.insert(moduleEvaluations).values({
        learnerId: ctx.user.id,
        sessionId: input.sessionId,
        moduleTitle: input.moduleTitle ?? "학습 세션",
        questionEvaluationIdsJson: evals.map(e => e.id),
        questionTypeScoresJson: avgTypeScores,
        dimensionScoresJson: avgDimScores,
        moduleScore,
        moduleLevel,
        strengthsJson: Array.from(new Set(allStrengths)).slice(0, 5),
        weaknessesJson: Array.from(new Set(allWeaknesses)).slice(0, 5),
        misconceptionsJson: Array.from(new Set(allMisconceptions)).slice(0, 3),
        learnerFeedbackJson: learnerFeedback,
      });

      // 학습자 프로파일 업데이트
      await updateLearnerProfile(ctx.user.id, avgDimScores, avgTypeScores);

      // 세션 완료 처리
      await db.update(learningSessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(learningSessions.id, input.sessionId));

      return {
        moduleEvaluationId: (moduleEvalResult as any).insertId,
        moduleScore,
        moduleLevel,
        learnerFeedback,
        questionTypeScores: avgTypeScores,
        dimensionScores: avgDimScores,
      };
    }),

  // ── 학습자 Socratic Profile 조회 ─────────────────────────
  getLearnerProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { profile: null, recentModuleEvaluations: [] };
    const [profile] = await db
      .select()
      .from(learnerSocraticProfiles)
      .where(eq(learnerSocraticProfiles.learnerId, ctx.user.id))
      .limit(1);

    // 최근 모듈 평가 5개
    const recentEvals = await db
      .select()
      .from(moduleEvaluations)
      .where(eq(moduleEvaluations.learnerId, ctx.user.id))
      .orderBy(desc(moduleEvaluations.createdAt))
      .limit(5);

    return { profile: profile ?? null, recentModuleEvaluations: recentEvals };
  }),

  // ── 세션의 모듈 평가 조회 ─────────────────────────────────
  getModuleEvaluation: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [evaluation] = await db
        .select()
        .from(moduleEvaluations)
        .where(
          and(
            eq(moduleEvaluations.sessionId, input.sessionId),
            eq(moduleEvaluations.learnerId, ctx.user.id)
          )
        )
        .orderBy(desc(moduleEvaluations.createdAt))
        .limit(1);
      return evaluation ?? null;
    }),

  // ── 교수자: 학습자 분석 조회 ──────────────────────────────
  getInstructorAnalytics: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "instructor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) return [];
      const recentEvals = await db
        .select()
        .from(moduleEvaluations)
        .orderBy(desc(moduleEvaluations.createdAt))
        .limit(20);
      return recentEvals;
    }),
  // ── 학습자: 답변 평가 이력 조회 ───────────────────────────────────────────────
  getLearnerEvaluations: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(questionEvaluations)
        .where(eq(questionEvaluations.learnerId, ctx.user.id))
        .orderBy(desc(questionEvaluations.createdAt))
        .limit(input.limit);
    }),
});

// ============================================================
// Helper: 학습자 프로파일 업데이트
// ============================================================
async function updateLearnerProfile(
  learnerId: number,
  dimScores: Record<string, number>,
  typeScores: Record<string, number>
) {
  const db = await getDb();
  if (!db) return;
  const [existing] = await db
    .select()
    .from(learnerSocraticProfiles)
    .where(eq(learnerSocraticProfiles.learnerId, learnerId))
    .limit(1);

  // 4대 사고영역 계산
  const ts = (name: string) => (typeScores[name] ?? 0);

  const conceptualUnderstanding = Math.round(ts("definition") * 0.4 + ts("clarification") * 0.3 + ts("synthesis") * 0.3);
  const criticalReasoning = Math.round(ts("justification") * 0.25 + ts("assumption") * 0.25 + ts("counterexample") * 0.25 + ts("consistency") * 0.25);
  const perspectiveValue = Math.round(ts("perspective") * 0.35 + ts("implication") * 0.3 + ts("value") * 0.35);
  const reflectiveApplication = Math.round(ts("reflection") * 0.45 + ts("application") * 0.55);

  const slci = Math.round(
    conceptualUnderstanding * 0.25 +
    criticalReasoning * 0.35 +
    perspectiveValue * 0.20 +
    reflectiveApplication * 0.20
  );

  const slciLevel = slci >= 80 ? "Advanced" : slci >= 65 ? "Proficient" : slci >= 50 ? "Developing" : slci >= 35 ? "Emerging" : "Fragmented";

  const profileData = {
    learnerId,
    dimensionScoresJson: dimScores,
    questionTypeScoresJson: typeScores,
    conceptualUnderstandingScore: conceptualUnderstanding,
    criticalReasoningScore: criticalReasoning,
    perspectiveValueScore: perspectiveValue,
    reflectiveApplicationScore: reflectiveApplication,
    slciScore: slci,
    slciLevel,
    totalSessionsCompleted: (existing?.totalSessionsCompleted ?? 0) + 1,
    totalQuestionsAnswered: (existing?.totalQuestionsAnswered ?? 0),
  };

  if (existing) {
    await db.update(learnerSocraticProfiles).set(profileData).where(eq(learnerSocraticProfiles.learnerId, learnerId));
  } else {
    await db.insert(learnerSocraticProfiles).values(profileData);
  }
}
