
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useParams } from "wouter";
import React, { useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import {
  Folder, ChevronRight,
  AlertCircle, CheckCircle2, Lock, GitBranch, Map, Route,
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
  const { data: topicProgressData } = trpc.session.getGroupTopicProgress.useQuery(
    { groupId },
    { enabled: isAuthenticated && !isNaN(groupId) }
  );
  const topicProgress: Record<string, "completed" | "active"> = topicProgressData ?? {};
  const { data: policies } = trpc.socratic.getPolicies.useQuery(undefined, { enabled: isAuthenticated });

  const [showEvalModal, setShowEvalModal] = useState(false);
  const [pendingTopic, setPendingTopic] = useState<{ id: string; title: string; documentId: number } | null>(null);
  const [evalEnabled, setEvalEnabled] = useState<boolean | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [qloopModel, setQloopModel] = useState<"core" | "curated" | "open">("core");

  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");

  const updateGroupMutation = trpc.group.update.useMutation({
    onSuccess: () => { refetch(); setIsEditingGroup(false); toast.success("그룹 정보가 수정되었습니다."); },
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

  const [groupPreviewStructure, setGroupPreviewStructure] = useState<"tree" | "conceptMap" | "learningPath" | null>(null);

  const analyzeGroupMutation = trpc.group.analyze.useMutation({
    onSuccess: () => { refetch(); toast.success("통합 분석이 완료되었습니다."); },
    onError: (e) => toast.error(e.message),
  });
  const setGroupStructureMutation = trpc.group.setGroupStructure.useMutation({
    onSuccess: () => { refetch(); setGroupPreviewStructure(null); },
    onError: (e) => toast.error(e.message),
  });
  const unlockGroupStructureMutation = trpc.group.unlockGroupStructure.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  // group.structure에서 topicId/topicTitle에 맞는 description을 찾아 반환
  const findTopicDescription = (topicId: string, topicTitle: string): string => {
    const gs = groupDetail?.structure as any;
    if (!gs) return "";
    // chapters 탐색
    for (const ch of gs.chapters ?? []) {
      for (const t of ch.topics ?? []) {
        if (t.id === topicId || t.title === topicTitle) return t.description ?? "";
        for (const sub of t.subtopics ?? []) {
          if (sub.id === topicId || sub.title === topicTitle) return sub.description ?? "";
        }
      }
    }
    // conceptMap 탐색
    for (const c of gs.conceptMap ?? []) {
      if (c.id === topicId || c.label === topicTitle || c.concept === topicTitle) return c.description ?? "";
    }
    // learningPath 탐색
    for (const step of gs.learningPath ?? []) {
      if (step.id === topicId || step.title === topicTitle) return step.description ?? "";
      for (const t of step.topics ?? []) {
        if (t.id === topicId || t.title === topicTitle) return step.description ?? ""; // 단계 설명으로 대체
      }
    }
    return "";
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
    if (evalEnabled === null) { toast.error("평가 여부를 선택해주세요."); return; }
    if (evalEnabled && !selectedPolicyId) { toast.error("평가 정책을 선택해주세요."); return; }
    setShowEvalModal(false);
    setStarting(true);
    try {
      const { sessionId } = await startSessionMutation.mutateAsync({
        documentId: pendingTopic.documentId,
        topicId: pendingTopic.id,
        topicTitle: pendingTopic.title,
        topicDescription: findTopicDescription(pendingTopic.id, pendingTopic.title),
        groupId,
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
      <div className="min-h-screen bg-[#F8F7F5] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "var(--pm-indigo)" }} />
          <span className="pm-label">로딩 중</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F8F7F5] flex flex-col items-center justify-center gap-6">
        <div className="pm-label">로그인이 필요합니다</div>
        <a
          href={getLoginUrl()}
          className="px-8 py-3 text-sm font-semibold rounded-xl text-white hover:opacity-90 transition-colors"
          style={{ backgroundColor: "var(--pm-indigo)" }}
        >
          로그인
        </a>
      </div>
    );
  }

  // 학습 버튼 헬퍼
  const TopicButton = ({ topicId, topicTitle, docId, size = "md" }: { topicId: string; topicTitle: string; docId: number; size?: "sm" | "md" }) => {
    const st = topicProgress[topicId];
    const sizeClass = size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3.5 py-1.5 text-xs";
    const configs = {
      active: { cls: "border border-amber-400 text-amber-600 bg-amber-50 hover:bg-amber-100", label: "진행중" },
      completed: { cls: "bg-[#F0EFED] text-[#737373] hover:bg-[#E5E5E3]", label: "재학습" },
      default: { cls: "text-white hover:opacity-90", label: size === "sm" ? "학습" : "학습 시작" },
    };
    const { cls, label } = configs[st ?? "default"];
    return (
      <button
        onClick={() => handleStartLearning(topicId, topicTitle, docId)}
        className={`flex-shrink-0 font-semibold rounded-lg transition-all ${sizeClass} ${cls}`}
        style={(!st) ? { backgroundColor: "var(--pm-indigo)" } : {}}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F7F5] flex flex-col">
      <PageHeader title={groupDetail?.name ?? "그룹"} />

      <main className="flex-1 max-w-7xl mx-auto px-8 py-10 w-full">
        {isLoading ? (
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--pm-indigo)" }} />
            <span className="pm-label">로딩 중...</span>
          </div>
        ) : !groupDetail ? (
          <div className="text-center py-20">
            <p className="pm-label text-[#A3A3A3]">그룹을 찾을 수 없습니다.</p>
          </div>
        ) : (
          <>
            {/* Group header */}
            <div className="pm-card p-7 mb-7">
              {isEditingGroup ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Folder size={20} className="flex-shrink-0" style={{ color: "var(--pm-indigo)" }} />
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveGroup(); if (e.key === "Escape") setIsEditingGroup(false); }}
                      className="text-2xl font-bold border-b-2 border-[#E5E5E3] focus:border-[var(--pm-indigo)] focus:outline-none flex-1 bg-transparent transition-colors pb-1"
                      autoFocus placeholder="그룹 이름"
                    />
                  </div>
                  <textarea
                    value={editGroupDescription}
                    onChange={(e) => setEditGroupDescription(e.target.value)}
                    className="w-full text-sm text-[#737373] border border-[#E5E5E3] rounded-xl focus:border-[var(--pm-indigo)] focus:outline-none p-3 resize-none transition-colors"
                    rows={2} placeholder="그룹 설명 (선택사항)"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveGroup}
                      disabled={updateGroupMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "var(--pm-indigo)" }}
                    >
                      <Check size={12} /> 저장
                    </button>
                    <button
                      onClick={() => setIsEditingGroup(false)}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[#E5E5E3] hover:bg-[#F0EFED] transition-colors"
                    >
                      <X size={12} /> 취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2 group">
                    <Folder size={20} style={{ color: "var(--pm-indigo)" }} />
                    <h1 className="text-2xl font-bold">{groupDetail.name}</h1>
                    <button
                      onClick={handleStartEditGroup}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-[#F0EFED] text-[#A3A3A3]"
                      title="그룹 이름/설명 수정"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                  {groupDetail.description ? (
                    <p className="text-sm text-[#737373] mt-1 mb-3">{groupDetail.description}</p>
                  ) : (
                    <button onClick={handleStartEditGroup} className="text-xs text-[#D4D4D2] mt-1 mb-3 hover:text-[#A3A3A3] transition-colors italic">
                      + 그룹 설명 추가
                    </button>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="pm-label">{groupDetail.documents?.length ?? 0}개 문서</span>
                    <span className={`pm-badge ${groupDetail.analysisStatus === "done" ? "pm-badge-green" : "pm-badge-gray"}`}>
                      {groupDetail.analysisStatus === "done" ? "분석 완료" : "미분석"}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* 통합 분석 섹션 */}
            <div className="mb-7">
              <div className="flex items-center justify-between mb-4">
                <p className="pm-label">통합 분석</p>
                <button
                  onClick={() => analyzeGroupMutation.mutate({ groupId })}
                  disabled={analyzeGroupMutation.isPending || groupDetail.analysisStatus === "analyzing"}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "var(--pm-indigo)" }}
                >
                  {analyzeGroupMutation.isPending || groupDetail.analysisStatus === "analyzing" ? (
                    <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> 분석 중...</>
                  ) : (
                    <><GitBranch size={12} /> {groupDetail.structure ? "재분석" : "통합 분석 시작"}</>
                  )}
                </button>
              </div>

              {/* 미분석 */}
              {!groupDetail.structure && !analyzeGroupMutation.isPending && groupDetail.analysisStatus !== "analyzing" && (
                <div className="pm-card p-12 text-center border-2 border-dashed border-[#E5E5E3] shadow-none">
                  <GitBranch size={28} className="mx-auto mb-3 text-[#D4D4D2]" />
                  <p className="text-sm text-[#A3A3A3] mb-1">그룹 내 모든 문서를 통합 분석하여</p>
                  <p className="text-xs text-[#D4D4D2]">단일 목차 · 개념맵 · 학습경로를 생성합니다</p>
                </div>
              )}

              {/* 분석 중 */}
              {(analyzeGroupMutation.isPending || groupDetail.analysisStatus === "analyzing") && (
                <div className="pm-card p-10 text-center">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: "var(--pm-indigo)", borderTopColor: "transparent" }} />
                  <p className="text-sm font-semibold mb-1">그룹 내 문서를 통합 분석 중...</p>
                  <p className="text-xs text-[#A3A3A3]">AI가 모든 문서를 함께 분석하고 있습니다. 잠시 기다려주세요.</p>
                </div>
              )}

              {/* 분석 완료 */}
              {!!groupDetail.structure && !analyzeGroupMutation.isPending && groupDetail.analysisStatus !== "analyzing" && (() => {
                const gs = groupDetail.structure as any;
                const selectedGroupStructure = (groupDetail as any).selectedStructure as "tree" | "conceptMap" | "learningPath" | null;
                const isLocked = (groupDetail as any).structureLocked === 1;
                const firstDoc = groupDetail.documents?.[0];

                type StructureKey = "tree" | "conceptMap" | "learningPath";
                const structureOptions: Array<{
                  key: StructureKey;
                  label: string;
                  icon: React.ReactNode;
                  stat: string;
                  available: boolean;
                }> = [
                  { key: "tree", label: "목차 트리", icon: <GitBranch size={18} />, stat: `${gs.chapters?.length ?? 0}개 챕터`, available: !!(gs.chapters?.length > 0) },
                  { key: "conceptMap", label: "개념 맵", icon: <Map size={18} />, stat: `${gs.conceptMap?.length ?? 0}개 개념`, available: !!(gs.conceptMap?.length > 0) },
                  { key: "learningPath", label: "학습 경로", icon: <Route size={18} />, stat: `${gs.learningPath?.length ?? 0}단계`, available: !!(gs.learningPath?.length > 0) },
                ];

                return (
                  <div>
                    {/* 요약 */}
                    {gs.summary && (
                      <div className="pm-card px-5 py-3.5 mb-4">
                        <p className="text-xs text-[#737373]">{gs.summary}</p>
                      </div>
                    )}

                    {/* ===== 구조 고정 후 ===== */}
                    {isLocked && selectedGroupStructure && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Lock size={12} style={{ color: "var(--pm-indigo)" }} />
                            <span className="pm-label">{STRUCTURE_LABELS[selectedGroupStructure]} 고정됨</span>
                          </div>
                          <button
                            onClick={() => unlockGroupStructureMutation.mutate({ groupId })}
                            disabled={unlockGroupStructureMutation.isPending}
                            className="text-xs font-semibold text-[#A3A3A3] hover:text-[#0F0F0F] transition-colors disabled:opacity-50"
                          >
                            구조 변경
                          </button>
                        </div>

                        {/* 목차 트리 */}
                        {selectedGroupStructure === "tree" && gs.chapters && (
                          <div className="space-y-3">
                            {gs.chapters.map((ch: any, i: number) => (
                              <div key={ch.id || i} className="pm-card overflow-hidden">
                                <div className="bg-[#F8F7F5] px-5 py-2.5 border-b border-[#E5E5E3]">
                                  <span className="text-xs font-semibold text-[#525252] uppercase tracking-wide">{ch.title}</span>
                                </div>
                                <div className="divide-y divide-[#F8F7F5]">
                                  {(ch.topics ?? []).map((t: any, j: number) => {
                                    const tid = t.id || `ch${i}_t${j}`;
                                    const st = topicProgress[tid];
                                    return (
                                      <div key={tid} className="flex items-center justify-between px-5 py-3 gap-3 hover:bg-[#F8F7F5] transition-colors">
                                        <div className="flex items-center gap-2.5 text-sm text-[#525252] flex-1 min-w-0">
                                          {st === "completed" ? <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--pm-indigo)" }} /> :
                                           st === "active" ? <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" /> :
                                           <ChevronRight size={12} className="flex-shrink-0 text-[#D4D4D2]" />}
                                          <span className="truncate">{t.title}</span>
                                          {st === "completed" && <span className="pm-badge pm-badge-gray flex-shrink-0">완료</span>}
                                        </div>
                                        {firstDoc && <TopicButton topicId={tid} topicTitle={t.title} docId={firstDoc.id} />}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 개념 맵 */}
                        {selectedGroupStructure === "conceptMap" && gs.conceptMap && (
                          <div className="grid grid-cols-2 gap-3">
                            {gs.conceptMap.map((c: any, i: number) => {
                              const cid = c.id || `concept_${i}`;
                              return (
                                <div key={cid} className="pm-card p-4 flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-semibold text-sm block truncate">{c.label || c.concept}</span>
                                    {(c.connections || c.relatedConcepts) && (
                                      <span className="text-[#A3A3A3] text-xs truncate block mt-0.5">
                                        → {(c.connections || c.relatedConcepts || []).slice(0, 2).join(", ")}
                                      </span>
                                    )}
                                    {c.description && <span className="text-[#A3A3A3] text-xs line-clamp-1 block mt-0.5">{c.description}</span>}
                                  </div>
                                  {firstDoc && <TopicButton topicId={cid} topicTitle={c.label || c.concept} docId={firstDoc.id} size="sm" />}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 학습 경로 */}
                        {selectedGroupStructure === "learningPath" && gs.learningPath && (
                          <div className="space-y-2.5">
                            {gs.learningPath.map((step: any, i: number) => {
                              const sid = step.topicIds?.[0] || step.topics?.[0]?.id || step.id || `step_${step.step ?? i + 1}`;
                              return (
                                <div key={step.id || step.step || i} className="pm-card overflow-hidden">
                                  <div className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-[#F8F7F5] transition-colors">
                                    <div className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: "var(--pm-indigo)" }}>
                                      {step.step ?? step.order ?? i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm truncate">{step.title}</div>
                                      {step.description && <div className="text-xs text-[#A3A3A3] truncate mt-0.5">{step.description}</div>}
                                    </div>
                                    {firstDoc && <TopicButton topicId={sid} topicTitle={step.topics?.[0]?.title || step.title} docId={firstDoc.id} />}
                                  </div>
                                  {step.topics && step.topics.length > 0 && (
                                    <div className="divide-y divide-[#F8F7F5] border-t border-[#F0EFED]">
                                      {step.topics.map((t: any, j: number) => {
                                        const stid = t.id || `step${i}_t${j}`;
                                        return (
                                          <div key={stid} className="flex items-center justify-between px-5 py-2.5 gap-3 pl-16 hover:bg-[#F8F7F5] transition-colors">
                                            <span className="text-xs text-[#737373] flex-1 min-w-0 truncate">{t.title}</span>
                                            {firstDoc && <TopicButton topicId={stid} topicTitle={t.title} docId={firstDoc.id} size="sm" />}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ===== 구조 미고정 ===== */}
                    {!isLocked && (
                      <>
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-3">
                            <p className="pm-label">학습 구조 선택</p>
                            {selectedGroupStructure && (
                              <span className="pm-badge pm-badge-indigo flex items-center gap-1">
                                <Lock size={9} /> {STRUCTURE_LABELS[selectedGroupStructure]} 확정됨
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {structureOptions.map((s) => {
                              const isSelected = groupPreviewStructure === s.key;
                              const isConfirmed = selectedGroupStructure === s.key;
                              return (
                                <button
                                  key={s.key}
                                  onClick={() => s.available && setGroupPreviewStructure(prev => prev === s.key ? null : s.key)}
                                  disabled={!s.available}
                                  className={`p-4 text-left rounded-xl border-2 transition-all ${
                                    !s.available ? "opacity-40 cursor-not-allowed border-[#E5E5E3] bg-white" :
                                    isConfirmed ? "border-transparent text-white" :
                                    isSelected ? "border-[#0F0F0F] bg-[#0F0F0F] text-white" :
                                    "border-[#E5E5E3] bg-white hover:border-[var(--pm-indigo)] hover:shadow-md"
                                  }`}
                                  style={isConfirmed ? { backgroundColor: "var(--pm-indigo)", borderColor: "var(--pm-indigo)" } : {}}
                                >
                                  <div className={`mb-2.5 ${isConfirmed ? "text-white" : isSelected ? "text-white" : "text-[--pm-indigo]"}`}
                                    style={(!isConfirmed && !isSelected) ? { color: "var(--pm-indigo)" } : {}}>
                                    {s.icon}
                                  </div>
                                  <div className={`text-xs font-semibold mb-1 ${isConfirmed || isSelected ? "text-white" : "text-[#0F0F0F]"}`}>{s.label}</div>
                                  <div className={`text-xs ${isConfirmed || isSelected ? "opacity-70 text-white" : "text-[#A3A3A3]"}`}>{s.stat}</div>
                                  {isConfirmed && <div className="mt-2 text-xs text-white/80 font-semibold">✓ 확정됨</div>}
                                  {isSelected && !isConfirmed && <div className="mt-2 text-xs text-white/60">미리보기 중</div>}
                                  {!s.available && <div className="mt-1 text-xs text-[#A3A3A3]">데이터 없음</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 미리보기 */}
                        {groupPreviewStructure && (
                          <div className="pm-card overflow-hidden mt-4">
                            <div className="px-5 py-3.5 bg-[#F8F7F5] border-b border-[#E5E5E3] flex items-center justify-between gap-3">
                              <span className="pm-label">미리보기 — {STRUCTURE_LABELS[groupPreviewStructure]}</span>
                              {(groupDetail as any).selectedStructure !== groupPreviewStructure && (
                                <button
                                  onClick={() => setGroupStructureMutation.mutate({ groupId, structure: groupPreviewStructure })}
                                  disabled={setGroupStructureMutation.isPending}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                                  style={{ backgroundColor: "var(--pm-indigo)" }}
                                >
                                  <Lock size={11} /> {setGroupStructureMutation.isPending ? "확정 중…" : "이 구조로 확정"}
                                </button>
                              )}
                            </div>

                            <div className="px-5 py-4 max-h-96 overflow-y-auto">
                              {groupPreviewStructure === "tree" && gs.chapters && (
                                <div className="space-y-3">
                                  {gs.chapters.map((ch: any, i: number) => (
                                    <div key={ch.id || i}>
                                      <div className="text-xs font-semibold text-[#525252] uppercase tracking-wide mb-2 px-1">{ch.title}</div>
                                      <div className="space-y-1">
                                        {(ch.topics ?? []).map((t: any, j: number) => (
                                          <div key={t.id || j} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#F8F7F5] gap-3 transition-colors">
                                            <div className="flex items-center gap-2 text-xs text-[#525252] flex-1 min-w-0">
                                              <ChevronRight size={10} className="flex-shrink-0 text-[#D4D4D2]" />
                                              <span className="truncate">{t.title}</span>
                                            </div>
                                            {firstDoc && (
                                              <button onClick={() => handleStartLearning(t.id || `ch${i}_t${j}`, t.title, firstDoc.id)}
                                                className="flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-lg text-white hover:opacity-90"
                                                style={{ backgroundColor: "var(--pm-indigo)" }}>
                                                학습
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {groupPreviewStructure === "conceptMap" && gs.conceptMap && (
                                <div className="grid grid-cols-2 gap-2">
                                  {gs.conceptMap.map((c: any, i: number) => (
                                    <div key={c.id || i} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-[#F8F7F5]">
                                      <div className="flex-1 min-w-0">
                                        <span className="font-semibold text-xs block truncate">{c.label || c.concept}</span>
                                        {c.description && <span className="text-[#A3A3A3] text-xs line-clamp-1 block mt-0.5">{c.description}</span>}
                                      </div>
                                      {firstDoc && (
                                        <button onClick={() => handleStartLearning(c.id || `concept_${i}`, c.label || c.concept, firstDoc.id)}
                                          className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg text-white hover:opacity-90"
                                          style={{ backgroundColor: "var(--pm-indigo)" }}>
                                          학습
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {groupPreviewStructure === "learningPath" && gs.learningPath && (
                                <div className="space-y-2">
                                  {gs.learningPath.map((step: any, i: number) => (
                                    <div key={step.id || step.step || i} className="rounded-xl overflow-hidden bg-[#F8F7F5]">
                                      <div className="flex items-center gap-3 px-4 py-3">
                                        <div className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                                          style={{ backgroundColor: "var(--pm-indigo)" }}>
                                          {step.step ?? step.order ?? i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="font-semibold text-sm truncate">{step.title}</div>
                                          {step.description && <div className="text-xs text-[#A3A3A3] truncate">{step.description}</div>}
                                        </div>
                                        {firstDoc && (
                                          <button
                                            onClick={() => {
                                              const topicId = step.topicIds?.[0] || step.topics?.[0]?.id || step.id || `step_${step.step ?? i + 1}`;
                                              handleStartLearning(topicId, step.topics?.[0]?.title || step.title, firstDoc.id);
                                            }}
                                            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:opacity-90"
                                            style={{ backgroundColor: "var(--pm-indigo)" }}>
                                            학습 시작
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {!groupPreviewStructure && (
                          <p className="text-xs text-[#D4D4D2] text-center mt-3">위 카드를 클릭하면 구조를 미리볼 수 있습니다.</p>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </main>

      {/* 평가 선택 모달 */}
      <Dialog open={showEvalModal} onOpenChange={(open) => { if (!open) { setShowEvalModal(false); setPendingTopic(null); } }}>
        <DialogContent className="max-w-md p-0 flex flex-col max-h-[90vh] rounded-2xl overflow-hidden">
          <DialogHeader className="px-6 py-5 border-b border-[#E5E5E3] shrink-0">
            <DialogTitle className="text-sm font-bold">평가 설정</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            {pendingTopic && (
              <div className="bg-[#F8F7F5] rounded-xl px-4 py-3">
                <p className="pm-label mb-1">선택된 토픽</p>
                <p className="text-sm font-semibold">{pendingTopic.title}</p>
              </div>
            )}

            {/* QLoop 모델 선택 */}
            <div>
              <p className="pm-label mb-3">QLoop 모델 선택</p>
              <div className="space-y-2">
                {([
                  { key: "core" as const, name: "Core QLoop", desc: "업로드한 학습자료와 학습그룹만으로 학습", color: "#0F0F0F" },
                  { key: "curated" as const, name: "Curated QLoop", desc: "Core QLoop + Knowledge Library 전체 자동 참조", color: "var(--pm-indigo)" },
                  { key: "open" as const, name: "Open QLoop", desc: "Curated QLoop + 인터넷 검색으로 최신 정보까지 참조", color: "#2563EB" },
                ]).map(({ key, name, desc, color }) => (
                  <button
                    key={key}
                    onClick={() => setQloopModel(key)}
                    className={`w-full rounded-xl p-3.5 text-left border-2 transition-all ${
                      qloopModel === key ? "border-transparent text-white" : "border-[#E5E5E3] hover:border-[#D4D4D2] bg-white"
                    }`}
                    style={qloopModel === key ? { backgroundColor: color, borderColor: color } : {}}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${qloopModel === key ? "border-white" : "border-[#D4D4D2]"}`}>
                        {qloopModel === key && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className={`text-sm font-semibold ${qloopModel === key ? "text-white" : "text-[#0F0F0F]"}`}>{name}</div>
                        <div className={`text-xs mt-0.5 ${qloopModel === key ? "text-white/70" : "text-[#A3A3A3]"}`}>{desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 평가 여부 */}
            <div>
              <p className="pm-label mb-3">평가 여부 선택 <span className="text-red-500">*필수</span></p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setEvalEnabled(false); setSelectedPolicyId(null); }}
                  className={`rounded-xl p-4 text-left border-2 transition-all ${evalEnabled === false ? "border-[#0F0F0F] bg-[#0F0F0F] text-white" : "border-[#E5E5E3] bg-white hover:border-[#D4D4D2]"}`}
                >
                  <div className={`text-sm font-semibold mb-1 ${evalEnabled === false ? "text-white" : "text-[#0F0F0F]"}`}>평가 없이 학습</div>
                  <div className={`text-xs ${evalEnabled === false ? "text-white/70" : "text-[#A3A3A3]"}`}>자유롭게 학습합니다</div>
                </button>
                <button
                  onClick={() => setEvalEnabled(true)}
                  className={`rounded-xl p-4 text-left border-2 transition-all ${evalEnabled === true ? "border-transparent text-white" : "border-[#E5E5E3] bg-white hover:border-[#D4D4D2]"}`}
                  style={evalEnabled === true ? { backgroundColor: "var(--pm-indigo)" } : {}}
                >
                  <div className={`text-sm font-semibold mb-1 ${evalEnabled === true ? "text-white" : "text-[#0F0F0F]"}`}>평가 포함 학습</div>
                  <div className={`text-xs ${evalEnabled === true ? "text-white/70" : "text-[#A3A3A3]"}`}>학습 중 평가가 진행됩니다</div>
                </button>
              </div>
            </div>

            {/* 평가 정책 */}
            {evalEnabled === true && (
              <div>
                <p className="pm-label mb-3">평가 정책 선택 <span className="text-red-500">*필수</span></p>
                {!policies || policies.length === 0 ? (
                  <div className="flex items-center gap-2.5 text-sm text-[#737373] border border-[#E5E5E3] rounded-xl p-4">
                    <AlertCircle size={14} />
                    <span>등록된 평가 정책이 없습니다. 관리자에게 평가 정책 설정을 요청하세요.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {policies.map((policy) => (
                      <button
                        key={policy.id}
                        onClick={() => setSelectedPolicyId(policy.id)}
                        className={`w-full rounded-xl p-3.5 text-left border-2 transition-all ${
                          selectedPolicyId === policy.id ? "border-transparent bg-[#E8E8FD]" : "border-[#E5E5E3] bg-white hover:border-[#D4D4D2]"
                        }`}
                        style={selectedPolicyId === policy.id ? { borderColor: "var(--pm-indigo)" } : {}}
                      >
                        <div className="flex items-center gap-2">
                          {selectedPolicyId === policy.id && <CheckCircle2 size={14} style={{ color: "var(--pm-indigo)" }} className="flex-shrink-0" />}
                          <div>
                            <div className="text-sm font-semibold">{policy.name}</div>
                            {policy.description && <div className="text-xs text-[#737373] mt-0.5">{policy.description}</div>}
                            <div className="text-xs text-[#A3A3A3] mt-0.5">모드: {policy.mode}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 버튼 */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowEvalModal(false); setPendingTopic(null); }}
                className="flex-1 rounded-xl border border-[#E5E5E3] py-2.5 text-xs font-semibold hover:bg-[#F0EFED] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleConfirmStart}
                disabled={evalEnabled === null || (evalEnabled === true && !selectedPolicyId)}
                className="flex-1 rounded-xl py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-colors"
                style={{ backgroundColor: "var(--pm-indigo)" }}
              >
                학습 시작
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 세션 시작 로딩 오버레이 */}
      {starting && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex items-center gap-4 bg-white rounded-2xl px-8 py-6 shadow-xl">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--pm-indigo)", borderTopColor: "transparent" }} />
            <div>
              <p className="font-semibold text-sm">학습 세션 준비 중</p>
              <p className="text-xs text-[#A3A3A3] mt-0.5">AI가 첫 번째 질문을 생성하고 있습니다…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
