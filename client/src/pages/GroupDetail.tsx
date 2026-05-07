import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Folder, FileText, BookOpen, ChevronRight,
  BarChart2, LogOut, AlertCircle, CheckCircle2, Lock, GitBranch, Map, Route
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STRUCTURE_LABELS: Record<string, string> = {
  tree: "목차 트리",
  conceptMap: "개념 맵",
  learningPath: "학습 경로",
};

export default function GroupDetail() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const groupId = Number(params.id);

  const { data: groupDetail, isLoading, refetch } = trpc.group.get.useQuery(
    { groupId },
    { enabled: isAuthenticated && !isNaN(groupId) }
  );
  const startSessionMutation = trpc.session.start.useMutation();
  const setStructureMutation = trpc.document.setStructure.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: policies } = trpc.socratic.getPolicies.useQuery(undefined, { enabled: isAuthenticated });

  // 평가 선택 모달 state
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [pendingTopic, setPendingTopic] = useState<{ id: string; title: string; documentId: number } | null>(null);
  const [evalEnabled, setEvalEnabled] = useState<boolean | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  // 구조 선택 모달 state (문서별)
  const [showStructureModal, setShowStructureModal] = useState(false);
  const [pendingStructureDocId, setPendingStructureDocId] = useState<number | null>(null);

  const handleSelectStructure = (docId: number, structure: "tree" | "conceptMap" | "learningPath") => {
    setStructureMutation.mutate({ documentId: docId, structure });
    setShowStructureModal(false);
    setPendingStructureDocId(null);
  };

  const handleStartLearning = (topicId: string, topicTitle: string, documentId: number) => {
    setPendingTopic({ id: topicId, title: topicTitle, documentId });
    setEvalEnabled(null);
    setSelectedPolicyId(null);
    setShowEvalModal(true);
  };

  const handleConfirmStart = async () => {
    if (!pendingTopic || starting) return;
    if (evalEnabled === null) {
      toast.error("평가 여부를 선택해주세요.");
      return;
    }
    if (evalEnabled && !selectedPolicyId) {
      toast.error("평가 정책을 선택해주세요.");
      return;
    }
    setShowEvalModal(false);
    setStarting(true);
    try {
      const { sessionId } = await startSessionMutation.mutateAsync({
        documentId: pendingTopic.documentId,
        topicId: pendingTopic.id,
        topicTitle: pendingTopic.title,
        topicDescription: "",
        evaluationEnabled: evalEnabled,
        evaluationPolicyId: evalEnabled ? (selectedPolicyId ?? undefined) : undefined,
      });
      navigate(`/sessions/${sessionId}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "학습 시작 실패");
      setStarting(false);
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

  // 구조 선택 모달에서 사용할 문서 구조 정보
  const pendingDoc = pendingStructureDocId
    ? groupDetail?.documents?.find((d: any) => d.id === pendingStructureDocId)
    : null;
  const pendingDocStructure = pendingDoc?.structure as any;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-black bg-white z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center cursor-pointer" onClick={() => navigate("/")}>
            <img src="/manus-storage/Logo-QLoop_277bc2d4.png" alt="QLoop" className="h-8 w-auto" />
          </div>
          <nav className="flex items-center gap-6">
            <button onClick={() => navigate("/history")} className="swiss-label hover:text-black transition-colors flex items-center gap-1">
              <BarChart2 size={12} /> LEARNING HISTORY
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
            <div className="space-y-6">
              <div className="swiss-label mb-2">그룹 내 문서</div>

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
                  {groupDetail.documents.map((doc: any) => {
                    const structure = doc.structure as {
                      chapters?: Array<{
                        id: string;
                        title: string;
                        topics?: Array<{ id: string; title: string; description?: string }>;
                      }>;
                      conceptMap?: Array<{ id: string; concept: string; relatedConcepts?: string[] }>;
                      learningPath?: Array<{ step: number; title: string; topics?: Array<{ id: string; title: string }> }>;
                    } | null;

                    const isLocked = doc.structureLocked === 1;
                    const selectedStructure = doc.selectedStructure as "tree" | "conceptMap" | "learningPath" | null;
                    const isDone = doc.analysisStatus === "done";
                    const topicProgress: Record<string, "completed" | "active"> = (groupDetail as any).topicProgressByDoc?.[doc.id] ?? {};

                    return (
                      <div key={doc.id} className="border-2 border-black">
                        {/* Doc header */}
                        <div className="flex items-center justify-between p-5 border-b border-black/20 bg-black/[0.02]">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 flex-shrink-0 rounded-full ${isDone ? "bg-red-600" : "bg-gray-300"}`} />
                            <span className="font-bold">{doc.title}</span>
                            {doc.fileType && (
                              <span className="text-xs font-bold px-2 py-0.5 bg-gray-100 text-gray-600">
                                {doc.fileType.toUpperCase()}
                              </span>
                            )}
                            {isLocked && selectedStructure && (
                              <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-black text-white">
                                <Lock size={10} />
                                {STRUCTURE_LABELS[selectedStructure]}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => navigate(`/documents/${doc.id}`)}
                            className="flex items-center gap-1 text-xs swiss-label hover:text-black transition-colors"
                          >
                            문서 열기 <ChevronRight size={12} />
                          </button>
                        </div>

                        {/* 미분석 상태 */}
                        {!isDone && (
                          <div className="p-5 flex items-center gap-2 text-sm text-gray-400">
                            <AlertCircle size={14} />
                            분석이 필요합니다. 문서를 열어 분석을 실행하세요.
                          </div>
                        )}

                        {/* 분석 완료 + 구조 미선택 */}
                        {isDone && structure && !isLocked && (
                          <div className="p-5">
                            <div className="flex items-center justify-between mb-4">
                              <p className="text-xs font-bold uppercase tracking-widest text-black/50">학습 구조 선택</p>
                              <p className="text-xs text-black/40">한 번 선택하면 해당 구조로만 학습됩니다</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              {/* 목차 트리 */}
                              <button
                                onClick={() => handleSelectStructure(doc.id, "tree")}
                                disabled={setStructureMutation.isPending}
                                className="border-2 border-black p-4 text-left hover:bg-black hover:text-white transition-colors group disabled:opacity-50"
                              >
                                <GitBranch size={18} className="mb-2 text-red-600 group-hover:text-red-300" />
                                <div className="text-sm font-bold uppercase tracking-widest mb-1">목차 트리</div>
                                <div className="text-xs text-black/50 group-hover:text-white/60">체계적인 챕터·토픽 구조</div>
                                <div className="mt-2 text-xs font-bold text-red-600 group-hover:text-red-300">
                                  {structure.chapters?.length ?? 0}개 챕터
                                </div>
                              </button>
                              {/* 개념 맵 */}
                              {structure.conceptMap && structure.conceptMap.length > 0 ? (
                                <button
                                  onClick={() => handleSelectStructure(doc.id, "conceptMap")}
                                  disabled={setStructureMutation.isPending}
                                  className="border-2 border-black p-4 text-left hover:bg-black hover:text-white transition-colors group disabled:opacity-50"
                                >
                                  <Map size={18} className="mb-2 text-red-600 group-hover:text-red-300" />
                                  <div className="text-sm font-bold uppercase tracking-widest mb-1">개념 맵</div>
                                  <div className="text-xs text-black/50 group-hover:text-white/60">개념 간 연결 관계 학습</div>
                                  <div className="mt-2 text-xs font-bold text-red-600 group-hover:text-red-300">
                                    {structure.conceptMap.length}개 개념
                                  </div>
                                </button>
                              ) : (
                                <div className="border-2 border-black/20 p-4 opacity-40">
                                  <Map size={18} className="mb-2 text-gray-400" />
                                  <div className="text-sm font-bold uppercase tracking-widest mb-1">개념 맵</div>
                                  <div className="text-xs text-black/40">데이터 없음</div>
                                </div>
                              )}
                              {/* 학습 경로 */}
                              {structure.learningPath && structure.learningPath.length > 0 ? (
                                <button
                                  onClick={() => handleSelectStructure(doc.id, "learningPath")}
                                  disabled={setStructureMutation.isPending}
                                  className="border-2 border-black p-4 text-left hover:bg-black hover:text-white transition-colors group disabled:opacity-50"
                                >
                                  <Route size={18} className="mb-2 text-red-600 group-hover:text-red-300" />
                                  <div className="text-sm font-bold uppercase tracking-widest mb-1">학습 경로</div>
                                  <div className="text-xs text-black/50 group-hover:text-white/60">AI 추천 단계별 순서</div>
                                  <div className="mt-2 text-xs font-bold text-red-600 group-hover:text-red-300">
                                    {structure.learningPath.length}단계
                                  </div>
                                </button>
                              ) : (
                                <div className="border-2 border-black/20 p-4 opacity-40">
                                  <Route size={18} className="mb-2 text-gray-400" />
                                  <div className="text-sm font-bold uppercase tracking-widest mb-1">학습 경로</div>
                                  <div className="text-xs text-black/40">데이터 없음</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 분석 완료 + 구조 선택 완료 → 토픽 표시 */}
                        {isDone && structure && isLocked && selectedStructure && (
                          <div className="p-5">
                            {selectedStructure === "tree" && structure.chapters && (
                              <>
                                <div className="swiss-label mb-4 text-xs">학습 토픽 선택 (목차 트리)</div>
                                <div className="grid grid-cols-2 gap-3">
                                  {structure.chapters.flatMap((ch) =>
                                    (ch.topics ?? []).map((topic) => {
                                      const tStatus = topicProgress[topic.id];
                                      if (tStatus === "active") {
                                        return (
                                          <div key={topic.id} className="p-4 border border-gray-300 bg-gray-50">
                                            <div className="flex items-start gap-2">
                                              <BookOpen size={12} className="mt-0.5 flex-shrink-0 text-gray-400" />
                                              <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-gray-600">{topic.title}</p>
                                                <span className="text-xs font-bold text-gray-500">진행 중</span>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return (
                                        <button
                                          key={topic.id}
                                          onClick={() => handleStartLearning(topic.id, topic.title, doc.id)}
                                          disabled={starting}
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
                                              {tStatus === "completed" && (
                                                <span className="text-xs font-bold text-green-600">✓ 완료</span>
                                              )}
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              </>
                            )}

                            {selectedStructure === "conceptMap" && structure.conceptMap && (
                              <>
                                <div className="swiss-label mb-4 text-xs">학습 토픽 선택 (개념 맵)</div>
                                <div className="grid grid-cols-2 gap-3">
                                  {structure.conceptMap.map((node: any) => {
                                    const nStatus = topicProgress[node.id];
                                    if (nStatus === "active") {
                                      return (
                                        <div key={node.id} className="p-4 border border-gray-300 bg-gray-50">
                                          <div className="flex items-start gap-2">
                                            <Map size={12} className="mt-0.5 flex-shrink-0 text-gray-400" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-bold text-gray-600">{node.concept}</p>
                                              <span className="text-xs font-bold text-gray-500">진행 중</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return (
                                      <button
                                        key={node.id}
                                        onClick={() => handleStartLearning(node.id, node.concept, doc.id)}
                                        disabled={starting}
                                        className="text-left p-4 border border-black hover:bg-black hover:text-white transition-colors group disabled:opacity-50"
                                      >
                                        <div className="flex items-start gap-2">
                                          <Map size={12} className="mt-0.5 flex-shrink-0 group-hover:text-white text-[var(--swiss-red)]" />
                                          <div>
                                            <p className="text-xs font-bold">{node.concept}</p>
                                            {node.relatedConcepts && node.relatedConcepts.length > 0 && (
                                              <p className="text-xs text-gray-400 group-hover:text-gray-300 mt-0.5 line-clamp-1">
                                                연관: {node.relatedConcepts.slice(0, 2).join(", ")}
                                              </p>
                                            )}
                                            {nStatus === "completed" && (
                                              <span className="text-xs font-bold text-green-600">✓ 완료</span>
                                            )}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}

                            {selectedStructure === "learningPath" && structure.learningPath && (
                              <>
                                <div className="swiss-label mb-4 text-xs">학습 토픽 선택 (학습 경로)</div>
                                <div className="space-y-3">
                                  {structure.learningPath.map((step: any) => (
                                    <div key={step.step} className="border border-black/20">
                                      <div className="px-4 py-2 bg-black/5 border-b border-black/10">
                                        <span className="text-xs font-bold uppercase tracking-widest">
                                          Step {step.step}: {step.title}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 p-3">
                                        {(step.topics ?? []).map((topic: any) => {
                                          const tpStatus = topicProgress[topic.id];
                                          if (tpStatus === "active") {
                                            return (
                                              <div key={topic.id} className="p-3 border border-gray-300 bg-gray-50">
                                                <div className="flex items-start gap-2">
                                                  <Route size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
                                                  <div>
                                                    <p className="text-xs font-bold text-gray-600">{topic.title}</p>
                                                    <span className="text-xs font-bold text-gray-500">진행 중</span>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          }
                                          return (
                                            <button
                                              key={topic.id}
                                              onClick={() => handleStartLearning(topic.id, topic.title, doc.id)}
                                              disabled={starting}
                                              className="text-left p-3 border border-black hover:bg-black hover:text-white transition-colors group disabled:opacity-50"
                                            >
                                              <div className="flex items-start gap-2">
                                                <Route size={11} className="mt-0.5 flex-shrink-0 group-hover:text-white text-[var(--swiss-red)]" />
                                                <div>
                                                  <p className="text-xs font-bold">{topic.title}</p>
                                                  {tpStatus === "completed" && (
                                                    <span className="text-xs font-bold text-green-600">✓ 완료</span>
                                                  )}
                                                </div>
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* 평가 선택 모달 */}
      <Dialog open={showEvalModal} onOpenChange={(open) => { if (!open) { setShowEvalModal(false); setPendingTopic(null); } }}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="px-6 py-4 border-b border-black">
            <DialogTitle className="text-sm font-black uppercase tracking-widest">평가 설정</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            {pendingTopic && (
              <div className="bg-black/5 px-4 py-3">
                <p className="text-xs text-black/40 font-bold uppercase tracking-widest mb-1">선택된 토픽</p>
                <p className="text-sm font-bold">{pendingTopic.title}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-black/50 mb-3">평가 여부 선택 <span className="text-red-600">*필수</span></p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setEvalEnabled(false); setSelectedPolicyId(null); }}
                  className={`border-2 p-4 text-left transition-colors ${
                    evalEnabled === false ? "border-black bg-black text-white" : "border-black/30 hover:border-black"
                  }`}
                >
                  <div className="text-sm font-bold mb-1">평가 없이 학습</div>
                  <div className="text-xs opacity-60">평가 없이 자유롭게 학습합니다</div>
                </button>
                <button
                  onClick={() => setEvalEnabled(true)}
                  className={`border-2 p-4 text-left transition-colors ${
                    evalEnabled === true ? "border-red-600 bg-red-600 text-white" : "border-black/30 hover:border-black"
                  }`}
                >
                  <div className="text-sm font-bold mb-1">평가 포함 학습</div>
                  <div className="text-xs opacity-60">학습 중 평가가 진행됩니다</div>
                </button>
              </div>
            </div>
            {evalEnabled === true && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-black/50 mb-3">평가 정책 선택 <span className="text-red-600">*필수</span></p>
                {!policies || policies.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-black/50 border border-black/20 p-3">
                    <AlertCircle size={14} />
                    <span>등록된 평가 정책이 없습니다. 관리자에게 평가 정책 설정을 요청하세요.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {policies.map((policy) => (
                      <button
                        key={policy.id}
                        onClick={() => setSelectedPolicyId(policy.id)}
                        className={`w-full border-2 p-3 text-left transition-colors ${
                          selectedPolicyId === policy.id ? "border-red-600 bg-red-50" : "border-black/20 hover:border-black"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {selectedPolicyId === policy.id && <CheckCircle2 size={14} className="text-red-600 flex-shrink-0" />}
                          <div>
                            <div className="text-sm font-bold">{policy.name}</div>
                            {policy.description && <div className="text-xs text-black/50 mt-0.5">{policy.description}</div>}
                            <div className="text-xs text-black/30 mt-0.5">모드: {policy.mode}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowEvalModal(false); setPendingTopic(null); }}
                className="flex-1 border border-black/30 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-black transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleConfirmStart}
                disabled={evalEnabled === null || (evalEnabled === true && !selectedPolicyId)}
                className="flex-1 bg-red-600 text-white py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                학습 시작
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 세션 시작 로딩 오버레이 */}
      {starting && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
          <div className="flex items-center gap-4 border-2 border-black px-8 py-6 bg-white">
            <div className="w-4 h-4 bg-red-600 animate-pulse" />
            <div>
              <p className="font-bold text-sm uppercase tracking-widest">학습 세션 준비 중</p>
              <p className="text-xs text-black/50 mt-1">AI가 첫 번째 질문을 생성하고 있습니다…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
