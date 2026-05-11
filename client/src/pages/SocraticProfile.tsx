import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, Brain, Target, TrendingUp, Award, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const DIMENSION_LABELS: Record<string, string> = {
  accuracy: "정확성",
  reasoning: "추론",
  evidence: "근거",
  clarity: "명확성",
  depth: "깊이",
  application: "적용",
};

const LEVEL_COLORS: Record<string, string> = {
  Advanced: "text-green-700 bg-green-50 border-green-200",
  Proficient: "text-blue-700 bg-blue-50 border-blue-200",
  Developing: "text-yellow-700 bg-yellow-50 border-yellow-200",
  Emerging: "text-orange-700 bg-orange-50 border-orange-200",
  Fragmented: "text-red-700 bg-red-50 border-red-200",
};

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
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
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading } = trpc.socratic.getLearnerProfile.useQuery(
    undefined,
    { enabled: isAuthenticated, staleTime: 0, refetchOnMount: "always" }
  );

  const { data: evaluations, isLoading: evalsLoading } = trpc.socratic.getLearnerEvaluations.useQuery(
    { limit: 100 },
    { enabled: isAuthenticated, staleTime: 0, refetchOnMount: "always" }
  );

  const { data: modelStats } = trpc.session.getModelStats.useQuery(
    undefined,
    { enabled: isAuthenticated, staleTime: 0, refetchOnMount: "always" }
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

  // computedStats 우선 사용 (실시간 questionEvaluations 기반)
  const computed = profile?.computedStats ?? null;
  const profileData = profile?.profile ?? null;

  const totalEvals = computed?.totalAnswered ?? profileData?.totalQuestionsAnswered ?? 0;
  const avgScore = computed?.avgScore ?? profileData?.slciScore ?? 0;
  const dominantLevel = profileData?.slciLevel ?? (avgScore >= 80 ? "Advanced" : avgScore >= 65 ? "Proficient" : avgScore >= 50 ? "Developing" : avgScore >= 35 ? "Emerging" : totalEvals > 0 ? "Fragmented" : "—");

  const dimStats = computed?.dimScores ?? (profileData?.dimensionScoresJson as Record<string, number>) ?? {};
  const typeStats = computed?.typeScores ?? {};
  const strengths = computed?.allStrengths ?? (profileData?.dominantStrengthsJson as string[]) ?? [];
  const weaknesses = computed?.allWeaknesses ?? (profileData?.recurringWeaknessesJson as string[]) ?? [];

  // 질문유형별로 평가 이력 그룹화
  const evalsByType: Record<string, typeof evaluations> = {};
  if (evaluations) {
    for (const ev of evaluations) {
      const snap = ev.questionTypeSnapshotJson as { displayName?: string; name?: string } | null;
      const typeName = snap?.displayName ?? snap?.name ?? "기타";
      if (!evalsByType[typeName]) evalsByType[typeName] = [];
      evalsByType[typeName]!.push(ev);
    }
  }

  const hasData = totalEvals > 0;

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
              <span className="text-sm font-bold">QLOOP PROFILE</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-8 py-10">

        {/* 데이터 없음 안내 */}
        {!hasData && (
          <div className="mb-8 border border-gray-200 bg-gray-50 px-5 py-4 flex items-center gap-3">
            <span className="text-xs text-gray-500">아직 평가 데이터가 없습니다. 학습 세션을 진행하면 실제 데이터로 업데이트됩니다.</span>
            <button
              onClick={() => navigate("/dashboard")}
              className="ml-auto text-xs font-bold border border-gray-400 text-gray-600 px-3 py-1 hover:bg-gray-200 transition-colors"
            >
              학습 시작
            </button>
          </div>
        )}

        {/* Overview cards */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="border-2 border-black p-6">
            <div className="swiss-label mb-2">총 평가 횟수</div>
            <div className="text-4xl font-black">{totalEvals}</div>
            <div className="text-xs text-gray-400 mt-1">답변 평가 완료</div>
          </div>
          <div className="border-2 border-black p-6">
            <div className="swiss-label mb-2">평균 점수</div>
            <div className="text-4xl font-black">{hasData ? Math.round(avgScore) : "—"}</div>
            <div className="text-xs text-gray-400 mt-1">/ 100점</div>
          </div>
          <div className="border-2 border-black p-6">
            <div className="swiss-label mb-2">학습 수준</div>
            {hasData ? (
              <div className={`inline-block text-sm font-bold px-3 py-1 border mt-1 ${LEVEL_COLORS[dominantLevel] ?? "text-gray-700 bg-gray-50 border-gray-200"}`}>
                {dominantLevel}
              </div>
            ) : (
              <div className="text-2xl font-black text-gray-300 mt-1">—</div>
            )}
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
              {Object.entries(dimStats).length > 0 ? (
                Object.entries(dimStats).map(([dim, score]) => (
                  <div key={dim}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600">{DIMENSION_LABELS[dim] ?? dim}</span>
                    </div>
                    <ScoreBar score={Math.round(score)} />
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400">학습 세션을 완료하면 데이터가 표시됩니다.</p>
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
              {Object.entries(typeStats).length > 0 ? (
                Object.entries(typeStats).map(([type, s]) => (
                  <div key={type}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600">{type}</span>
                      <span className="text-xs text-gray-400">{s.count}회</span>
                    </div>
                    <ScoreBar score={Math.round(s.avgScore)} />
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400">학습 세션을 완료하면 데이터가 표시됩니다.</p>
              )}
            </div>
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        {(strengths.length > 0 || weaknesses.length > 0) && (
          <div className="grid grid-cols-2 gap-8 mb-10">
            {strengths.length > 0 && (
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
            )}
            {weaknesses.length > 0 && (
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
            )}
          </div>
        )}

        {/* QLoop 모델별 학습 통계 */}
        {modelStats && (
          <div className="border border-gray-200 p-6 mb-10">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={14} />
              <span className="swiss-label">QLoop 모델별 학습 통계</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {/* Core QLoop */}
              <div className="border-2 border-black p-4">
                <div className="text-xs font-black uppercase tracking-widest mb-3 text-black">Core QLoop</div>
                <div className="flex items-end gap-2 mb-2">
                  <div className="text-3xl font-black">{modelStats.core.count}</div>
                  <div className="text-xs text-gray-400 mb-1">세션</div>
                </div>
                <div className="text-xs text-gray-500 mb-2">평균 점수</div>
                {modelStats.core.avgScore !== null ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 h-2">
                      <div className="h-2 bg-black transition-all duration-700" style={{ width: `${modelStats.core.avgScore}%` }} />
                    </div>
                    <span className="text-xs font-bold w-8 text-right">{modelStats.core.avgScore}</span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-300">평가 데이터 없음</div>
                )}
              </div>
              {/* Curated QLoop */}
              <div className="border-2 border-red-600 p-4">
                <div className="text-xs font-black uppercase tracking-widest mb-3 text-red-600">Curated QLoop</div>
                <div className="flex items-end gap-2 mb-2">
                  <div className="text-3xl font-black">{modelStats.curated.count}</div>
                  <div className="text-xs text-gray-400 mb-1">세션</div>
                </div>
                <div className="text-xs text-gray-500 mb-2">평균 점수</div>
                {modelStats.curated.avgScore !== null ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 h-2">
                      <div className="h-2 bg-red-600 transition-all duration-700" style={{ width: `${modelStats.curated.avgScore}%` }} />
                    </div>
                    <span className="text-xs font-bold w-8 text-right">{modelStats.curated.avgScore}</span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-300">평가 데이터 없음</div>
                )}
              </div>
              {/* Open QLoop */}
              <div className="border-2 border-blue-600 p-4">
                <div className="text-xs font-black uppercase tracking-widest mb-3 text-blue-600">Open QLoop</div>
                <div className="flex items-end gap-2 mb-2">
                  <div className="text-3xl font-black">{modelStats.open.count}</div>
                  <div className="text-xs text-gray-400 mb-1">세션</div>
                </div>
                <div className="text-xs text-gray-500 mb-2">평균 점수</div>
                {modelStats.open.avgScore !== null ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 h-2">
                      <div className="h-2 bg-blue-600 transition-all duration-700" style={{ width: `${modelStats.open.avgScore}%` }} />
                    </div>
                    <span className="text-xs font-bold w-8 text-right">{modelStats.open.avgScore}</span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-300">평가 데이터 없음</div>
                )}
              </div>
            </div>
            {/* 비교 바 차트 */}
            {(modelStats.core.count + modelStats.curated.count + modelStats.open.count) > 0 && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">세션 수 비교</div>
                <div className="space-y-3">
                  {[
                    { label: "Core QLoop", count: modelStats.core.count, color: "bg-black" },
                    { label: "Curated QLoop", count: modelStats.curated.count, color: "bg-red-600" },
                    { label: "Open QLoop", count: modelStats.open.count, color: "bg-blue-600" },
                  ].map(({ label, count, color }) => {
                    const total = modelStats.core.count + modelStats.curated.count + modelStats.open.count;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-600 flex-shrink-0">{label}</div>
                        <div className="flex-1 bg-gray-100 h-3">
                          <div className={`h-3 ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs font-bold w-12 text-right">{count}회 ({pct}%)</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {/* 질문유형별 평가 이력 */}
        {Object.keys(evalsByType).length > 0 && (
          <div className="border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Brain size={14} />
              <span className="swiss-label">질문 유형별 평가 이력</span>
            </div>
            <div className="space-y-3">
              {Object.entries(evalsByType).map(([typeName, evs]) => {
                const avgTypeScore = evs && evs.length > 0
                  ? Math.round(evs.reduce((s, e) => s + (e.weightedScore ?? 0), 0) / evs.length)
                  : 0;
                const isExpanded = expandedType === typeName;
                return (
                  <div key={typeName} className="border border-gray-100">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedType(isExpanded ? null : typeName)}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold">{typeName}</span>
                        <span className="text-xs text-gray-400">{evs?.length ?? 0}회</span>
                        <span className={`text-xs font-bold px-2 py-0.5 border ${LEVEL_COLORS[typeStats[typeName]?.level ?? "Developing"] ?? "text-gray-600 bg-gray-50 border-gray-200"}`}>
                          {typeStats[typeName]?.level ?? "Developing"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black">{avgTypeScore}</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </button>
                    {isExpanded && evs && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {evs.slice(0, 5).map((ev) => (
                          <div key={ev.id} className="px-4 py-3 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-xs font-bold px-2 py-0.5 border ${LEVEL_COLORS[ev.level ?? "Developing"] ?? ""}`}>
                                {ev.level ?? "Developing"}
                              </span>
                              <span className="text-xs font-black">{ev.weightedScore ?? 0}점</span>
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2 mb-2">{ev.responseText}</p>
                            {(ev.strengthsJson as string[])?.length > 0 && (
                              <div className="text-xs text-green-700 mb-1">
                                <span className="font-bold">강점: </span>
                                {(ev.strengthsJson as string[]).slice(0, 2).join(" / ")}
                              </div>
                            )}
                            {(ev.weaknessesJson as string[])?.length > 0 && (
                              <div className="text-xs text-orange-700">
                                <span className="font-bold">보완: </span>
                                {(ev.weaknessesJson as string[]).slice(0, 2).join(" / ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!hasData && (
          <div className="text-center py-16 text-gray-300">
            <Brain size={48} className="mx-auto mb-4 opacity-30" />
            <p className="swiss-label">학습 세션을 시작하면 프로필이 생성됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
