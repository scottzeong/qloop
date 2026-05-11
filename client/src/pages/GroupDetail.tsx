import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import React, { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Folder, FileText, BookOpen, ChevronRight,
  BarChart2, LogOut, AlertCircle, CheckCircle2, Lock, GitBranch, Map, Route,
  Pencil, Check, X
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
  const [qloopModel, setQloopModel] = useState<"core" | "curated" | "open">("core");

  // 그룹 이름/설명 인라인 편집 state
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");

  const updateGroupMutation = trpc.group.update.useMutation({
    onSuccess: () => {
      refetch();
      setIsEditingGroup(false);
      toast.success("그룹 정보가 수정되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleStartEditGroup = () => {
    setEditGroupName(groupDetail?.name ?? "");
    setEditGroupDescription(groupDetail?.description ?? "");
    setIsEditingGroup(true);
  };

  const handleSaveGroup = () => {
    if (!editGroupName.trim()) { toast.error("그룹 이름을 입력해주세요."); return; }
    updateGroupMutation.mutate({ groupId, name: editGroupName.trim(), description: editGroupDescription.trim() });
  };

  const handleCancelEditGroup = () => {
    setIsEditingGroup(false);
  };

  // 통합 분석 state
  const [showGroupAnalysis, setShowGroupAnalysis] = useState(false);

  const analyzeGroupMutation = trpc.group.analyze.useMutation({
    onSuccess: () => {
      refetch();
      setShowGroupAnalysis(true);
      toast.success("통합 분석이 완료되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  // 구조 미리보기 state (문서별): docId -> 선택된 구조 키
  const [previewStructureByDoc, setPreviewStructureByDoc] = useState<Record<number, "tree" | "conceptMap" | "learningPath" | null>>({});

  const togglePreviewStructure = (docId: number, structure: "tree" | "conceptMap" | "learningPath") => {
    setPreviewStructureByDoc(prev => ({
      ...prev,
      [docId]: prev[docId] === structure ? null : structure,
    }));
  };

  const handleConfirmStructure = (docId: number, structure: "tree" | "conceptMap" | "learningPath") => {
    setStructureMutation.mutate({ documentId: docId, structure });
    setPreviewStructureByDoc(prev => ({ ...prev, [docId]: null }));
  };

  const handleStartLearning = (topicId: string, topicTitle: string, documentId: number) => {
    setPendingTopic({ id: topicId, title: topicTitle, documentId });
    setEvalEnabled(null);
    setSelectedPolicyId(null);
    setQloopModel("core");
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
        qloopModel,
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
              {isEditingGroup ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Folder size={20} className="text-[var(--swiss-red)] flex-shrink-0" />
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveGroup(); if (e.key === "Escape") handleCancelEditGroup(); }}
                      className="text-3xl font-black border-b-2 border-black focus:outline-none flex-1 bg-transparent"
                      autoFocus
                      placeholder="그룹 이름"
                    />
                  </div>
                  <textarea
                    value={editGroupDescription}
                    onChange={(e) => setEditGroupDescription(e.target.value)}
                    className="w-full text-sm text-gray-600 border border-black/30 focus:border-black focus:outline-none p-2 resize-none"
                    rows={2}
                    placeholder="그룹 설명 (선택사항)"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveGroup}
                      disabled={updateGroupMutation.isPending}
                      className="flex items-center gap-1 bg-black text-white px-4 py-1.5 text-xs font-bold uppercase tracking-widest hover:bg-[var(--swiss-red)] transition-colors disabled:opacity-50"
                    >
                      <Check size={12} /> 저장
                    </button>
                    <button
                      onClick={handleCancelEditGroup}
                      className="flex items-center gap-1 border border-black/30 px-4 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-black transition-colors"
                    >
                      <X size={12} /> 취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2 group">
                    <Folder size={20} className="text-[var(--swiss-red)]" />
                    <h1 className="text-3xl font-black">{groupDetail.name}</h1>
                    <button
                      onClick={handleStartEditGroup}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-[var(--swiss-red)]"
                      title="그룹 이름/설명 수정"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                  {groupDetail.description ? (
                    <p className="text-sm text-gray-500 mt-2">{groupDetail.description}</p>
                  ) : (
                    <button
                      onClick={handleStartEditGroup}
                      className="text-xs text-gray-300 mt-2 hover:text-gray-500 transition-colors italic"
                    >
                      + 그룹 설명 추가
                    </button>
                  )}
                </>
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

            {/* 통합 분석 섹션 */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <div className="swiss-label">통합 분석</div>
                <div className="flex items-center gap-3">
                  {!!groupDetail.structure && (
                    <button
                      onClick={() => setShowGroupAnalysis(v => !v)}
                      className="text-xs font-bold underline hover:text-[var(--swiss-red)] transition-colors"
                    >
                      {showGroupAnalysis ? "분석 결과 접기" : "분석 결과 보기"}
                    </button>
                  )}
                  <button
                    onClick={() => analyzeGroupMutation.mutate({ groupId })}
                    disabled={analyzeGroupMutation.isPending || groupDetail.analysisStatus === "analyzing"}
                    className="flex items-center gap-2 bg-black text-white px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-[var(--swiss-red)] transition-colors disabled:opacity-50"
                  >
                    {analyzeGroupMutation.isPending || groupDetail.analysisStatus === "analyzing" ? (
                      <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> 분석 중...</>
                    ) : (
                      <><GitBranch size={12} /> {groupDetail.structure ? "재분석" : "통합 분석 시작"}</>
                    )}
                  </button>
                </div>
              </div>

              {!groupDetail.structure && !analyzeGroupMutation.isPending && groupDetail.analysisStatus !== "analyzing" && groupDetail.analysisStatus !== "done" && (
                <div className="border border-dashed border-black/20 p-8 text-center">
                  <GitBranch size={28} className="mx-auto mb-3 text-gray-200" />
                  <p className="text-sm text-gray-400 mb-1">그룹 내 모든 문서를 통합 분석하여</p>
                  <p className="text-xs text-gray-300">단일 목차 · 개념맵 · 학습경로를 생성합니다</p>
                </div>
              )}

              {(analyzeGroupMutation.isPending || groupDetail.analysisStatus === "analyzing") && (
                <div className="border border-black/10 p-8 text-center">
                  <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm font-bold">그룹 내 문서를 통합 분석 중...</p>
                  <p className="text-xs text-gray-400 mt-1">AI가 모든 문서를 함께 분석하고 있습니다. 잠시 기다려주세요.</p>
                </div>
              )}

              {showGroupAnalysis && !!groupDetail.structure && (() => {
                const gs = groupDetail.structure as any;
                return (
                  <div className="border-2 border-black p-6 space-y-6">
                    {gs.summary && (
                      <div>
                        <div className="swiss-label mb-2">요약</div>
                        <p className="text-sm text-gray-600">{gs.summary}</p>
                      </div>
                    )}
                    {gs.chapters && gs.chapters.length > 0 && (
                      <div>
                        <div className="swiss-label mb-3">통합 목차 트리</div>
                        <div className="space-y-2">
                          {gs.chapters.map((ch: any, i: number) => (
                            <div key={i} className="border border-black/10 p-3">
                              <div className="font-bold text-sm mb-2">{ch.title}</div>
                              {ch.topics && ch.topics.length > 0 && (
                                <div className="space-y-1 pl-4">
                                  {ch.topics.map((t: any, j: number) => (
                                    <div key={j} className="flex items-center justify-between gap-2 py-1">
                                      <div className="flex items-center gap-2 text-xs text-gray-600">
                                        <ChevronRight size={10} className="flex-shrink-0" />
                                        {t.title}
                                      </div>
                                      <button
                                        onClick={() => {
                                          const firstDoc = groupDetail.documents?.[0];
                                          if (firstDoc) handleStartLearning(t.id || `ch${i}_t${j}`, t.title, firstDoc.id);
                                        }}
                                        className="flex-shrink-0 text-xs font-bold px-2 py-0.5 bg-black text-white hover:bg-[var(--swiss-red)] transition-colors"
                                      >
                                        학습
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {gs.conceptMap && gs.conceptMap.length > 0 && (
                      <div>
                        <div className="swiss-label mb-3">개념 맵</div>
                        <div className="grid grid-cols-2 gap-2">
                          {gs.conceptMap.map((c: any, i: number) => (
                            <div key={i} className="border border-black/20 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="font-bold text-xs block">{c.concept}</span>
                                  {c.relatedConcepts && c.relatedConcepts.length > 0 && (
                                    <span className="text-gray-400 text-xs">→ {c.relatedConcepts.slice(0, 2).join(", ")}</span>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    const firstDoc = groupDetail.documents?.[0];
                                    if (firstDoc) handleStartLearning(c.id || `concept_${i}`, c.concept, firstDoc.id);
                                  }}
                                  className="flex-shrink-0 text-xs font-bold px-2 py-0.5 bg-black text-white hover:bg-[var(--swiss-red)] transition-colors"
                                >
                                  학습
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {gs.learningPath && gs.learningPath.length > 0 && (
                      <div>
                        <div className="swiss-label mb-3">학습 경로</div>
                        <div className="space-y-2">
                          {gs.learningPath.map((step: any, i: number) => (
                            <div key={i} className="border border-black/10 p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-6 h-6 bg-black text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{step.step ?? i + 1}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm">{step.title}</div>
                                  {step.description && (
                                    <div className="text-xs text-gray-500 mt-0.5">{step.description}</div>
                                  )}
                                  {step.topics && step.topics.length > 0 && (
                                    <div className="text-xs text-gray-400 mt-1">{step.topics.map((t: any) => t.title).join(" · ")}</div>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    const firstDoc = groupDetail.documents?.[0];
                                    const topicTitle = step.topics?.[0]?.title || step.title;
                                    const topicId = step.topics?.[0]?.id || `step_${step.step ?? i + 1}`;
                                    if (firstDoc) handleStartLearning(topicId, topicTitle, firstDoc.id);
                                  }}
                                  className="flex-shrink-0 text-xs font-bold px-3 py-1.5 bg-black text-white hover:bg-[var(--swiss-red)] transition-colors"
                                >
                                  학습 시작
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Documents in group */}
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <div className="swiss-label">그룹 내 문서</div>
                {!!groupDetail.structure && (
                  <span className="text-xs text-gray-400">통합 분석 완료 — 위 분석 결과에서 학습을 시작하세요</span>
                )}
              </div>

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

                        {/* 분석 완료 + 구조 미선택: 미리보기 + 확정 2단계 (통합 분석 미완료 시만 표시) */}
                        {isDone && structure && !isLocked && !groupDetail.structure && (() => {
                          type StructureKey = "tree" | "conceptMap" | "learningPath";
                          const docPreview = previewStructureByDoc[doc.id] ?? null;
                          const structureOptions: Array<{
                            key: StructureKey;
                            label: string;
                            icon: React.ReactNode;
                            stat: string;
                            available: boolean;
                          }> = [
                            {
                              key: "tree",
                              label: "목차 트리",
                              icon: <GitBranch size={16} />,
                              stat: `${structure.chapters?.length ?? 0}개 챕터`,
                              available: true,
                            },
                            {
                              key: "conceptMap",
                              label: "개념 맵",
                              icon: <Map size={16} />,
                              stat: `${structure.conceptMap?.length ?? 0}개 개념`,
                              available: !!(structure.conceptMap && structure.conceptMap.length > 0),
                            },
                            {
                              key: "learningPath",
                              label: "학습 경로",
                              icon: <Route size={16} />,
                              stat: `${structure.learningPath?.length ?? 0}단계`,
                              available: !!(structure.learningPath && structure.learningPath.length > 0),
                            },
                          ];
                          return (
                            <div>
                              {/* 구조 선택 카드 */}
                              <div className="px-5 pt-4 pb-3">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-xs font-bold uppercase tracking-widest text-black/50">학습 구조 선택</p>
                                  <p className="text-xs text-black/30">클릭해 미리본 후 확정하세요</p>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  {structureOptions.map((s) => {
                                    const isSelected = docPreview === s.key;
                                    return (
                                      <button
                                        key={s.key}
                                        onClick={() => s.available && togglePreviewStructure(doc.id, s.key)}
                                        disabled={!s.available}
                                        className={`p-3 text-left border-2 transition-all ${
                                          !s.available
                                            ? "opacity-40 cursor-not-allowed border-black/20 bg-white"
                                            : isSelected
                                            ? "border-black bg-black text-white"
                                            : "border-black/30 bg-white hover:border-black"
                                        }`}
                                      >
                                        <div className={`mb-1.5 ${isSelected ? "text-red-300" : "text-red-600"}`}>{s.icon}</div>
                                        <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${isSelected ? "text-white" : "text-black"}`}>{s.label}</div>
                                        <div className={`text-xs ${isSelected ? "text-white/60" : "text-black/40"}`}>{s.stat}</div>
                                        {isSelected && <div className="mt-1.5 text-xs text-white/50">미리보기 중</div>}
                                        {!s.available && <div className="mt-1 text-xs text-black/30">데이터 없음</div>}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {/* 미리보기 영역 */}
                              {docPreview && (
                                <div className="border-t border-black/10">
                                  <div className="px-5 py-3 bg-black/[0.02] flex items-center justify-between gap-3">
                                    <span className="text-xs font-bold uppercase tracking-widest text-black/40">
                                      미리보기 — {structureOptions.find(s => s.key === docPreview)?.label}
                                    </span>
                                    <button
                                      onClick={() => handleConfirmStructure(doc.id, docPreview)}
                                      disabled={setStructureMutation.isPending}
                                      className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
                                    >
                                      {setStructureMutation.isPending ? "확정 중…" : "이 구조로 학습하기 →"}
                                    </button>
                                  </div>
                                  <div className="px-5 py-4 max-h-80 overflow-y-auto text-sm">
                                    {docPreview === "tree" && structure.chapters && (
                                      <div className="space-y-2">
                                        {structure.chapters.map((ch: any) => (
                                          <div key={ch.id} className="border border-black/10">
                                            <div className="bg-black/5 px-3 py-2 text-xs font-bold uppercase tracking-widest">{ch.title}</div>
                                            <div className="divide-y divide-black/5">
                                              {(ch.topics ?? []).map((t: any) => (
                                                <div key={t.id} className="px-3 py-2 text-xs text-black/70">{t.title}</div>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {docPreview === "conceptMap" && structure.conceptMap && (
                                      <div className="flex flex-wrap gap-2">
                                        {structure.conceptMap.map((n: any) => (
                                          <span key={n.id} className="text-xs border border-black/20 px-2 py-1 font-medium">{n.concept}</span>
                                        ))}
                                      </div>
                                    )}
                                    {docPreview === "learningPath" && structure.learningPath && (
                                      <div className="space-y-2">
                                        {structure.learningPath.map((step: any, idx: number) => (
                                          <div key={step.step ?? idx} className="flex items-start gap-3 border border-black/10 px-3 py-2">
                                            <span className="text-xs font-black text-black/40 w-5 flex-shrink-0">{String(step.step ?? idx+1).padStart(2,"0")}</span>
                                            <span className="text-xs text-black/70">{step.title}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {!docPreview && (
                                <div className="px-5 pb-4 text-center">
                                  <p className="text-xs text-black/30">위 카드를 클릭하면 구조를 미리볼 수 있습니다.</p>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* 분석 완료 + 구조 선택 완료 → 토픽 표시 (통합 분석 미완료 시만 표시) */}
                        {isDone && structure && isLocked && selectedStructure && !groupDetail.structure && (
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
        <DialogContent className="max-w-md p-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="px-6 py-4 border-b border-black shrink-0">
            <DialogTitle className="text-sm font-black uppercase tracking-widest">평가 설정</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            {pendingTopic && (
              <div className="bg-black/5 px-4 py-3">
                <p className="text-xs text-black/40 font-bold uppercase tracking-widest mb-1">선택된 토픽</p>
                <p className="text-sm font-bold">{pendingTopic.title}</p>
              </div>
            )}
            {/* QLoop 모델 선택 */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-black/50 mb-3">QLoop 모델 선택</p>
              <div className="space-y-2">
                <button
                  onClick={() => setQloopModel("core")}
                  className={`w-full border-2 p-3 text-left transition-colors ${qloopModel === "core" ? "border-black bg-black text-white" : "border-black/20 hover:border-black"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${qloopModel === "core" ? "border-white" : "border-black/30"}`}>
                      {qloopModel === "core" && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-black">Core QLoop</div>
                      <div className={`text-xs mt-0.5 ${qloopModel === "core" ? "opacity-70" : "text-black/40"}`}>업로드한 학습자료와 학습그룹만으로 학습</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setQloopModel("curated")}
                  className={`w-full border-2 p-3 text-left transition-colors ${qloopModel === "curated" ? "border-red-600 bg-red-600 text-white" : "border-black/20 hover:border-red-400"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${qloopModel === "curated" ? "border-white" : "border-black/30"}`}>
                      {qloopModel === "curated" && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-black">Curated QLoop</div>
                      <div className={`text-xs mt-0.5 ${qloopModel === "curated" ? "opacity-70" : "text-black/40"}`}>Core QLoop + Knowledge Library 전체 자동 참조</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setQloopModel("open")}
                  className={`w-full border-2 p-3 text-left transition-colors ${qloopModel === "open" ? "border-blue-600 bg-blue-600 text-white" : "border-black/20 hover:border-blue-400"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${qloopModel === "open" ? "border-white" : "border-black/30"}`}>
                      {qloopModel === "open" && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-black">Open QLoop</div>
                      <div className={`text-xs mt-0.5 ${qloopModel === "open" ? "opacity-70" : "text-black/40"}`}>Curated QLoop + 인터넷 검색으로 최신 정보까지 참조</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
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
