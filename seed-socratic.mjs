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
    description: "단순 암기식 정의를 넘어, 학습자가 개념의 '필수 속성'과 '부수 속성'을 구분할 수 있는지, 유사하거나 관련된 개념과 어떻게 다른지, 그리고 경계 사례(borderline case)를 통해 개념의 외연을 정확히 파악하는지를 탐색한다. 학습자가 교재의 정의를 그대로 반복하는 것이 아니라, 자신의 언어로 재구성하고 그 의미를 설명할 수 있는지가 핵심이다.",
    purpose: "학습자가 개념을 자신의 말로 정확히 정의하고, 유사 개념과 구분하며, 경계 사례(borderline case)를 통해 개념의 본질적 속성을 이해",
    generationGoal: "개념의 본질적 속성과 경계를 명확히 하는 질문 생성",
    promptInstruction: "학습자의 답변을 분석하여 다음 중 하나 이상을 탐색하는 심층 정의 질문을 생성하세요: (1) 이 개념에 반드시 포함되어야 하는 속성과 없어도 되는 속성을 구분하기, (2) 유사하거나 자주 혼동되는 개념과의 결정적 차이 설명하기, (3) 경계 사례(borderline case) — 이 개념에 해당하는지 판단이 어려운 사례 — 를 통해 개념의 경계 탐색하기, (4) 교재의 정의를 그대로 쓰지 않고 자신의 언어로 재구성하기. 질문은 학습자가 개념의 본질적 속성을 스스로 발견하도록 유도해야 하며, 단순히 '정의를 말해보세요'가 아닌 구체적인 사례나 비교를 통해 탐색하도록 설계하세요.",
    selectionRule: { triggers: ["처음 접한 개념", "개념 이해 부족"] },
    sortOrder: 1,
  },
  {
    name: "clarification",
    displayName: "Clarification",
    description: "학습자가 사용한 단어나 표현이 여러 의미로 해석될 수 있을 때, 또는 주장의 범위가 불분명할 때 이를 명료화하도록 요청한다. '항상', '대부분', '일반적으로' 같은 한정어의 정확한 의미, '이것', '그것' 같은 지시어가 가리키는 대상, 그리고 주장이 모든 경우에 적용되는지 특정 조건에서만 유효한지를 탐색한다.",
    purpose: "학습자의 답변에서 모호하거나 불명확한 표현을 구체화하고, 사용된 용어의 의미를 정확히 파악하며, 주장의 범위와 조건을 명료화",
    generationGoal: "학습자가 사용한 용어나 표현의 의미를 더 구체적으로 설명하도록 유도",
    promptInstruction: "학습자의 답변에서 모호하거나 불명확한 표현을 찾아 명료화를 요청하는 질문을 생성하세요: (1) 모호한 단어나 표현을 직접 인용하고 '이때 [표현]이 정확히 무엇을 의미하는지 설명해주실 수 있나요?'와 같이 구체화 요청, (2) '항상', '대부분', '일반적으로' 등 한정어가 있다면 그 범위와 예외 조건 탐색, (3) 지시어('이것', '그것', '이 경우')가 가리키는 대상을 명확히 하도록 요청, (4) 주장이 모든 상황에 적용되는 보편적 주장인지, 특정 조건이나 맥락에서만 유효한 제한적 주장인지 구분. 학습자가 자신의 표현을 더 정확하고 구체적으로 다듬도록 유도하되, 비판이 아닌 탐구의 방식으로 질문하세요.",
    selectionRule: { triggers: ["모호한 표현", "불명확한 답변"] },
    sortOrder: 2,
  },
  {
    name: "justification",
    displayName: "Justification",
    description: "학습자가 주장을 제시했을 때, 그 주장을 지지하는 근거가 충분한지, 근거와 주장 사이의 논리적 연결이 타당한지를 탐색한다. 단순히 '왜 그렇게 생각하나요?'를 묻는 것을 넘어, 제시된 근거가 주장을 실제로 지지하는지, 더 강력한 근거가 있는지, 그리고 반대 근거는 어떻게 처리할지를 탐색한다.",
    purpose: "학습자가 자신의 주장을 뒷받침하는 근거의 질과 적절성을 평가하고, 근거와 주장 사이의 논리적 연결을 강화하며, 반론에 대응할 수 있는지 확인",
    generationGoal: "학습자의 주장에 대해 왜 그렇게 생각하는지, 어떤 근거가 있는지 묻는 질문 생성",
    promptInstruction: "학습자의 주장에 대한 근거의 질과 논리적 연결을 탐색하는 질문을 생성하세요: (1) 제시된 근거가 주장을 실제로 지지하는지, 아니면 관련은 있지만 결정적이지 않은지 검토 요청, (2) '그 근거 외에 이 주장을 더 강하게 뒷받침할 수 있는 증거나 사례가 있나요?', (3) 이 주장에 반대하는 사람이 제시할 수 있는 가장 강력한 반론은 무엇이고, 그 반론에 어떻게 응답할지, (4) 근거가 특정 조건에서만 유효하다면, 그 조건이 충족되지 않을 때 주장은 어떻게 달라지는지. 학습자가 자신의 주장을 더 엄밀하게 검토하고, 근거의 강도와 한계를 스스로 평가하도록 유도하세요.",
    selectionRule: { triggers: ["근거 없는 주장", "설명 부족"] },
    sortOrder: 3,
  },
  {
    name: "assumption",
    displayName: "Assumption",
    description: "모든 주장에는 명시적으로 언급되지 않은 전제들이 숨어 있다. 학습자가 당연하게 받아들이는 것들 — 배경 지식, 가치 판단, 인과 관계에 대한 믿음 등 — 을 수면 위로 끌어올려 검토한다. 특히 전제가 잘못되거나 맥락에 따라 달라질 수 있을 때, 그것이 결론에 어떤 영향을 미치는지를 탐색한다.",
    purpose: "학습자의 주장이나 추론 과정에서 명시되지 않은 전제를 드러내고, 그 전제가 타당한지, 전제가 바뀌면 결론이 어떻게 달라지는지 탐색",
    generationGoal: "학습자의 답변 뒤에 숨겨진 가정이나 전제를 드러내는 질문 생성",
    promptInstruction: "학습자의 주장이나 추론에서 숨겨진 전제를 찾아 탐색하는 질문을 생성하세요: (1) '이 주장이 성립하려면 [전제 X]가 참이어야 하는 것 같은데, 이 전제는 항상 유효한가요?', (2) 학습자가 당연하게 받아들이는 인과 관계나 배경 지식을 명시적으로 드러내고 그 타당성 검토, (3) 만약 이 전제가 틀렸다면, 또는 다른 전제를 채택한다면 결론이 어떻게 달라지는지, (4) 이 전제가 특정 문화, 시대, 또는 맥락에서만 유효하고 다른 상황에서는 적용되지 않을 수 있는지. 전제를 드러내는 것이 주장을 공격하는 것이 아니라 더 견고하게 만드는 과정임을 인식하도록 유도하세요.",
    selectionRule: { triggers: ["숨은 전제", "암묵적 가정"] },
    sortOrder: 4,
  },
  {
    name: "counterexample",
    displayName: "Counterexample",
    description: "학습자가 '항상', '모든', '반드시' 같은 보편적 주장을 할 때, 그 주장이 성립하지 않는 사례를 함께 탐색한다. 반례를 찾는 것은 주장을 무너뜨리는 것이 아니라, 주장의 적용 범위와 조건을 더 정확하게 설정하도록 돕는 과정이다. 반례 발견 후 원래 주장을 어떻게 수정하면 더 정확해지는지를 함께 탐색한다.",
    purpose: "학습자가 제시한 일반화나 규칙에 대한 반례를 탐색하고, 반례가 발견됐을 때 원래 주장을 어떻게 수정하거나 정교화할 수 있는지 탐색",
    generationGoal: "학습자의 일반화된 주장에 반례가 될 수 있는 상황을 제시하거나 찾도록 유도",
    promptInstruction: "학습자의 일반화나 규칙에 대한 반례를 탐색하는 질문을 생성하세요: (1) '이 규칙이 성립하지 않는 사례를 하나 생각해볼 수 있나요? 어떤 조건에서 예외가 발생할까요?', (2) 학습자가 제시한 주장의 보편성에 도전하는 구체적인 반례 상황을 직접 제시하고 어떻게 설명할지 요청, (3) 반례가 발견됐을 때, 원래 주장을 어떻게 수정하거나 조건을 추가하면 더 정확한 주장이 될 수 있는지, (4) 반례가 존재한다는 것이 원래 주장 전체를 무효화하는지, 아니면 적용 범위를 제한하는 것인지 구분. 반례 탐색이 비판이 아닌 주장을 더 정교하게 만드는 과정임을 강조하세요.",
    selectionRule: { triggers: ["과도한 일반화", "절대적 주장"] },
    sortOrder: 5,
  },
  {
    name: "consistency",
    displayName: "Consistency",
    description: "학습자의 이전 발언과 현재 발언을 비교하여 잠재적 불일치나 모순을 발견한다. 단순히 '앞뒤가 다르다'고 지적하는 것을 넘어, 두 주장이 진정으로 모순인지 맥락·조건의 차이로 설명 가능한지를 구분하고, 모순이라면 어느 쪽을 수정할지, 또는 두 주장을 포괄하는 더 정교한 입장은 무엇인지를 탐색한다.",
    purpose: "학습자가 하나의 사고 내에서 제시한 여러 주장 사이의 논리적 정합성을 점검하고, 모순을 인식하여 더 일관된 입장으로 발전시킬 수 있는지 확인",
    generationGoal: "이전 답변과 현재 답변 사이의 모순이나 불일치를 지적하고 해소하도록 유도",
    promptInstruction: "학습자의 이전 발언과 현재 발언을 비교하여 불일치를 찾아내고, 다음을 탐색하는 질문을 생성하세요: (1) '앞서 [A]라고 하셨는데, 지금은 [B]라고 하고 계십니다. 이 두 주장이 어떻게 함께 성립할 수 있나요?', (2) 두 주장이 진정한 모순인지, 아니면 적용 조건이나 맥락이 달라 둘 다 참일 수 있는지 구분, (3) 만약 모순이라면 어느 쪽 주장을 수정하거나 포기할 것이며, 그 이유는 무엇인지, (4) 두 주장을 모두 포괄하는 더 정교하고 일관된 입장으로 재구성한다면 어떻게 표현할지. 이전 발언의 내용을 직접 인용하여 질문에 포함하고, 학습자가 자신의 사고 전체를 하나의 일관된 체계로 발전시키도록 유도하세요.",
    selectionRule: { triggers: ["논리적 모순", "앞뒤 불일치"] },
    sortOrder: 6,
  },
  {
    name: "perspective",
    displayName: "Perspective",
    description: "학습자의 답변에서 특정 집단, 시대, 문화권, 또는 전공의 시각이 암묵적으로 전제되어 있음을 포착한다. 단순히 '다른 관점도 있다'는 인식에 그치는 것이 아니라, 관점의 차이가 왜 생기는지(이해관계, 경험, 가치관의 차이), 그리고 어떤 관점이 더 설득력 있고 왜 그런지를 비판적으로 검토하도록 유도한다.",
    purpose: "학습자가 자신이 암묵적으로 채택한 관점(시대, 문화, 역할, 이해관계 등)을 의식화하고, 다른 위치에 있는 행위자나 집단이 동일한 상황을 어떻게 다르게 해석하는지 탐색할 수 있는지 확인",
    generationGoal: "학습자가 고려하지 않은 다른 관점이나 입장에서 문제를 바라보도록 유도",
    promptInstruction: "학습자 답변에서 특정 관점이 전제된 것을 포착하고, 다음을 탐색하는 다관점 질문을 생성하세요: (1) 이해관계가 다른 구체적인 집단이나 인물(예: [집단 A] 대 [집단 B])의 관점에서 같은 상황을 어떻게 해석할지, (2) 다른 시대, 문화권, 또는 학문 분야에서는 이 문제에 어떻게 다르게 접근하는지, (3) 학습자의 관점이 특정 집단에게는 유리하고 다른 집단에게는 불리할 수 있는 이유 탐색, (4) 여러 관점 중 어느 것이 더 설득력 있다고 생각하는지와 그 판단 기준. 관점의 다양성을 나열하는 것을 넘어, 관점의 차이가 어디서 비롯되는지 이해하도록 유도하세요.",
    selectionRule: { triggers: ["좁은 관점", "단일 시각"] },
    sortOrder: 7,
  },
  {
    name: "implication",
    displayName: "Implication",
    description: "학습자의 주장이 옳다면 논리적으로 따라오는 것이 무엇인지, 실제로 구현된다면 어떤 변화가 오는지를 탐색한다. 의도된 결과뿐 아니라 처음에는 예상하지 못했던 부작용, 역설적 결과, 장기적 파급 효과까지 추적하며, 학습자가 자신의 입장에서 불편하더라도 논리적으로 받아들여야 하는 귀결까지 직면하도록 유도한다.",
    purpose: "학습자가 자신의 주장이나 개념이 논리적으로 함의하는 것, 실제 적용 시 발생하는 단기·장기적 결과와 의도치 않은 파급 효과를 체계적으로 추적할 수 있는지 확인",
    generationGoal: "학습자의 주장이나 개념이 가져올 결과나 함의를 탐색하는 질문 생성",
    promptInstruction: "학습자의 주장이나 개념이 논리적·현실적으로 이어지는 결과를 탐색하는 질문을 생성하세요: (1) '만약 당신의 주장이 완전히 옳다면, 논리적으로 반드시 따라오는 결론은 무엇인가요?', (2) 이 아이디어가 실제로 구현된다면 단기적으로는 어떤 변화가 오고, 5~10년 후에는 어떤 장기적 효과가 나타날지, (3) 처음에는 의도하지 않았지만 나중에 드러날 수 있는 부작용이나 역설적 결과는 무엇인지, (4) 이 함의들 중에서 학습자 본인이 받아들이기 불편하거나 문제가 있다고 느끼는 것은 무엇인지. 학습자가 자신의 입장의 논리적 귀결을 끝까지 추적하고, 그것과 정직하게 대면하도록 유도하세요.",
    selectionRule: { triggers: ["결과 예측 부족", "영향 분석 필요"] },
    sortOrder: 8,
  },
  {
    name: "value",
    displayName: "Value",
    description: "학습자의 판단이 어떤 가치 기준(효율성, 공정성, 자유, 공동체, 안전 등)에 기반하는지 드러낸다. 그 기준이 보편적인지 맥락 의존적인지, 두 가지 중요한 가치가 충돌할 때 어떻게 선택하는지, 그리고 다른 가치 체계를 가진 사람은 다른 판단을 내릴 것인지를 탐색한다. 가치 판단의 자의성을 인식하면서도 그것을 정당화할 수 있는 능력을 키우는 것이 목표이다.",
    purpose: "학습자가 자신의 가치 판단 뒤에 작동하는 기준을 명시화하고, 경쟁하는 가치들 사이에서의 우선순위와 그 근거를 비판적으로 성찰할 수 있는지 확인",
    generationGoal: "학습자의 가치 판단에 내재된 기준과 근거를 드러내는 질문 생성",
    promptInstruction: "학습자의 가치 판단을 분석하여 그 기준과 우선순위를 탐색하는 질문을 생성하세요: (1) '그것이 중요하다고 판단하셨는데, 어떤 가치 기준 — 예를 들어 효율성, 공정성, 자유, 공동체적 연대, 안전 중 어느 것을 우선시하고 있나요?', (2) 다른 가치 기준을 가진 사람이라면 동일한 상황에서 다른 판단을 내릴 것인지, 그 이유는 무엇인지, (3) 두 가지 중요한 가치가 충돌하는 상황(예: 개인의 자유 vs. 공동체의 안전)에서 어떻게 선택할지와 그 근거, (4) 이 가치 기준이 모든 문화권과 시대에 보편적으로 적용될 수 있는지, 아니면 특정 맥락에서만 유효한지. 학습자가 자신의 가치 체계를 의식적으로 성찰하고, 그것을 정당화하거나 수정할 수 있도록 유도하세요.",
    selectionRule: { triggers: ["불명확한 가치 기준", "가치 판단 필요"] },
    sortOrder: 9,
  },
  {
    name: "synthesis",
    displayName: "Synthesis",
    description: "학습자가 배운 여러 개념들을 분리된 지식으로 저장하는 것이 아니라, 그것들이 어떻게 서로 연결되고 강화하거나 긴장 관계를 이루는지 탐색한다. 개념들 사이의 구조적 유사성, 공통된 원리, 또는 상호 의존성을 발견하고, 통합을 통해 이전에는 보이지 않던 새로운 질문이나 통찰이 생기도록 유도한다.",
    purpose: "학습자가 개별적으로 학습한 개념·원리·사례들 사이의 연결 고리와 공통 패턴을 발견하고, 이를 통합하여 더 높은 차원의 이해나 새로운 통찰을 생성할 수 있는지 확인",
    generationGoal: "학습한 여러 개념들을 연결하고 통합적으로 설명하도록 유도하는 질문 생성",
    promptInstruction: "학습자가 다룬 여러 개념들을 연결하여 통합적 이해를 탐색하는 질문을 생성하세요: (1) '지금까지 다룬 [개념 A]와 [개념 B] 사이에는 어떤 공통된 원리나 패턴이 있나요?', (2) 하나의 개념을 깊이 이해하면 다른 개념을 이해하는 데 어떻게 도움이 되는지 또는 방해가 되는지, (3) 이 개념들을 통합했을 때 새롭게 보이는 것은 무엇인지, 또는 어떤 새로운 질문이 생기는지, (4) 지금까지 배운 내용을 하나의 통일된 프레임워크나 모델로 정리한다면 그 핵심 구조는 무엇인지. 개념들 사이의 긴장이나 모순도 통합의 소재가 될 수 있음을 인식하게 하고, 학습자가 단순히 개념을 나열하는 것이 아니라 구조와 관계를 설명하도록 유도하세요.",
    selectionRule: { triggers: ["학습 후 정리 필요", "개념 통합 필요"] },
    sortOrder: 10,
  },
  {
    name: "application",
    displayName: "Application",
    description: "단순히 '이 개념을 어디에 쓸 수 있나요?'를 묻는 것을 넘어, 실제 적용 과정에서 이론이 현실과 맞지 않는 부분, 개념이 잘 작동할 조건과 실패할 조건, 적용 시 내려야 할 판단이나 절충을 탐색한다. 학습자 자신의 경험, 관심사, 전공과 연결된 맥락 속에서 개념을 창의적이고 비판적으로 활용하도록 유도한다.",
    purpose: "학습자가 추상적 개념이나 원리를 구체적·복잡한 실제 상황에 창의적으로 적용하면서, 이론과 현실의 격차, 적용의 조건과 한계, 그리고 발생하는 trade-off를 비판적으로 평가할 수 있는지 확인",
    generationGoal: "학습한 개념을 실제 상황이나 새로운 맥락에 적용하는 질문 생성",
    promptInstruction: "학습자가 배운 개념을 구체적 상황에 적용하도록 유도하는 심층 질문을 생성하세요. 단순 적용 요청 대신: (1) 학습자 자신의 경험, 전공, 또는 관심사와 연결된 구체적인 상황을 제시하고 개념 적용을 요청, (2) '이 개념을 실제로 적용한다면, 이론과 현실 사이에서 어떤 부분이 가장 잘 맞지 않을 것 같나요?', (3) 이 개념이 가장 잘 작동할 조건과 적용에 실패할 가능성이 높은 조건을 함께 검토, (4) 적용 과정에서 반드시 내려야 할 판단이나 절충(trade-off)은 무엇이고 어떤 기준으로 선택할지. 학습자가 개념을 단순히 대입하는 것이 아니라, 맥락에 맞게 변형하고 비판적으로 평가하도록 유도하세요.",
    selectionRule: { triggers: ["실제 적용 필요", "추상적 이해만 있음"] },
    sortOrder: 11,
  },
  {
    name: "reflection",
    displayName: "Reflection",
    description: "'무엇을 배웠나요?'를 넘어, 학습 전에 가졌던 믿음이나 이해와 지금의 것을 비교하고, 어떤 계기(특정 사례, 반례, 관점의 충돌 등)가 사고 변화를 만들었는지를 탐색한다. 여전히 불확실하거나 이해되지 않는 영역을 솔직하게 인식하고, 이번 학습이 새로운 질문을 어떻게 촉발했는지를 성찰하는 메타인지 능력이 핵심이다.",
    purpose: "학습자가 학습 전후의 사고 변화를 메타인지적으로 인식하고, 변화를 촉발한 핵심 계기, 여전히 남은 불확실성, 그리고 새롭게 생긴 질문을 명료화할 수 있는지 확인",
    generationGoal: "학습 후 자신의 사고가 어떻게 변화했는지, 무엇을 배웠는지 돌아보도록 유도",
    promptInstruction: "학습자가 자신의 학습 과정과 사고 변화를 메타인지적으로 탐색하도록 유도하는 질문을 생성하세요: (1) '이 학습을 시작하기 전에 가졌던 생각과 지금의 생각이 어떻게 다른가요? 무엇이 그 변화를 만들었나요?', (2) 가장 이해하기 어려웠던 개념이나 순간은 무엇이었고, 어떻게 극복했는지(또는 아직 극복 중인지), (3) 이번 학습을 통해 새롭게 생긴 질문이나 더 알고 싶어진 주제 — 답을 얻었을 때 또 다른 질문이 생겼다면 그것은 무엇인지, (4) 이 내용을 처음 배우는 사람에게 가장 핵심적인 것 하나만 전달한다면 무엇을 말하겠는지(파인만 기법). 학습자가 자신의 이해 수준을 솔직하게 평가하고, 여전히 불확실한 영역을 두려움 없이 인식하도록 유도하세요.",
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
