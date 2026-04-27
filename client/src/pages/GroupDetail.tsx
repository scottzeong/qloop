import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Folder, FileText, BookOpen, ChevronRight, BarChart2, LogOut } from "lucide-react";

export default function GroupDetail() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const groupId = Number(params.id);

  const { data: groupDetail, isLoading } = trpc.group.get.useQuery(
    { groupId },
    { enabled: isAuthenticated && !isNaN(groupId) }
  );

  const startSessionMutation = trpc.session.start.useMutation();
  const [startingTopicId, setStartingTopicId] = useState<string | null>(null);

  const handleStartLearning = async (topicId: string, topicTitle: string, documentId: number) => {
    setStartingTopicId(topicId);
    try {
      const { sessionId } = await startSessionMutation.mutateAsync({
        documentId,
        topicId,
        topicTitle,
        topicDescription: "",
      });
      navigate(`/sessions/${sessionId}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "학습 시작 실패");
    } finally {
      setStartingTopicId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 swiss-red-bg animate-pulse" />
          <span className="swiss-label">로딩 중</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6">
        <div className="swiss-label">로그인이 필요합니다</div>
        <a href={getLoginUrl()} className="bg-black text-white px-8 py-3 text-sm font-bold tracking-widest uppercase hover:bg-[var(--swiss-red)] transition-colors">
          로그인
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-black bg-white z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-6 h-6 swiss-red-bg flex-shrink-0" />
            <span className="text-lg font-black tracking-tight">QLOOP</span>
          </div>
          <nav className="flex items-center gap-6">
            <button onClick={() => navigate("/history")} className="swiss-label hover:text-black transition-colors flex items-center gap-1">
              <BarChart2 size={12} /> 학습 히스토리
            </button>
            <div className="flex items-center gap-3 border-l border-black pl-6">
              <span className="text-sm font-medium">{user?.name}</span>
              <button onClick={() => logout()} className="swiss-label hover:text-black transition-colors flex items-center gap-1">
                <LogOut size={11} /> 로그아웃
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-8 py-12 w-full">
        {/* Back button */}
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 swiss-label hover:text-black transition-colors mb-8"
        >
          <ArrowLeft size={14} /> 대시보드로 돌아가기
        </button>

        {isLoading ? (
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 swiss-red-bg animate-pulse" />
            <span className="swiss-label">로딩 중...</span>
          </div>
        ) : !groupDetail ? (
          <div className="text-center py-20">
            <p className="swiss-label text-gray-400">그룹을 찾을 수 없습니다.</p>
          </div>
        ) : (
          <>
            {/* Group header */}
            <div className="border-b-2 border-black pb-8 mb-10">
              <div className="flex items-center gap-3 mb-2">
                <Folder size={20} className="text-[var(--swiss-red)]" />
                <h1 className="text-3xl font-black">{groupDetail.name}</h1>
              </div>
              {groupDetail.description && (
                <p className="text-sm text-gray-500 mt-2">{groupDetail.description}</p>
              )}
              <div className="flex items-center gap-4 mt-4">
                <span className="swiss-label">{groupDetail.documents?.length ?? 0}개 문서</span>
                <span
                  className={`text-xs font-bold px-3 py-1 ${
                    groupDetail.analysisStatus === "done"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {groupDetail.analysisStatus === "done" ? "분석 완료" : "미분석"}
                </span>
              </div>
            </div>

            {/* Documents in group */}
            <div className="grid grid-cols-12 gap-0">
              <div className="col-span-12">
                <div className="swiss-label mb-6">그룹 내 문서</div>
                {!groupDetail.documents || groupDetail.documents.length === 0 ? (
                  <div className="border border-gray-200 p-12 text-center">
                    <FileText size={32} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400">그룹에 문서가 없습니다.</p>
                    <button
                      onClick={() => navigate("/dashboard")}
                      className="mt-4 text-sm font-bold underline hover:text-[var(--swiss-red)] transition-colors"
                    >
                      대시보드에서 파일 추가하기
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupDetail.documents.map((doc: {
                      id: number;
                      title: string;
                      fileType?: string | null;
                      analysisStatus: string;
                      structure?: unknown;
                    }) => {
                      const structure = doc.structure as {
                        chapters?: Array<{
                          id: string;
                          title: string;
                          topics?: Array<{ id: string; title: string; description?: string }>;
                        }>;
                      } | null;

                      return (
                        <div key={doc.id} className="border border-black">
                          {/* Doc header */}
                          <div
                            className="flex items-center justify-between p-5 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => navigate(`/documents/${doc.id}`)}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 flex-shrink-0 ${doc.analysisStatus === "done" ? "swiss-red-bg" : "bg-gray-300"}`} />
                              <span className="font-bold">{doc.title}</span>
                              {doc.fileType && (
                                <span className="text-xs font-bold px-2 py-0.5 bg-gray-100 text-gray-600">
                                  {doc.fileType.toUpperCase()}
                                </span>
                              )}
                            </div>
                            <ChevronRight size={16} className="text-gray-300" />
                          </div>

                          {/* Topics from this doc */}
                          {doc.analysisStatus === "done" && structure?.chapters ? (
                            <div className="p-5">
                              <div className="swiss-label mb-4 text-xs">학습 토픽 선택</div>
                              <div className="grid grid-cols-2 gap-3">
                                {structure.chapters.flatMap((ch) =>
                                  (ch.topics ?? []).map((topic) => (
                                    <button
                                      key={topic.id}
                                      onClick={() => handleStartLearning(topic.id, topic.title, doc.id)}
                                      disabled={startingTopicId === topic.id}
                                      className="text-left p-4 border border-black hover:bg-black hover:text-white transition-colors group disabled:opacity-50"
                                    >
                                      <div className="flex items-start gap-2">
                                        <BookOpen size={12} className="mt-0.5 flex-shrink-0 group-hover:text-white text-[var(--swiss-red)]" />
                                        <div>
                                          <p className="text-xs font-bold">{topic.title}</p>
                                          {topic.description && (
                                            <p className="text-xs text-gray-400 group-hover:text-gray-300 mt-0.5 line-clamp-2">
                                              {topic.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      {startingTopicId === topic.id && (
                                        <div className="mt-2 text-xs opacity-70">시작 중...</div>
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="p-5 text-sm text-gray-400">
                              {doc.analysisStatus === "done" ? "토픽 정보 없음" : "분석이 필요합니다. 문서를 열어 분석을 실행하세요."}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
