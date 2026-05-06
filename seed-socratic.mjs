import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const conn = await createConnection(url);

// ============================================================
// 1. 12개 질문유형 시드
// ============================================================
const questionTypes = [
  {
    name: "definition",
    displayName: "Definition",
    description: "개념의 정의와 핵심 속성을 설명하도록 유도하는 질문",
    purpose: "학습자가 개념을 자신의 말로 정확히 정의할 수 있는지 확인",
    generationGoal: "개념의 본질적 속성과 경계를 명확히 하는 질문 생성",
    promptInstruction: "학습자에게 특정 개념이 무엇인지, 어떻게 정의할 수 있는지 묻는 질문을 생성하세요. 단순 암기가 아닌 이해를 확인하세요.",
    selectionRule: { triggers: ["처음 접한 개념", "개념 이해 부족"] },
    sortOrder: 1,
  },
  {
    name: "clarification",
    displayName: "Clarification",
    description: "모호하거나 불명확한 표현을 더 명확히 설명하도록 유도",
    purpose: "학습자의 답변에서 모호한 부분을 구체화하고 명확히 하도록 유도",
    generationGoal: "학습자가 사용한 용어나 표현의 의미를 더 구체적으로 설명하도록 유도",
    promptInstruction: "학습자의 답변에서 불명확하거나 모호한 표현을 찾아 그 의미를 더 구체적으로 설명해달라고 요청하세요.",
    selectionRule: { triggers: ["모호한 표현", "불명확한 답변"] },
    sortOrder: 2,
  },
  {
    name: "justification",
    displayName: "Justification",
    description: "주장에 대한 근거와 이유를 제시하도록 유도",
    purpose: "학습자가 자신의 주장을 논리적 근거로 뒷받침할 수 있는지 확인",
    generationGoal: "학습자의 주장에 대해 왜 그렇게 생각하는지, 어떤 근거가 있는지 묻는 질문 생성",
    promptInstruction: "학습자의 주장이나 답변에 대해 '왜', '어떤 근거로', '어떻게 알 수 있는지'를 묻는 질문을 생성하세요.",
    selectionRule: { triggers: ["근거 없는 주장", "설명 부족"] },
    sortOrder: 3,
  },
  {
    name: "assumption",
    displayName: "Assumption",
    description: "답변에 숨겨진 전제나 가정을 드러내도록 유도",
    purpose: "학습자가 자신의 사고에 내재된 전제를 인식하고 점검할 수 있는지 확인",
    generationGoal: "학습자의 답변 뒤에 숨겨진 가정이나 전제를 드러내는 질문 생성",
    promptInstruction: "학습자의 답변에서 당연하게 여기는 전제나 가정을 찾아 그것이 항상 옳은지 묻는 질문을 생성하세요.",
    selectionRule: { triggers: ["숨은 전제", "암묵적 가정"] },
    sortOrder: 4,
  },
  {
    name: "counterexample",
    displayName: "Counterexample",
    description: "지나친 일반화에 반례를 제시하거나 찾도록 유도",
    purpose: "학습자가 자신의 주장의 한계와 예외를 인식할 수 있는지 확인",
    generationGoal: "학습자의 일반화된 주장에 반례가 될 수 있는 상황을 제시하거나 찾도록 유도",
    promptInstruction: "학습자의 일반화된 주장에 대해 반례나 예외 상황을 생각해보도록 유도하는 질문을 생성하세요.",
    selectionRule: { triggers: ["과도한 일반화", "절대적 주장"] },
    sortOrder: 5,
  },
  {
    name: "consistency",
    displayName: "Consistency",
    description: "이전 답변과의 논리적 일관성을 점검하도록 유도",
    purpose: "학습자가 자신의 사고의 일관성을 유지하고 모순을 인식할 수 있는지 확인",
    generationGoal: "이전 답변과 현재 답변 사이의 모순이나 불일치를 지적하고 해소하도록 유도",
    promptInstruction: "학습자의 이전 답변과 현재 답변 사이의 모순이나 불일치를 지적하고 어떻게 조화시킬 수 있는지 묻는 질문을 생성하세요.",
    selectionRule: { triggers: ["논리적 모순", "앞뒤 불일치"] },
    sortOrder: 6,
  },
  {
    name: "perspective",
    displayName: "Perspective",
    description: "다양한 관점에서 문제를 바라보도록 유도",
    purpose: "학습자가 단일 관점을 넘어 다양한 시각으로 문제를 볼 수 있는지 확인",
    generationGoal: "학습자가 고려하지 않은 다른 관점이나 입장에서 문제를 바라보도록 유도",
    promptInstruction: "학습자가 제시한 관점 외에 다른 사람이나 집단의 관점에서는 어떻게 볼 수 있는지 묻는 질문을 생성하세요.",
    selectionRule: { triggers: ["좁은 관점", "단일 시각"] },
    sortOrder: 7,
  },
  {
    name: "implication",
    displayName: "Implication",
    description: "주장이나 개념의 결과와 함의를 탐색하도록 유도",
    purpose: "학습자가 개념이나 주장의 결과와 영향을 예측하고 분석할 수 있는지 확인",
    generationGoal: "학습자의 주장이나 개념이 가져올 결과나 함의를 탐색하는 질문 생성",
    promptInstruction: "학습자의 주장이나 개념이 실제로 적용된다면 어떤 결과나 영향이 있을지 묻는 질문을 생성하세요.",
    selectionRule: { triggers: ["결과 예측 부족", "영향 분석 필요"] },
    sortOrder: 8,
  },
  {
    name: "value",
    displayName: "Value",
    description: "가치 판단의 기준과 근거를 명확히 하도록 유도",
    purpose: "학습자가 자신의 가치 판단의 기준을 인식하고 설명할 수 있는지 확인",
    generationGoal: "학습자의 가치 판단에 내재된 기준과 근거를 드러내는 질문 생성",
    promptInstruction: "학습자의 가치 판단에 대해 어떤 기준으로 그렇게 판단하는지, 그 기준이 왜 중요한지 묻는 질문을 생성하세요.",
    selectionRule: { triggers: ["불명확한 가치 기준", "가치 판단 필요"] },
    sortOrder: 9,
  },
  {
    name: "synthesis",
    displayName: "Synthesis",
    description: "여러 개념을 통합하고 종합적으로 설명하도록 유도",
    purpose: "학습자가 개별 개념들을 연결하고 통합적으로 이해할 수 있는지 확인",
    generationGoal: "학습한 여러 개념들을 연결하고 통합적으로 설명하도록 유도하는 질문 생성",
    promptInstruction: "학습자가 배운 여러 개념들을 연결하여 전체적인 그림을 설명하도록 유도하는 질문을 생성하세요.",
    selectionRule: { triggers: ["학습 후 정리 필요", "개념 통합 필요"] },
    sortOrder: 10,
  },
  {
    name: "application",
    displayName: "Application",
    description: "학습한 개념을 실제 상황에 적용하도록 유도",
    purpose: "학습자가 추상적 개념을 구체적 상황에 적용할 수 있는지 확인",
    generationGoal: "학습한 개념을 실제 상황이나 새로운 맥락에 적용하는 질문 생성",
    promptInstruction: "학습자가 배운 개념을 실제 상황이나 구체적 예시에 적용해보도록 유도하는 질문을 생성하세요.",
    selectionRule: { triggers: ["실제 적용 필요", "추상적 이해만 있음"] },
    sortOrder: 11,
  },
  {
    name: "reflection",
    displayName: "Reflection",
    description: "학습 과정과 사고 변화를 돌아보도록 유도",
    purpose: "학습자가 자신의 학습 과정과 사고 변화를 메타인지적으로 인식할 수 있는지 확인",
    generationGoal: "학습 후 자신의 사고가 어떻게 변화했는지, 무엇을 배웠는지 돌아보도록 유도",
    promptInstruction: "학습자가 이번 학습을 통해 자신의 생각이 어떻게 변화했는지, 새롭게 깨달은 것이 무엇인지 묻는 질문을 생성하세요.",
    selectionRule: { triggers: ["세션 마무리", "학습 정리 필요"] },
    sortOrder: 12,
  },
];

// 기존 데이터 확인
const [existing] = await conn.execute("SELECT COUNT(*) as cnt FROM questionTypes");
if (existing[0].cnt > 0) {
  console.log(`⏭ questionTypes already seeded (${existing[0].cnt} records), skipping...`);
} else {
  for (const qt of questionTypes) {
    await conn.execute(
      `INSERT INTO questionTypes (name, displayName, description, purpose, generationGoal, promptInstruction, selectionRuleJson, sortOrder, defaultEnabled, isSystemDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [qt.name, qt.displayName, qt.description, qt.purpose, qt.generationGoal, qt.promptInstruction, JSON.stringify(qt.selectionRule), qt.sortOrder]
    );
  }
  console.log(`✅ Seeded ${questionTypes.length} question types`);
}

// ============================================================
// 2. 6개 평가요소 시드
// ============================================================
const evaluationDimensions = [
  {
    name: "accuracy",
    displayName: "개념 이해의 정확성",
    description: "학습자가 핵심 개념의 정의, 속성, 경계를 얼마나 정확하게 이해하고 있는지 평가합니다. 오개념이나 혼동 없이 개념의 본질을 올바르게 파악하고 설명할 수 있는 능력을 측정합니다.",
    rubrics: {
      5: "개념을 완전히 정확하게 이해하고 핵심 속성을 모두 포함하여 설명",
      4: "개념을 대체로 정확하게 이해하고 주요 속성을 포함하여 설명",
      3: "개념을 부분적으로 이해하고 일부 속성만 설명",
      2: "개념에 대한 이해가 불완전하거나 일부 오류 포함",
      1: "개념에 대한 이해가 매우 부족하거나 심각한 오류 포함",
      0: "개념을 전혀 이해하지 못하거나 응답 없음",
    },
  },
  {
    name: "reasoning",
    displayName: "논리적 설명",
    description: "학습자가 개념들 사이의 인과관계, 논리적 흐름, 전제와 결론을 체계적으로 연결하는 능력을 평가합니다. 단순 암기가 아닌 왜 그런가에 대한 논리적 사고 과정을 측정합니다.",
    rubrics: {
      5: "논리적 흐름이 명확하고 체계적이며 일관성 있게 사고를 전개",
      4: "대체로 논리적이고 사고의 흐름이 명확함",
      3: "부분적으로 논리적이나 일부 비약이나 불일치 존재",
      2: "논리적 흐름이 약하거나 여러 비약이 존재",
      1: "논리적 연결이 거의 없거나 매우 불명확",
      0: "논리적 사고의 흔적이 없음",
    },
  },
  {
    name: "evidence",
    displayName: "근거 제시",
    description: "학습자가 자신의 주장이나 설명을 뒷받침하기 위해 구체적인 사례, 데이터, 이론적 근거를 제시하는 능력을 평가합니다. 주장과 근거 사이의 연결성과 근거의 적절성을 측정합니다.",
    rubrics: {
      5: "구체적이고 적절한 근거를 충분히 제시하며 주장과 명확히 연결",
      4: "적절한 근거를 제시하고 주장과 연결",
      3: "일부 근거를 제시하나 불충분하거나 연결이 약함",
      2: "근거가 매우 부족하거나 주장과 연결이 약함",
      1: "근거가 거의 없거나 부적절함",
      0: "근거를 전혀 제시하지 않음",
    },
  },
  {
    name: "clarity",
    displayName: "표현의 명확성",
    description: "학습자가 복잡한 개념이나 아이디어를 상대방이 이해하기 쉽도록 명확하고 구조적으로 표현하는 능력을 평가합니다. 모호한 표현 없이 핵심을 간결하게 전달하는 의사소통 능력을 측정합니다.",
    rubrics: {
      5: "매우 명확하고 이해하기 쉬운 표현으로 생각을 전달",
      4: "대체로 명확하고 이해하기 쉬운 표현",
      3: "부분적으로 명확하나 일부 모호하거나 불명확한 표현 존재",
      2: "표현이 모호하거나 이해하기 어려운 부분이 많음",
      1: "표현이 매우 불명확하거나 이해하기 어려움",
      0: "표현이 전혀 명확하지 않음",
    },
  },
  {
    name: "depth",
    displayName: "사고의 깊이",
    description: "학습자가 표면적 정의를 넘어 개념의 함의, 한계, 맥락, 다른 개념과의 관계를 탐구하는 능력을 평가합니다. 비판적 시각과 메타인지적 성찰을 포함한 심층적 이해 수준을 측정합니다.",
    rubrics: {
      5: "표면적 이해를 넘어 심층적 분석과 통찰을 보여줌",
      4: "상당한 깊이의 사고와 분석을 보여줌",
      3: "기본적 이해를 넘어 일부 심층적 사고를 보여줌",
      2: "표면적 이해에 그치거나 깊이가 부족함",
      1: "매우 표면적인 이해만 보여줌",
      0: "사고의 깊이가 전혀 없음",
    },
  },
  {
    name: "application",
    displayName: "실제 적용 가능성",
    description: "학습자가 추상적으로 학습한 개념을 새로운 상황, 실제 문제, 다른 분야에 창의적으로 적용하는 능력을 평가합니다. 전이 학습과 문제 해결 능력을 통해 지식의 실용적 활용도를 측정합니다.",
    rubrics: {
      5: "학습한 개념을 다양한 실제 상황에 창의적으로 적용",
      4: "학습한 개념을 실제 상황에 적절히 적용",
      3: "학습한 개념을 일부 실제 상황에 적용하나 제한적",
      2: "실제 적용 시도는 있으나 연결이 약하거나 부적절",
      1: "실제 적용 능력이 매우 부족함",
      0: "실제 적용 능력을 전혀 보여주지 않음",
    },
  },
];

const [existingDim] = await conn.execute("SELECT COUNT(*) as cnt FROM evaluationDimensions");
if (existingDim[0].cnt > 0) {
  console.log(`⏭ evaluationDimensions already seeded (${existingDim[0].cnt} records), skipping...`);
} else {
  for (const dim of evaluationDimensions) {
    await conn.execute(
      `INSERT INTO evaluationDimensions (name, displayName, description, rubricsJson, enabled, isSystemDefault)
       VALUES (?, ?, ?, ?, 1, 1)`,
      [dim.name, dim.displayName, dim.description, JSON.stringify(dim.rubrics)]
    );
  }
  console.log(`✅ Seeded ${evaluationDimensions.length} evaluation dimensions`);
}

// ============================================================
// 3. 가중치 매트릭스 시드 (12 질문유형 × 6 평가요소)
// ============================================================
// 각 질문유형별 평가요소 가중치 (합계 100)
// accuracy, reasoning, evidence, clarity, depth, application
const weightMatrix = {
  definition:     [35, 20, 15, 20, 10, 0],
  clarification:  [25, 20, 15, 30, 10, 0],
  justification:  [15, 25, 35, 15, 10, 0],
  assumption:     [15, 30, 25, 15, 15, 0],
  counterexample: [20, 25, 25, 15, 15, 0],
  consistency:    [20, 35, 20, 15, 10, 0],
  perspective:    [15, 20, 20, 15, 20, 10],
  implication:    [15, 20, 20, 15, 20, 10],
  value:          [15, 25, 25, 15, 20, 0],
  synthesis:      [25, 25, 15, 15, 20, 0],
  application:    [15, 20, 15, 15, 15, 20],
  reflection:     [15, 20, 15, 20, 20, 10],
};

const [existingWeights] = await conn.execute("SELECT COUNT(*) as cnt FROM questionTypeDimensionWeights");
if (existingWeights[0].cnt > 0) {
  console.log(`⏭ questionTypeDimensionWeights already seeded (${existingWeights[0].cnt} records), skipping...`);
} else {
  // 질문유형 ID 조회
  const [qtRows] = await conn.execute("SELECT id, name FROM questionTypes ORDER BY sortOrder");
  const [dimRows] = await conn.execute("SELECT id, name FROM evaluationDimensions");
  const dimOrder = ["accuracy", "reasoning", "evidence", "clarity", "depth", "application"];

  for (const qt of qtRows) {
    const weights = weightMatrix[qt.name];
    if (!weights) continue;
    for (let i = 0; i < dimOrder.length; i++) {
      const dim = dimRows.find(d => d.name === dimOrder[i]);
      if (!dim) continue;
      await conn.execute(
        `INSERT INTO questionTypeDimensionWeights (questionTypeId, evaluationDimensionId, weight) VALUES (?, ?, ?)`,
        [qt.id, dim.id, weights[i]]
      );
    }
  }
  console.log(`✅ Seeded weight matrix (${qtRows.length} × ${dimRows.length})`);
}

// ============================================================
// 4. 기본 정책 시드 (global default)
// ============================================================
const [existingPolicies] = await conn.execute("SELECT COUNT(*) as cnt FROM socraticEvaluationPolicies");
if (existingPolicies[0].cnt > 0) {
  console.log(`⏭ socraticEvaluationPolicies already seeded (${existingPolicies[0].cnt} records), skipping...`);
} else {
  const [qtRows] = await conn.execute("SELECT id FROM questionTypes ORDER BY sortOrder");
  const [dimRows] = await conn.execute("SELECT id FROM evaluationDimensions");
  const allQtIds = qtRows.map(r => r.id);
  const allDimIds = dimRows.map(r => r.id);

  const policies = [
    {
      name: "Socratic Default",
      description: "소크라테스식 문답을 통한 깊이 있는 개념 이해와 비판적 사고 개발",
      mode: "socratic",
      questionSequence: ["definition", "clarification", "justification", "assumption", "counterexample", "synthesis", "reflection"],
      questionFrequency: { definition: 15, clarification: 10, justification: 20, assumption: 15, counterexample: 10, consistency: 5, perspective: 5, implication: 5, value: 5, synthesis: 5, application: 5, reflection: 0 },
      constraints: { maxQuestionsPerSession: 15, minQuestionsForCompletion: 5, allowLearnerQuestions: true },
      moduleCompletionRules: { minQuestionsAnswered: 5, allowManualFinish: true },
      moduleScoreFormula: { questionEvaluationAverage: 50, coreConceptMastery: 20, improvementTrend: 15, misconceptionResolution: 10, questionTypeDiversity: 5 },
      isDefault: 1,
    },
    {
      name: "Exam Prep",
      description: "시험 준비를 위한 핵심 개념 정확성과 근거 제시 중심 학습",
      mode: "exam_prep",
      questionSequence: ["definition", "clarification", "justification", "counterexample", "synthesis"],
      questionFrequency: { definition: 25, clarification: 20, justification: 25, assumption: 5, counterexample: 10, consistency: 5, perspective: 0, implication: 5, value: 0, synthesis: 5, application: 0, reflection: 0 },
      constraints: { maxQuestionsPerSession: 20, minQuestionsForCompletion: 8, allowLearnerQuestions: false },
      moduleCompletionRules: { minQuestionsAnswered: 8, allowManualFinish: true },
      moduleScoreFormula: { questionEvaluationAverage: 60, coreConceptMastery: 25, improvementTrend: 10, misconceptionResolution: 5, questionTypeDiversity: 0 },
      isDefault: 0,
    },
    {
      name: "Project-Based",
      description: "프로젝트 기반 학습을 위한 적용과 함의 중심 탐구",
      mode: "project",
      questionSequence: ["definition", "application", "implication", "perspective", "synthesis", "reflection"],
      questionFrequency: { definition: 10, clarification: 5, justification: 15, assumption: 5, counterexample: 5, consistency: 5, perspective: 15, implication: 15, value: 10, synthesis: 10, application: 5, reflection: 0 },
      constraints: { maxQuestionsPerSession: 12, minQuestionsForCompletion: 6, allowLearnerQuestions: true },
      moduleCompletionRules: { minQuestionsAnswered: 6, allowManualFinish: true },
      moduleScoreFormula: { questionEvaluationAverage: 40, coreConceptMastery: 15, improvementTrend: 20, misconceptionResolution: 10, questionTypeDiversity: 15 },
      isDefault: 0,
    },
    {
      name: "Critical Thinking",
      description: "비판적 사고력 강화를 위한 가정, 반례, 일관성 중심 학습",
      mode: "critical_thinking",
      questionSequence: ["justification", "assumption", "counterexample", "consistency", "perspective", "value", "reflection"],
      questionFrequency: { definition: 5, clarification: 5, justification: 20, assumption: 20, counterexample: 15, consistency: 15, perspective: 10, implication: 5, value: 5, synthesis: 0, application: 0, reflection: 0 },
      constraints: { maxQuestionsPerSession: 15, minQuestionsForCompletion: 7, allowLearnerQuestions: true },
      moduleCompletionRules: { minQuestionsAnswered: 7, allowManualFinish: true },
      moduleScoreFormula: { questionEvaluationAverage: 45, coreConceptMastery: 15, improvementTrend: 20, misconceptionResolution: 15, questionTypeDiversity: 5 },
      isDefault: 0,
    },
  ];

  for (const p of policies) {
    await conn.execute(
      `INSERT INTO socraticEvaluationPolicies 
       (courseType, name, description, mode, enabledQuestionTypeIdsJson, enabledDimensionIdsJson, 
        questionSequenceJson, questionFrequencyJson, constraintsJson, moduleCompletionRulesJson, 
        moduleScoreFormulaJson, isDefault)
       VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.name, p.description, p.mode,
        JSON.stringify(allQtIds), JSON.stringify(allDimIds),
        JSON.stringify(p.questionSequence), JSON.stringify(p.questionFrequency),
        JSON.stringify(p.constraints), JSON.stringify(p.moduleCompletionRules),
        JSON.stringify(p.moduleScoreFormula), p.isDefault,
      ]
    );
  }
  console.log(`✅ Seeded ${policies.length} evaluation policies`);
}

await conn.end();
console.log("\n✅ Socratic seed complete!");
