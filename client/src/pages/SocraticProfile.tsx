import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import PageHeader from "@/components/PageHeader";
import { Brain, Target, TrendingUp, Award, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const DIMENSION_LABELS: Record<string, string> = {
  accuracy: "정확성",
  reasoning: "추론",
  evidence: "근거",
  clarity: "명확성",
  depth: "깊이",
  application: "적용",
};

const LEVEL_CONFIG: Record<string, { badge: string; bg: string; text: string }> = {
  Advanced:   { badge: "pm-badge-green",  bg: "bg-green-50",  text: "text-green-700" },
  Proficient: { badge: "pm-badge-indigo", bg: "bg-[#E8E8FD]", text: "text-[#4343B0]" },
  Developing: { badge: "pm-badge-amber",  bg: "bg-amber-50",  text: "text-amber-700" },
  Emerging:   { badge: "pm-badge-amber",  bg: "bg-orange-50", text: "text-orange-700" },
  Fragmented: { badge: "pm-badge-red",    bg: "bg-red-50",    text: "text-red-700" },
};

function ScoreBar({ score, max = 100, color }: { score: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-[#F0EFED] h-1.5 rounded-full overflow-hidden">
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color ?? "var(--pm-indigo)" }}
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
      <div className="min-h-screen bg-[#EDECEA] flex items-center justify-center">
        <p className="pm-label">로그인이 필요합니다.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#EDECEA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "var(--pm-indigo)" }} />
          <span className="pm-label">프로필 로딩 중...</span>
        </div>
      </div>
    );
  }

  const computed = profile?.computedStats ?? null;
  const profileData = profile?.profile ?? null;
  const totalEvals = computed?.totalAnswered ?? profileData?.totalQuestionsAnswered ?? 0;
  const avgScore = computed?.avgScore ?? profileData?.slciScore ?? 0;
  const dominantLevel = profileData?.slciLevel ?? (
    avgScore >= 80 ? "Advanced" : avgScore >= 65 ? "Proficient" :
    avgScore >= 50 ? "Developing" : avgScore >= 35 ? "Emerging" :
    totalEvals > 0 ? "Fragmented" : "—"
  );
  const dimStats = computed?.dimScores ?? (profileData?.dimensionScoresJson as Record<string, number>) ?? {};
  const typeStats = computed?.typeScores ?? {};
  const strengths = computed?.allStrengths ?? (profileData?.dominantStrengthsJson as string[]) ?? [];
  const weaknesses = computed?.allWeaknesses ?? (profileData?.recurringWeaknessesJson as string[]) ?? [];
  const hasData = totalEvals > 0;

  const evalsByType: Record<string, typeof evaluations> = {};
  if (evaluations) {
    for (const ev of evaluations) {
      const snap = ev.questionTypeSnapshotJson as { displayName?: string; name?: string } | null;
      const typeName = snap?.displayName ?? snap?.name ?? "기타";
      if (!evalsByType[typeName]) evalsByType[typeName] = [];
      evalsByType[typeName]!.push(ev);
    }
  }

  const levelCfg = LEVEL_CONFIG[dominantLevel] ?? { badge: "pm-badge-gray", bg: "bg-gray-50", text: "text-gray-700" };

  return (
    <div className="min-h-screen bg-[#EDECEA]">
      <PageHeader title="QLOOP PROFILE" />

      <div className="max-w-5xl mx-auto px-8 py-10">

        {/* No data notice */}
        {!hasData && (
          <div className="pm-card px-5 py-4 mb-6 flex items-center gap-3">
            <Brain size={16} className="text-[#A3A3A3] flex-shrink-0" />
            <span className="text-xs text-[#737373]">아직 평가 데이터가 없습니다. 학습 세션을 진행하면 실제 데이터로 업데이트됩니다.</span>
            <button
              onClick={() => navigate("/dashboard")}
              className="ml-auto text-xs font-semibold px-4 py-1.5 rounded-lg border border-[#E5E5E3] hover:bg-[#F0EFED] transition-colors flex-shrink-0"
            >
              학습 시작
            </button>
          </div>
        )}

        {/* Overview cards */}
        <div className="grid grid-cols-3 gap-5 mb-8">
          <div className="pm-card p-6">
            <p className="pm-label mb-2">총 평가 횟수</p>
            <div className="text-4xl font-black">{totalEvals}</div>
            <p className="text-xs text-[#A3A3A3] mt-1">답변 평가 완료</p>
          </div>
          <div className="pm-card p-6">
            <p className="pm-label mb-2">평균 점수</p>
            <div className="text-4xl font-black" style={hasData ? { color: "var(--pm-indigo)" } : {}}>
              {hasData ? Math.round(avgScore) : "—"}
            </div>
            <p className="text-xs text-[#A3A3A3] mt-1">/ 100점</p>
          </div>
          <div className="pm-card p-6">
            <p className="pm-label mb-2">학습 수준</p>
            {hasData ? (
              <div className={`inline-block mt-2 px-3 py-1.5 rounded-lg text-sm font-bold ${levelCfg.bg} ${levelCfg.text}`}>
                {dominantLevel}
              </div>
            ) : (
              <div className="text-3xl font-black text-[#D4D4D2] mt-2">—</div>
            )}
          </div>
        </div>

        {/* Scores grid */}
        <div className="grid grid-cols-2 gap-5 mb-8">
          {/* Dimension scores */}
          <div className="pm-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <Target size={14} className="text-[#A3A3A3]" />
              <p className="pm-label">평가 요소별 점수</p>
            </div>
            <div className="space-y-4">
              {Object.entries(dimStats).length > 0 ? (
                Object.entries(dimStats).map(([dim, score]) => (
                  <div key={dim}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs text-[#525252]">{DIMENSION_LABELS[dim] ?? dim}</span>
                      <span className="text-xs text-[#A3A3A3]">{Math.round(score)}</span>
                    </div>
                    <ScoreBar score={Math.round(score)} />
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#A3A3A3]">학습 세션을 완료하면 데이터가 표시됩니다.</p>
              )}
            </div>
          </div>

          {/* Question type stats */}
          <div className="pm-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp size={14} className="text-[#A3A3A3]" />
              <p className="pm-label">질문 유형별 성취도</p>
            </div>
            <div className="space-y-4">
              {Object.entries(typeStats).length > 0 ? (
                Object.entries(typeStats).map(([type, s]) => (
                  <div key={type}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs text-[#525252]">{type}</span>
                      <span className="text-xs text-[#A3A3A3]">{s.count}회</span>
                    </div>
                    <ScoreBar score={Math.round(s.avgScore)} />
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#A3A3A3]">학습 세션을 완료하면 데이터가 표시됩니다.</p>
              )}
            </div>
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        {(strengths.length > 0 || weaknesses.length > 0) && (
          <div className="grid grid-cols-2 gap-5 mb-8">
            {strengths.length > 0 && (
              <div className="pm-card p-5 border-t-4" style={{ borderTopColor: "#16A34A" }}>
                <div className="flex items-center gap-2 mb-4">
                  <Award size={14} className="text-green-600" />
                  <p className="pm-label text-green-700">강점</p>
                </div>
                <ul className="space-y-2">
                  {strengths.slice(0, 5).map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#525252]">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {weaknesses.length > 0 && (
              <div className="pm-card p-5 border-t-4 border-t-amber-400">
                <div className="flex items-center gap-2 mb-4">
                  <Target size={14} className="text-amber-600" />
                  <p className="pm-label text-amber-700">개선 영역</p>
                </div>
                <ul className="space-y-2">
                  {weaknesses.slice(0, 5).map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#525252]">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* QLoop 모델별 통계 */}
        {modelStats && (
          <div className="pm-card p-6 mb-8">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={14} className="text-[#A3A3A3]" />
              <p className="pm-label">QLoop 모델별 학습 통계</p>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { key: "core" as const, label: "Core QLoop", color: "#0F0F0F", borderColor: "#0F0F0F" },
                { key: "curated" as const, label: "Curated QLoop", color: "var(--pm-indigo)", borderColor: "var(--pm-indigo)" },
                { key: "open" as const, label: "Open QLoop", color: "#2563EB", borderColor: "#2563EB" },
              ].map(({ key, label, color, borderColor }) => {
                const stat = modelStats[key];
                return (
                  <div key={key} className="pm-card p-4 border-t-4" style={{ borderTopColor: borderColor }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color }}>{label}</p>
                    <div className="flex items-end gap-1.5 mb-3">
                      <div className="text-3xl font-black">{stat.count}</div>
                      <div className="text-xs text-[#A3A3A3] mb-1">세션</div>
                    </div>
                    <p className="text-xs text-[#A3A3A3] mb-2">평균 점수</p>
                    {stat.avgScore !== null ? (
                      <ScoreBar score={stat.avgScore} color={color} />
                    ) : (
                      <div className="text-xs text-[#D4D4D2]">평가 데이터 없음</div>
                    )}
                  </div>
                );
              })}
            </div>

            {(modelStats.core.count + modelStats.curated.count + modelStats.open.count) > 0 && (
              <div className="border-t border-[#F0EFED] pt-5">
                <p className="pm-label mb-4">세션 수 비교</p>
                <div className="space-y-3">
                  {[
                    { label: "Core QLoop", count: modelStats.core.count, color: "#0F0F0F" },
                    { label: "Curated QLoop", count: modelStats.curated.count, color: "var(--pm-indigo)" },
                    { label: "Open QLoop", count: modelStats.open.count, color: "#2563EB" },
                  ].map(({ label, count, color }) => {
                    const total = modelStats.core.count + modelStats.curated.count + modelStats.open.count;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-[#525252] flex-shrink-0">{label}</div>
                        <div className="flex-1 bg-[#F0EFED] h-2.5 rounded-full overflow-hidden">
                          <div className="h-2.5 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                        <div className="text-xs font-bold w-16 text-right text-[#525252]">{count}회 ({pct}%)</div>
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
          <div className="pm-card overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-5 border-b border-[#E5E5E3]">
              <Brain size={14} className="text-[#A3A3A3]" />
              <p className="pm-label">질문 유형별 평가 이력</p>
            </div>
            <div className="divide-y divide-[#F0EFED]">
              {Object.entries(evalsByType).map(([typeName, evs]) => {
                const avgTypeScore = evs && evs.length > 0
                  ? Math.round(evs.reduce((s, e) => s + (e.weightedScore ?? 0), 0) / evs.length)
                  : 0;
                const isExpanded = expandedType === typeName;
                const typeLevel = typeStats[typeName]?.level ?? "Developing";
                const tlCfg = LEVEL_CONFIG[typeLevel] ?? { badge: "pm-badge-gray", bg: "bg-gray-50", text: "text-gray-700" };

                return (
                  <div key={typeName}>
                    <button
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#F8F7F5] transition-colors"
                      onClick={() => setExpandedType(isExpanded ? null : typeName)}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold">{typeName}</span>
                        <span className="text-xs text-[#A3A3A3]">{evs?.length ?? 0}회</span>
                        <span className={`pm-badge ${tlCfg.badge}`}>{typeLevel}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black">{avgTypeScore}</span>
                        {isExpanded ? <ChevronUp size={14} className="text-[#A3A3A3]" /> : <ChevronDown size={14} className="text-[#A3A3A3]" />}
                      </div>
                    </button>
                    {isExpanded && evs && (
                      <div className="border-t border-[#F0EFED] divide-y divide-[#F8F7F5]">
                        {evs.slice(0, 5).map((ev) => {
                          const evLevel = ev.level ?? "Developing";
                          const evCfg = LEVEL_CONFIG[evLevel] ?? { badge: "pm-badge-gray", bg: "", text: "" };
                          return (
                            <div key={ev.id} className="px-6 py-4 bg-[#F8F7F5]">
                              <div className="flex items-center justify-between mb-2">
                                <span className={`pm-badge ${evCfg.badge}`}>{evLevel}</span>
                                <span className="text-xs font-black">{ev.weightedScore ?? 0}점</span>
                              </div>
                              <p className="text-xs text-[#525252] line-clamp-2 mb-2">{ev.responseText}</p>
                              {(ev.strengthsJson as string[])?.length > 0 && (
                                <div className="text-xs text-green-700 mb-1">
                                  <span className="font-semibold">강점: </span>
                                  {(ev.strengthsJson as string[]).slice(0, 2).join(" / ")}
                                </div>
                              )}
                              {(ev.weaknessesJson as string[])?.length > 0 && (
                                <div className="text-xs text-amber-700">
                                  <span className="font-semibold">보완: </span>
                                  {(ev.weaknessesJson as string[]).slice(0, 2).join(" / ")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!hasData && (
          <div className="text-center py-16 text-[#D4D4D2]">
            <Brain size={48} className="mx-auto mb-4 opacity-30" />
            <p className="pm-label">학습 세션을 시작하면 프로필이 생성됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
