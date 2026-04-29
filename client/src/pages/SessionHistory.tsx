import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, BookOpen, CheckCircle, Clock, Play, ArrowUpDown } from "lucide-react";
import { Streamdown } from "streamdown";
import { useState, useMemo } from "react";

type SortMode = "time" | "progress" | "toc";

const SORT_LABELS: Record<SortMode, string> = {
  time: "학습순",
  progress: "진도율",
  toc: "목차순",
};

export default function SessionHistory() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("time");

  const { data: sessions, isLoading } = trpc.session.list.useQuery(undefined, {
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

  const completedSessions = sessions?.filter((s) => s.status === "completed") ?? [];
  const activeSessions = sessions?.filter((s) => s.status === "active") ?? [];

  const sortedSessions = useMemo(() => {
    if (!sessions) return [];
    const arr = [...sessions];
    if (sortMode === "time") {
      return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortMode === "progress") {
      return arr.sort((a, b) => {
        const pa = a.totalQuestions ? Math.round(((a.answeredQuestions ?? 0) / a.totalQuestions) * 100) : 0;
        const pb = b.totalQuestions ? Math.round(((b.answeredQuestions ?? 0) / b.totalQuestions) * 100) : 0;
        return pb - pa;
      });
    } else {
      // 목차순: startTopicId 기준 알파벳/숫자 정렬 (토픽 ID에 순서 정보 포함)
      return arr.sort((a, b) => {
        const ta = a.startTopicId ?? "";
        const tb = b.startTopicId ?? "";
        return ta.localeCompare(tb, undefined, { numeric: true });
      });
    }
  }, [sessions, sortMode]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 swiss-red-bg animate-pulse" />
          <span className="swiss-label">로딩 중</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 swiss-label hover:text-black transition-colors"
            >
              <ArrowLeft size={12} /> 대시보드
            </button>
            <div className="w-px h-4 bg-black" />
            <span className="text-sm font-bold">학습 히스토리</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 swiss-red-bg" />
              <span className="swiss-label">완료 {completedSessions.length}개</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-400" />
              <span className="swiss-label">진행 중 {activeSessions.length}개</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-8 py-12 w-full">
        <div className="grid grid-cols-12 gap-0">
          {/* Session list */}
          <div className={`${selectedSession ? "col-span-5 pr-8 border-r border-black" : "col-span-12"}`}>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-0 mb-10">
              <div className="border border-black p-6 border-r-0">
                <div className="text-4xl font-black mb-1">{sessions?.length ?? 0}</div>
                <div className="swiss-label">전체 세션</div>
              </div>
              <div className="border border-black p-6 border-r-0">
                <div className="text-4xl font-black mb-1" style={{ color: "var(--swiss-red)" }}>
                  {completedSessions.length}
                </div>
                <div className="swiss-label">완료 세션</div>
              </div>
              <div className="border border-black p-6">
                <div className="text-4xl font-black mb-1">
                  {sessions?.reduce((acc, s) => acc + (s.answeredQuestions ?? 0), 0) ?? 0}
                </div>
                <div className="swiss-label">총 답변 수</div>
              </div>
            </div>

            {/* Session list */}
            {!sessions || sessions.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 p-16 text-center">
                <BookOpen size={32} className="mx-auto mb-4 text-gray-200" />
                <div className="swiss-label mb-2">학습 기록이 없습니다</div>
                <p className="text-sm text-gray-400 mb-6">문서를 업로드하고 학습을 시작해보세요.</p>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="bg-black text-white px-6 py-3 text-xs font-bold tracking-wide hover:bg-[var(--swiss-red)] transition-colors"
                >
                  학습 시작하기
                </button>
              </div>
            ) : (
              <div>
                {/* 소팅 컨트롤 */}
                <div className="flex items-center justify-between mb-4">
                  <div className="swiss-label">전체 학습 세션</div>
                  <div className="flex items-center gap-1 border border-gray-200">
                    <ArrowUpDown size={11} className="text-gray-400 ml-2" />
                    {(["time", "progress", "toc"] as SortMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setSortMode(mode)}
                        className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                          sortMode === mode
                            ? "bg-black text-white"
                            : "text-gray-500 hover:text-black hover:bg-gray-50"
                        }`}
                      >
                        {SORT_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-0">
                  {sortedSessions.map((s, i) => {
                    const isSelected = selectedSession === s.id;
                    const progress = s.totalQuestions
                      ? Math.round(((s.answeredQuestions ?? 0) / s.totalQuestions) * 100)
                      : 0;

                    return (
                      <div
                        key={s.id}
                        className={`p-5 cursor-pointer transition-colors border ${
                          i > 0 ? "border-t-0" : ""
                        } ${isSelected ? "border-2 bg-gray-50" : "border-black hover:bg-gray-50"}`}
                        style={isSelected ? { borderColor: "var(--swiss-red)" } : {}}
                        onClick={() => setSelectedSession(isSelected ? null : s.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`w-2 h-2 mt-1.5 flex-shrink-0 ${s.status === "completed" ? "swiss-red-bg" : s.status === "active" ? "bg-yellow-400" : "bg-gray-300"}`} />
                            <div className="flex-1">
                              <p className="text-sm font-bold mb-1">{s.startTopicTitle || "학습 세션"}</p>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1">
                                  <Clock size={10} className="text-gray-400" />
                                  <span className="text-xs text-gray-400">
                                    {new Date(s.createdAt).toLocaleDateString("ko-KR")}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-400">
                                  답변 {s.answeredQuestions ?? 0}개
                                </span>
                                {sortMode === "progress" && (
                                  <span className="text-xs font-bold" style={{ color: "var(--swiss-red)" }}>
                                    {progress}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            {s.status === "completed" ? (
                              <CheckCircle size={14} style={{ color: "var(--swiss-red)" }} />
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/sessions/${s.id}`);
                                }}
                                className="flex items-center gap-1 bg-black text-white px-3 py-1 text-xs font-bold hover:bg-[var(--swiss-red)] transition-colors"
                              >
                                <Play size={10} /> 계속
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        {s.totalQuestions ? (
                          <div className="mt-3 pl-5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 h-0.5">
                                <div
                                  className="h-0.5 swiss-red-bg transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400">{progress}%</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Session detail / report */}
          {selectedSession && selectedSessionData && (
            <div className="col-span-7 pl-8">
              <div className="swiss-label mb-6">진도 리포트</div>

              {/* Session header */}
              <div className="border-2 border-black p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-black mb-1">{selectedSessionData.startTopicTitle}</h2>
                    <p className="swiss-label">
                      {new Date(selectedSessionData.createdAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className={`px-3 py-1 text-xs font-bold ${selectedSessionData.status === "completed" ? "swiss-red-bg text-white" : "bg-yellow-400 text-black"}`}>
                    {selectedSessionData.status === "completed" ? "완료" : "진행 중"}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-0">
                  <div className="border-r border-gray-200 pr-4">
                    <div className="text-2xl font-black">{selectedSessionData.totalQuestions ?? 0}</div>
                    <div className="swiss-label">총 질문</div>
                  </div>
                  <div className="border-r border-gray-200 px-4">
                    <div className="text-2xl font-black">{selectedSessionData.answeredQuestions ?? 0}</div>
                    <div className="swiss-label">답변 완료</div>
                  </div>
                  <div className="pl-4">
                    <div className="text-2xl font-black" style={{ color: "var(--swiss-red)" }}>
                      {selectedSessionData.totalQuestions
                        ? Math.round(((selectedSessionData.answeredQuestions ?? 0) / selectedSessionData.totalQuestions) * 100)
                        : 0}%
                    </div>
                    <div className="swiss-label">진도율</div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {selectedSessionData.summary && (
                <div className="mb-6">
                  <div className="swiss-label mb-3">학습 요약</div>
                  <div className="border border-gray-200 p-5">
                    <div className="text-sm leading-relaxed text-gray-700">
                      <Streamdown>{selectedSessionData.summary}</Streamdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Message history */}
              {selectedMessages && selectedMessages.length > 0 && (
                <div>
                  <div className="swiss-label mb-3">대화 기록</div>
                  <div className="border border-black max-h-96 overflow-y-auto">
                    {selectedMessages.map((msg, i) => (
                      <div
                        key={msg.id}
                        className={`p-4 ${i < selectedMessages.length - 1 ? "border-b border-gray-100" : ""} ${msg.role === "ai" ? "bg-gray-50" : "bg-white"}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 ${msg.role === "ai" ? "swiss-red-bg" : "bg-black"}`} />
                          <span className="swiss-label">
                            {msg.role === "ai" ? "AI Tutor 질문" : msg.messageType === "user_question" ? "역질문" : "내 답변"}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-gray-700 pl-4">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
