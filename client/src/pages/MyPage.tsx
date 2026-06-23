import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import PageHeader from "@/components/PageHeader";
import { Flame, Trophy, Target, BookOpen, TrendingUp, Award } from "lucide-react";

// ─── 84일 히트맵 (GitHub-style) ──────────────────────────────────────────────

function ActivityHeatmap({ data }: { data: Array<{ date: string; count: number }> }) {
  const weeks: Array<typeof data> = [];
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7));
  }

  const intensity = (count: number) => {
    if (count === 0) return "bg-[#F0EFED]";
    if (count === 1) return "bg-[#C7C7F5]";
    if (count === 2) return "bg-[#9898E0]";
    return "bg-[#5B5BD6]";
  };

  const monthLabels: string[] = [];
  let lastMonth = "";
  weeks.forEach((week) => {
    const month = new Date(week[0]?.date ?? "").toLocaleDateString("ko-KR", { month: "short" });
    monthLabels.push(month !== lastMonth ? month : "");
    lastMonth = month;
  });

  return (
    <div className="overflow-x-auto">
      {/* Month labels */}
      <div className="flex gap-1 mb-1 pl-0">
        {monthLabels.map((label, i) => (
          <div key={i} className="w-[14px] text-[9px] text-[#A3A3A3] font-bold">{label}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => (
              <div
                key={di}
                title={`${day.date}: ${day.count}세션`}
                className={`w-[14px] h-[14px] rounded-sm ${intensity(day.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[10px] text-[#A3A3A3]">적음</span>
        {["bg-[#F0EFED]", "bg-[#C7C7F5]", "bg-[#9898E0]", "bg-[#5B5BD6]"].map((c, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
        ))}
        <span className="text-[10px] text-[#A3A3A3]">많음</span>
      </div>
    </div>
  );
}

// ─── 토픽 숙련도 바 ───────────────────────────────────────────────────────────

function TopicBar({ topic, pct }: { topic: string; pct: number }) {
  const color =
    pct >= 100 ? "var(--pm-indigo)" : pct >= 60 ? "#F59E0B" : "#EF4444";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-[#525252] truncate max-w-[75%]">{topic}</span>
        <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-[#F0EFED] rounded-full overflow-hidden">
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();

  const { data: stats, isLoading } = trpc.session.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  if (isLoading || !stats) {
    return (
      <div className="min-h-[100dvh] bg-[#EDECEA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "var(--pm-indigo)" }} />
          <span className="pm-label">로딩 중</span>
        </div>
      </div>
    );
  }

  const streakColor = stats.currentStreak >= 7
    ? "#EF4444"
    : stats.currentStreak >= 3
    ? "#F59E0B"
    : "var(--pm-indigo)";

  return (
    <div className="min-h-[100dvh] bg-[#EDECEA] flex flex-col">
      <PageHeader title="MY PAGE" backTo="/dashboard" backLabel="대시보드" />

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-8 py-8 w-full">

        {/* 사용자 이름 */}
        <div className="mb-8">
          <h1 className="text-2xl font-black">{user?.name ?? "학습자"}</h1>
          <p className="text-sm text-[#737373] mt-1">학습 성취 기록</p>
        </div>

        {/* 핵심 스탯 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            {
              icon: <Flame size={16} style={{ color: streakColor }} />,
              value: stats.currentStreak,
              label: "연속 학습",
              unit: "일",
              accent: streakColor,
            },
            {
              icon: <Trophy size={16} style={{ color: "var(--pm-indigo)" }} />,
              value: stats.completedSessions,
              label: "완료 세션",
              unit: "회",
              accent: "var(--pm-indigo)",
            },
            {
              icon: <Target size={16} className="text-[#737373]" />,
              value: stats.totalAnswered,
              label: "총 답변",
              unit: "개",
              accent: "#0F0F0F",
            },
            {
              icon: <Award size={16} className="text-amber-500" />,
              value: stats.longestStreak,
              label: "최장 연속",
              unit: "일",
              accent: "#D97706",
            },
          ].map(({ icon, value, label, unit, accent }) => (
            <div key={label} className="pm-card p-4 flex flex-col gap-2">
              {icon}
              <div>
                <div className="text-2xl font-black" style={{ color: accent }}>
                  {value}<span className="text-sm font-normal text-[#A3A3A3] ml-0.5">{unit}</span>
                </div>
                <div className="pm-label">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 활동 히트맵 */}
        <div className="pm-card p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-[#737373]" />
            <p className="pm-label">최근 12주 학습 활동</p>
          </div>
          {stats.dailyActivity.length > 0 ? (
            <ActivityHeatmap data={stats.dailyActivity} />
          ) : (
            <p className="text-sm text-[#A3A3A3]">아직 학습 기록이 없습니다.</p>
          )}
        </div>

        {/* 토픽 숙련도 */}
        <div className="pm-card p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={14} className="text-[#737373]" />
            <p className="pm-label">토픽 숙련도</p>
            <span className="ml-auto text-[10px] text-[#A3A3A3]">기준: 24문답 = 100%</span>
          </div>
          {stats.topicMastery.length > 0 ? (
            <div className="space-y-3">
              {stats.topicMastery.map((t, i) => (
                <TopicBar key={i} topic={t.topic} pct={t.pct} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#A3A3A3]">완료된 세션이 없습니다.</p>
          )}
        </div>

        {/* QLOOP Profile 바로가기 */}
        <button
          onClick={() => navigate("/profile/socratic")}
          className="w-full py-3 border border-black/20 text-sm font-semibold text-[#525252] hover:bg-white hover:border-black/40 transition-colors rounded-xl flex items-center justify-center gap-2"
        >
          <Award size={14} />
          QLOOP Profile 상세 보기 (소크라테스 평가)
        </button>
      </main>
    </div>
  );
}
