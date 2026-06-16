import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import PageHeader from "@/components/PageHeader";
import { BookOpen, CheckCircle, Clock, Play, ArrowUpDown, Award, Trash2, X } from "lucide-react";
import { Streamdown } from "streamdown";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type SortMode = "time" | "progress" | "toc";

const SORT_LABELS: Record<SortMode, string> = {
  time: "학습순",
  progress: "진도율",
  toc: "목차순",
};

const MIN_QUESTIONS = 24;

function calcProgress(answeredQuestions: number | null | undefined): number {
  return Math.min(Math.round(((answeredQuestions ?? 0) / MIN_QUESTIONS) * 100), 100);
}

export default function SessionHistory() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: sessions, isLoading, refetch } = trpc.session.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: selectedSessionData } = trpc.session.get.useQuery(
    { sessionId: selectedSession ?? 0 },
    { enabled: !!selectedSession }
  );

  const { data: selectedMessages } = trpc.session.getMessages.useQuery(
    { sessionId: selectedSession ?? 0 },
    { enabled: !!selectedSession }
  );

  const deleteSession = trpc.session.delete.useMutation({
    onSuccess: () => {
      toast.success("세션이 삭제되었습니다.");
      setDeleteConfirm(null);
      if (selectedSession === deleteConfirm) setSelectedSession(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const visibleSessions = sessions?.filter((s) => s.status === "active" || s.status === "completed") ?? [];
  const completedSessions = visibleSessions.filter((s) => s.status === "completed");
  const fullyCompletedCount = visibleSessions.filter((s) => calcProgress(s.answeredQuestions) >= 100).length;

  const sortedSessions = useMemo(() => {
    if (!sessions) return [];
    const arr = sessions.filter((s) => s.status === "active" || s.status === "completed");
    if (sortMode === "time") return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sortMode === "progress") return arr.sort((a, b) => calcProgress(b.answeredQuestions) - calcProgress(a.answeredQuestions));
    return arr.sort((a, b) => (a.startTopicId ?? "").localeCompare(b.startTopicId ?? "", undefined, { numeric: true }));
  }, [sessions, sortMode]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#EDECEA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "var(--pm-indigo)" }} />
          <span className="pm-label">로딩 중</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EDECEA] flex flex-col">
      <PageHeader title="LEARNING HISTORY" />

      <main className="flex-1 max-w-7xl mx-auto px-8 py-10 w-full">
        <div className="grid grid-cols-12 gap-6">
          {/* Session list */}
          <div className={`${selectedSession ? "col-span-5" : "col-span-12"}`}>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { value: visibleSessions.length, label: "전체 세션", accent: false },
                { value: completedSessions.length, label: "완료 세션", accent: true },
                { value: fullyCompletedCount, label: "학습완료", accent: true },
                { value: visibleSessions.reduce((acc, s) => acc + (s.answeredQuestions ?? 0), 0), label: "총 답변 수", accent: false },
              ].map(({ value, label, accent }) => (
                <div key={label} className="pm-card p-5">
                  <div className="text-3xl font-black mb-1" style={accent ? { color: "var(--pm-indigo)" } : {}}>
                    {value}
                  </div>
                  <div className="pm-label">{label}</div>
                </div>
              ))}
            </div>

            {/* Session list */}
            {visibleSessions.length === 0 ? (
              <div className="pm-card p-16 text-center">
                <BookOpen size={32} className="mx-auto mb-4 text-[#D4D4D2]" />
                <div className="pm-label mb-2">학습 기록이 없습니다</div>
                <p className="text-sm text-[#A3A3A3] mb-6">문서를 업로드하고 학습을 시작해보세요.</p>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="px-6 py-2.5 text-xs font-semibold rounded-lg text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: "var(--pm-indigo)" }}
                >
                  학습 시작하기
                </button>
              </div>
            ) : (
              <div>
                {/* Sort control */}
                <div className="flex items-center justify-between mb-4">
                  <p className="pm-label">전체 학습 세션 <span className="text-[#0F0F0F] font-bold">{visibleSessions.length}</span></p>
                  <div className="flex items-center gap-1 bg-[#F0EFED] rounded-lg p-1">
                    <ArrowUpDown size={10} className="text-[#A3A3A3] ml-1" />
                    {(["time", "progress", "toc"] as SortMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setSortMode(mode)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                          sortMode === mode ? "bg-white shadow-sm text-[#0F0F0F]" : "text-[#737373] hover:text-[#0F0F0F]"
                        }`}
                      >
                        {SORT_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {sortedSessions.map((s) => {
                    const isSelected = selectedSession === s.id;
                    const progress = calcProgress(s.answeredQuestions);
                    const isFullyCompleted = progress >= 100;
                    const isDeleting = deleteConfirm === s.id;

                    return (
                      <div
                        key={s.id}
                        className={`pm-card p-4 cursor-pointer transition-all ${isSelected ? "ring-2" : ""}`}
                        style={isSelected ? { ringColor: "var(--pm-indigo)", outline: "2px solid var(--pm-indigo)" } : {}}
                        onClick={() => !isDeleting && setSelectedSession(isSelected ? null : s.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                              s.status === "completed" ? "" : "bg-amber-400"
                            }`} style={s.status === "completed" ? { backgroundColor: "var(--pm-indigo)" } : {}} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <p className="text-sm font-semibold truncate">{s.startTopicTitle || "학습 세션"}</p>
                                {isFullyCompleted && (
                                  <span className="pm-badge pm-badge-indigo flex items-center gap-0.5">
                                    <Award size={9} /> 학습완료
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <Clock size={10} className="text-[#A3A3A3]" />
                                  <span className="text-xs text-[#A3A3A3]">
                                    {new Date(s.createdAt).toLocaleDateString("ko-KR")}
                                  </span>
                                </div>
                                <span className="text-xs text-[#A3A3A3]">답변 {s.answeredQuestions ?? 0}개</span>
                                {(() => {
                                  const mode = (s as any).openQloopMode;
                                  if (mode === 1) return <span className="pm-badge pm-badge-gray text-blue-600">Open</span>;
                                  if (mode === 2) return <span className="pm-badge pm-badge-indigo">Curated</span>;
                                  return <span className="pm-badge pm-badge-gray">Core</span>;
                                })()}
                                {sortMode === "progress" && (
                                  <span className="text-xs font-bold" style={{ color: "var(--pm-indigo)" }}>{progress}%</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {s.status === "completed" ? (
                              <CheckCircle size={14} style={{ color: "var(--pm-indigo)" }} />
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/sessions/${s.id}`); }}
                                className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-[#0F0F0F] text-white hover:opacity-80 transition-all"
                              >
                                <Play size={10} /> 계속
                              </button>
                            )}
                            {/* 삭제 버튼 */}
                            {isDeleting ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => deleteSession.mutate({ sessionId: s.id })}
                                  disabled={deleteSession.isPending}
                                  className="px-2 py-1 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  삭제
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="p-1 rounded-md hover:bg-[#F0EFED] text-[#737373]"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(s.id); }}
                                className="p-1.5 rounded-md text-[#A3A3A3] hover:text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-3 pl-5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-[#F0EFED] h-1 rounded-full overflow-hidden">
                              <div
                                className="h-1 rounded-full transition-all"
                                style={{ width: `${progress}%`, backgroundColor: "var(--pm-indigo)" }}
                              />
                            </div>
                            <span className="text-xs font-bold w-8 text-right" style={isFullyCompleted ? { color: "var(--pm-indigo)" } : { color: "#A3A3A3" }}>
                              {progress}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Session detail panel */}
          {selectedSession && selectedSessionData ? (
            <div className="col-span-7">
              <div className="flex items-center justify-between mb-5">
                <p className="pm-label">진도 리포트</p>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="p-1.5 rounded-lg hover:bg-[#F0EFED] text-[#A3A3A3] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Session header card */}
              <div className="pm-card p-6 mb-5">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-xl font-bold">{selectedSessionData.startTopicTitle}</h2>
                      {calcProgress(selectedSessionData.answeredQuestions) >= 100 && (
                        <span className="pm-badge pm-badge-indigo flex items-center gap-1">
                          <Award size={11} /> 학습완료
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#A3A3A3]">
                      {new Date(selectedSessionData.createdAt).toLocaleDateString("ko-KR", {
                        year: "numeric", month: "long", day: "numeric",
                      })}
                    </p>
                  </div>
                  <span className={`pm-badge ${selectedSessionData.status === "completed" ? "pm-badge-indigo" : "pm-badge-amber"}`}>
                    {selectedSessionData.status === "completed" ? "완료" : "진행 중"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-5">
                  {[
                    { value: selectedSessionData.answeredQuestions ?? 0, label: "답변 수" },
                    { value: MIN_QUESTIONS, label: "목표 답변" },
                    { value: `${calcProgress(selectedSessionData.answeredQuestions)}%`, label: "진도율", accent: true },
                  ].map(({ value, label, accent }) => (
                    <div key={label} className="bg-[#F8F7F5] rounded-xl p-3 text-center">
                      <div className="text-2xl font-black" style={accent ? { color: "var(--pm-indigo)" } : {}}>{value}</div>
                      <div className="pm-label mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-[#F0EFED] h-2 rounded-full overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${calcProgress(selectedSessionData.answeredQuestions)}%`, backgroundColor: "var(--pm-indigo)" }}
                  />
                </div>
              </div>

              {/* Summary */}
              {selectedSessionData.summary && (
                <div className="pm-card p-5 mb-5">
                  <p className="pm-label mb-3">학습 요약</p>
                  <div className="text-sm leading-relaxed text-[#525252]">
                    <Streamdown>{selectedSessionData.summary}</Streamdown>
                  </div>
                </div>
              )}

              {/* Message history */}
              {selectedMessages && selectedMessages.length > 0 ? (
                <div className="pm-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E3]">
                    <p className="pm-label">학습 대화 기록</p>
                    <span className="text-xs text-[#A3A3A3]">{selectedMessages.length}개 메시지</span>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto divide-y divide-[#F0EFED]">
                    {selectedMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`px-5 py-3.5 ${msg.role === "ai" ? "bg-[#F8F7F5]" : "bg-white"}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0`}
                            style={{ backgroundColor: msg.role === "ai" ? "var(--pm-indigo)" : "#0F0F0F" }} />
                          <span className="pm-label">
                            {msg.role === "ai" ? "AI Tutor 질문" : msg.messageType === "user_question" ? "역질문" : "내 답변"}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-[#525252] pl-3.5">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pm-card p-8 text-center">
                  <p className="text-sm text-[#A3A3A3]">대화 기록이 없습니다.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#F0EFED] flex items-center justify-center mx-auto mb-3">
                  <BookOpen size={20} className="text-[#A3A3A3]" />
                </div>
                <p className="text-sm font-medium text-[#525252]">세션을 선택하세요</p>
                <p className="text-xs text-[#A3A3A3] mt-1">좌측 목록에서 세션을 클릭하면 상세 내용을 확인할 수 있습니다.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
