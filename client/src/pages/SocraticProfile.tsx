import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, Brain, Target, TrendingUp, Award, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";

const QUESTION_TYPE_LABELS: Record<string, string> = {
  definition: "정의",
  clarification: "명료화",
  justification: "근거",
  assumption: "전제",
  counterexample: "반례",
  consistency: "일관성",
  perspective: "관점",
  implication: "함의",
  value: "가치",
  synthesis: "종합",
  application: "적용",
  reflection: "성찰",
};

const DIMENSION_LABELS: Record<string, string> = {
  accuracy: "정확성",
  reasoning: "추론",
  evidence: "근거",
  clarity: "명확성",
  depth: "깊이",
  application: "적용",
};

const LEVEL_COLORS: Record<string, string> = {
  Mastery: "text-green-700 bg-green-50 border-green-200",
  Proficient: "text-blue-700 bg-blue-50 border-blue-200",
  Developing: "text-yellow-700 bg-yellow-50 border-yellow-200",
  Beginning: "text-red-700 bg-red-50 border-red-200",
};

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 h-1.5">
        <div
          className="h-1.5 swiss-red-bg transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-bold w-8 text-right">{score}</span>
    </div>
  );
}

export default function SocraticProfile() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [expandedEval, setExpandedEval] = useState<number | null>(null);

  const { data: profile, isLoading: profileLoading } = trpc.socratic.getLearnerProfile.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: evaluations, isLoading: evalsLoading } = trpc.socratic.getLearnerEvaluations.useQuery(
    { limit: 20 },
    { enabled: isAuthenticated }
  );

  const isLoading = profileLoading || evalsLoading;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="swiss-label">로그인이 필요합니다.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 swiss-red-bg animate-pulse" />
          <span className="swiss-label">프로필 로딩 중...</span>
        </div>
      </div>
    );
  }

  const profileData = profile?.profile ?? null;
  const stats = (profileData?.questionTypeScoresJson as Record<string, number>) ?? {};
  const dimStats = (profileData?.dimensionScoresJson as Record<string, number>) ?? {};
  const strengths = (profileData?.dominantStrengthsJson as string[]) ?? [];
  const weaknesses = (profileData?.recurringWeaknessesJson as string[]) ?? [];
  const totalEvals = profileData?.totalQuestionsAnswered ?? 0;
  const avgScore = profileData?.slciScore ?? 0;
  const dominantLevel = profileData?.slciLevel ?? "Fragmented";
  // 질문유형별 통계를 점수 맵으로 변환
  const typeStatsMap: Record<string, { count: number; avgScore: number }> = {};
  for (const [k, v] of Object.entries(stats)) {
    typeStatsMap[k] = { count: 1, avgScore: typeof v === "number" ? v : 0 };
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-50">
        <div className="max-w-5xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 swiss-label hover:text-black transition-colors"
            >
              <ArrowLeft size={12} /> 대시보드
            </button>
            <div className="w-px h-4 bg-black" />
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-red-600" />
              <span className="text-sm font-bold">Socratic Profile</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-8 py-10">
        {totalEvals === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Brain size={40} className="text-gray-200" />
            <p className="swiss-label text-gray-400">아직 평가 데이터가 없습니다.</p>
            <p className="text-xs text-gray-400">학습 세션을 진행하면 Socratic Profile이 생성됩니다.</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="mt-4 border border-black px-6 py-2 text-xs font-bold hover:bg-black hover:text-white transition-colors"
            >
              학습 시작하기
            </button>
          </div>
        ) : (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-3 gap-6 mb-10">
              <div className="border-2 border-black p-6">
                <div className="swiss-label mb-2">총 평가 횟수</div>
                <div className="text-4xl font-black">{totalEvals}</div>
                <div className="text-xs text-gray-400 mt-1">답변 평가 완료</div>
              </div>
              <div className="border-2 border-black p-6">
                <div className="swiss-label mb-2">평균 점수</div>
                <div className="text-4xl font-black">{Math.round(avgScore)}</div>
                <div className="text-xs text-gray-400 mt-1">/ 100점</div>
              </div>
              <div className="border-2 border-black p-6">
                <div className="swiss-label mb-2">학습 수준</div>
                    <div className={`inline-block text-sm font-bold px-3 py-1 border mt-1 ${LEVEL_COLORS[dominantLevel ?? "Developing"] ?? "text-gray-700 bg-gray-50 border-gray-200"}`}>
                  {dominantLevel}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-10">
              {/* Dimension scores */}
              <div className="border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Target size={14} />
                  <span className="swiss-label">평가 요소별 점수</span>
                </div>
                <div className="space-y-4">
                  {Object.entries(dimStats).map(([dim, score]) => (
                    <div key={dim}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-600">{DIMENSION_LABELS[dim] ?? dim}</span>
                      </div>
                      <ScoreBar score={Math.round(score)} />
                    </div>
                  ))}
                  {Object.keys(dimStats).length === 0 && (
                    <p className="text-xs text-gray-400">데이터 없음</p>
                  )}
                </div>
              </div>

              {/* Question type stats */}
              <div className="border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp size={14} />
                  <span className="swiss-label">질문 유형별 성취도</span>
                </div>
                <div className="space-y-4">
                  {Object.entries(typeStatsMap).map(([type, s]) => (
                    <div key={type}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-600">
                          {QUESTION_TYPE_LABELS[type] ?? type}
                        </span>
                      </div>
                      <ScoreBar score={Math.round(s.avgScore)} />
                    </div>
                  ))}
                  {Object.keys(stats).length === 0 && (
                    <p className="text-xs text-gray-400">데이터 없음</p>
                  )}
                </div>
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            {(strengths.length > 0 || weaknesses.length > 0) && (
              <div className="grid grid-cols-2 gap-8 mb-10">
                <div className="border border-green-200 p-6 bg-green-50">
                  <div className="flex items-center gap-2 mb-4">
                    <Award size={14} className="text-green-600" />
                    <span className="swiss-label text-green-700">강점</span>
                  </div>
                  <ul className="space-y-2">
                    {strengths.slice(0, 5).map((s, i) => (
                      <li key={i} className="text-xs text-green-800 flex items-start gap-2">
                        <span className="mt-0.5 flex-shrink-0">·</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border border-orange-200 p-6 bg-orange-50">
                  <div className="flex items-center gap-2 mb-4">
                    <Target size={14} className="text-orange-600" />
                    <span className="swiss-label text-orange-700">개선 영역</span>
                  </div>
                  <ul className="space-y-2">
                    {weaknesses.slice(0, 5).map((w, i) => (
                      <li key={i} className="text-xs text-orange-800 flex items-start gap-2">
                        <span className="mt-0.5 flex-shrink-0">·</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Recent evaluations */}
            {evaluations && evaluations.length > 0 && (
              <div>
                <div className="swiss-label mb-4">최근 평가 이력</div>
                <div className="space-y-3">
                  {evaluations.map((ev) => {
                    const isExpanded = expandedEval === ev.id;
                    const dimScores = (ev.dimensionScoresJson as Record<string, number>) ?? {};
                    const evStrengths = (ev.strengthsJson as string[]) ?? [];
                    const evWeaknesses = (ev.weaknessesJson as string[]) ?? [];
                    const qtSnapshot = ev.questionTypeSnapshotJson as { displayName?: string } | null;
                    return (
                      <div key={ev.id} className="border border-gray-200">
                        <button
                          className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedEval(isExpanded ? null : ev.id)}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`text-xs px-2 py-0.5 border font-medium ${LEVEL_COLORS[ev.level ?? "Developing"] ?? ""}`}>
                              {ev.level}
                            </span>
                            <span className="text-xs text-gray-500">{qtSnapshot?.displayName ?? "질문"}</span>
                            <span className="text-xs text-gray-400 truncate max-w-xs">{ev.responseText?.slice(0, 60)}...</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold">{ev.weightedScore}점</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-gray-100 p-4 bg-gray-50">
                            {/* Dimension scores */}
                            <div className="grid grid-cols-3 gap-3 mb-4">
                              {Object.entries(dimScores).map(([dim, score]) => (
                                <div key={dim} className="text-center">
                                  <div className="text-xs text-gray-500 mb-1">{DIMENSION_LABELS[dim] ?? dim}</div>
                                  <div className="text-lg font-bold">{score}<span className="text-xs text-gray-400">/5</span></div>
                                </div>
                              ))}
                            </div>
                            {ev.evaluationComment && (
                              <div className="mb-3">
                                <div className="swiss-label mb-1">평가 코멘트</div>
                                <p className="text-xs text-gray-700 leading-relaxed">{ev.evaluationComment}</p>
                              </div>
                            )}
                            {evStrengths.length > 0 && (
                              <div className="mb-2">
                                <span className="text-xs font-bold text-green-700">강점: </span>
                                <span className="text-xs text-gray-600">{evStrengths.join(", ")}</span>
                              </div>
                            )}
                            {evWeaknesses.length > 0 && (
                              <div>
                                <span className="text-xs font-bold text-orange-700">개선점: </span>
                                <span className="text-xs text-gray-600">{evWeaknesses.join(", ")}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
