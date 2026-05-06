import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Clock,
  ChevronRight,
  BookOpen,
  BarChart2,
  LogOut,
  Trash2,
  FolderPlus,
  Folder,
  FolderOpen,
  Plus,
  X,
  FileType,
  Brain,
  Settings,
  Library,
} from "lucide-react";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
};

const FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx";

function FileTypeBadge({ fileType }: { fileType?: string }) {
  const colors: Record<string, string> = {
    pdf: "bg-red-100 text-red-700",
    doc: "bg-blue-100 text-blue-700",
    docx: "bg-blue-100 text-blue-700",
    ppt: "bg-orange-100 text-orange-700",
    pptx: "bg-orange-100 text-orange-700",
  };
  const label = (fileType ?? "pdf").toUpperCase();
  const cls = colors[fileType ?? "pdf"] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${cls}`}>{label}</span>
  );
}

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupFileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  // 그룹 관련 상태
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  const [uploadingToGroupId, setUploadingToGroupId] = useState<number | null>(null);

  // 삭제 확인 상태
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: documents, refetch: refetchDocs } = trpc.document.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: groups, refetch: refetchGroups } = trpc.group.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: sessions } = trpc.session.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const uploadMutation = trpc.document.upload.useMutation();
  const analyzeMutation = trpc.document.analyze.useMutation();
  const deleteDocMutation = trpc.document.delete.useMutation();
  const createGroupMutation = trpc.group.create.useMutation();
  const deleteGroupMutation = trpc.group.delete.useMutation();
  const analyzeGroupMutation = trpc.group.analyze.useMutation();

  const handleFile = useCallback(
    async (file: File, groupId?: number) => {
      if (!ALLOWED_TYPES[file.type]) {
        toast.error("PDF, DOC, DOCX, PPT, PPTX 파일만 업로드할 수 있습니다.");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        const fileMB = (file.size / 1024 / 1024).toFixed(1);
        const hint = file.type.includes("word") || file.name.endsWith(".docx") || file.name.endsWith(".doc")
          ? " Word 파일은 [구성요소] → [그림 압축]으로 이미지를 줄이세요."
          : file.type.includes("presentation") || file.name.endsWith(".pptx") || file.name.endsWith(".ppt")
          ? " PPT 파일은 슬라이드 이미지를 150dpi 이하로 줄이세요."
          : " 파일을 압축하거나 분할하여 업로드하세요.";
        toast.error(`파일 크기 초과 (${fileMB}MB / 제한 20MB).${hint}`, { duration: 6000 });
        return;
      }

      if (groupId) {
        setUploadingToGroupId(groupId);
      } else {
        setUploading(true);
        setUploadProgress(10);
      }

      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        if (!groupId) setUploadProgress(40);

        const { documentId } = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileData: base64,
          fileSize: file.size,
          mimeType: file.type,
          groupId,
        });

        if (!groupId) {
          setUploadProgress(60);
          toast.info(`${ALLOWED_TYPES[file.type]} 분석 중...`, { duration: 3000 });
          await analyzeMutation.mutateAsync({ documentId });
          setUploadProgress(100);
          toast.success("분석 완료! 문서가 준비되었습니다.");
          await refetchDocs();
          navigate(`/documents/${documentId}`);
        } else {
          toast.success("파일이 그룹에 추가되었습니다.");
          await refetchGroups();
          utils.group.get.invalidate({ groupId });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "업로드 실패";
        toast.error(msg);
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setUploadingToGroupId(null);
      }
    },
    [uploadMutation, analyzeMutation, refetchDocs, refetchGroups, navigate, utils]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDeleteDoc = async (docId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingDocId === docId) {
      try {
        await deleteDocMutation.mutateAsync({ documentId: docId });
        toast.success("문서가 삭제되었습니다.");
        await refetchDocs();
        await refetchGroups();
      } catch {
        toast.error("삭제 실패");
      } finally {
        setDeletingDocId(null);
      }
    } else {
      setDeletingDocId(docId);
      setTimeout(() => setDeletingDocId(null), 3000);
    }
  };

  const handleDeleteGroup = async (groupId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingGroupId === groupId) {
      try {
        await deleteGroupMutation.mutateAsync({ groupId });
        toast.success("그룹이 삭제되었습니다.");
        await refetchGroups();
        if (expandedGroupId === groupId) setExpandedGroupId(null);
      } catch {
        toast.error("삭제 실패");
      } finally {
        setDeletingGroupId(null);
      }
    } else {
      setDeletingGroupId(groupId);
      setTimeout(() => setDeletingGroupId(null), 3000);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroupMutation.mutateAsync({
        name: newGroupName.trim(),
        description: newGroupDesc.trim() || undefined,
      });
      toast.success("그룹이 생성되었습니다.");
      setNewGroupName("");
      setNewGroupDesc("");
      setShowCreateGroup(false);
      await refetchGroups();
    } catch {
      toast.error("그룹 생성 실패");
    }
  };

  const handleAnalyzeGroup = async (groupId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      toast.info("그룹 통합 분석 중...", { duration: 5000 });
      await analyzeGroupMutation.mutateAsync({ groupId });
      toast.success("그룹 분석 완료!");
      await refetchGroups();
      navigate(`/groups/${groupId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "분석 실패");
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
        <a
          href={getLoginUrl()}
          className="bg-black text-white px-8 py-3 text-sm font-bold tracking-widest uppercase hover:bg-[var(--swiss-red)] transition-colors"
        >
          로그인
        </a>
      </div>
    );
  }

  const recentSessions = sessions?.slice(0, 3) ?? [];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-black bg-white z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center cursor-pointer" onClick={() => navigate("/")}>
            <img src="/manus-storage/QLoopLogo_be7719bb.png" alt="QLoop" className="h-8 w-auto" />
          </div>
          <nav className="flex items-center gap-6">
            <button
              onClick={() => navigate("/history")}
              className="swiss-label hover:text-black transition-colors flex items-center gap-1"
            >
              <BarChart2 size={12} /> LEARNING HISTORY
            </button>
            <button
              onClick={() => navigate("/library")}
              className="swiss-label hover:text-black transition-colors flex items-center gap-1"
            >
              <Library size={12} /> Knowledge Library
            </button>
            <button
              onClick={() => navigate("/profile/socratic")}
              className="swiss-label hover:text-black transition-colors flex items-center gap-1"
            >
              <Brain size={12} /> QLOOP PROFILE
            </button>
            {user?.role === "admin" && (
              <button
                onClick={() => navigate("/admin/socratic")}
                className="swiss-label hover:text-black transition-colors flex items-center gap-1 text-red-600"
              >
                <Settings size={12} /> NEURAL SYSTEM SET
              </button>
            )}
            <div className="flex items-center gap-3 border-l border-black pl-6">
              <span className="text-sm font-medium">{user?.name}</span>
              <button
                onClick={() => logout()}
                className="swiss-label hover:text-black transition-colors flex items-center gap-1"
              >
                <LogOut size={11} /> 로그아웃
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-8 py-12 w-full">
        <div className="grid grid-cols-12 gap-0">
          {/* Left: Upload + Docs + Groups */}
          <div className="col-span-8 pr-12 border-r border-black">

            {/* Upload area */}
            <div className="mb-12">
              <div className="swiss-label mb-4">학습자료 업로드</div>
              <div
                className={`border-2 ${dragging ? "border-[var(--swiss-red)] bg-red-50" : "border-black"} border-dashed p-12 text-center cursor-pointer transition-colors relative`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_ACCEPT}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                {uploading ? (
                  <div className="space-y-4">
                    <div className="swiss-label">분석 중...</div>
                    <div className="w-full bg-gray-100 h-1">
                      <div
                        className="h-1 swiss-red-bg transition-all duration-500"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="text-sm text-gray-500">{uploadProgress}%</div>
                  </div>
                ) : (
                  <>
                    <Upload size={32} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-sm font-bold mb-1">파일을 드래그하거나 클릭하여 업로드</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      {["PDF", "DOC", "DOCX", "PPT", "PPTX"].map((t) => (
                        <span key={t} className="text-xs font-bold px-2 py-0.5 border border-gray-300 text-gray-400">{t}</span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">최대 20MB</p>
                  </>
                )}
              </div>
            </div>

            {/* Document Groups */}
            <div className="mb-12">
              <div className="flex items-center justify-between mb-4">
                <div className="swiss-label">학습그룹</div>
                <button
                  onClick={() => setShowCreateGroup(!showCreateGroup)}
                  className="flex items-center gap-1 text-xs font-bold border border-black px-3 py-1.5 hover:bg-black hover:text-white transition-colors"
                >
                  <FolderPlus size={12} /> 그룹 만들기
                </button>
              </div>

              {/* Create group form */}
              {showCreateGroup && (
                <div className="border-2 border-black p-6 mb-4 bg-gray-50">
                  <div className="swiss-label mb-3">새 그룹</div>
                  <input
                    type="text"
                    placeholder="그룹 이름 (필수)"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full border border-black px-4 py-2 text-sm mb-2 focus:outline-none focus:border-[var(--swiss-red)]"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                  />
                  <input
                    type="text"
                    placeholder="설명 (선택)"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    className="w-full border border-black px-4 py-2 text-sm mb-4 focus:outline-none focus:border-[var(--swiss-red)]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateGroup}
                      disabled={!newGroupName.trim()}
                      className="flex-1 bg-black text-white py-2 text-sm font-bold hover:bg-[var(--swiss-red)] transition-colors disabled:opacity-40"
                    >
                      생성
                    </button>
                    <button
                      onClick={() => { setShowCreateGroup(false); setNewGroupName(""); setNewGroupDesc(""); }}
                      className="px-4 py-2 border border-black text-sm hover:bg-gray-100 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}

              {!groups || groups.length === 0 ? (
                <div className="border border-gray-200 p-8 text-center">
                  <Folder size={28} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-sm text-gray-400">그룹이 없습니다. 여러 파일을 묶어 함께 학습하세요.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {groups.map((group, i) => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      isLast={i === groups.length - 1}
                      isExpanded={expandedGroupId === group.id}
                      onToggle={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                      onDelete={(e) => handleDeleteGroup(group.id, e)}
                      onAnalyze={(e) => handleAnalyzeGroup(group.id, e)}
                      onAddFile={(e) => {
                        e.stopPropagation();
                        groupFileInputRef.current?.setAttribute("data-group-id", String(group.id));
                        groupFileInputRef.current?.click();
                      }}
                      onDeleteDoc={(docId, e) => handleDeleteDoc(docId, e)}
                      deletingDocId={deletingDocId}
                      isDeleting={deletingGroupId === group.id}
                      isAnalyzing={analyzeGroupMutation.isPending}
                      navigate={navigate}
                    />
                  ))}
                </div>
              )}
              {/* Hidden file input for group uploads */}
              <input
                ref={groupFileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const gid = Number(groupFileInputRef.current?.getAttribute("data-group-id"));
                  if (file && gid) handleFile(file, gid);
                  if (e.target) e.target.value = "";
                }}
              />
            </div>

            {/* Standalone Documents list */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="swiss-label">학습자료</div>
                <span className="text-xs text-gray-400">{documents?.length ?? 0}개</span>
              </div>
              {!documents || documents.length === 0 ? (
                <div className="border border-gray-200 p-12 text-center">
                  <FileText size={32} className="mx-auto mb-3 text-gray-200" />
                  <p className="text-sm text-gray-400">아직 업로드된 문서가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {documents.map((doc, i) => (
                    <div
                      key={doc.id}
                      className={`flex items-center justify-between p-5 cursor-pointer hover:bg-gray-50 transition-colors ${i < documents.length - 1 ? "border-b border-gray-100" : ""} border border-black`}
                      onClick={() => navigate(`/documents/${doc.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-2 h-2 flex-shrink-0 ${doc.analysisStatus === "done" ? "swiss-red-bg" : doc.analysisStatus === "analyzing" ? "bg-yellow-400" : "bg-gray-300"}`}
                        />
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-bold">{doc.title}</p>
                            <FileTypeBadge fileType={doc.fileType} />
                          </div>
                          <p className="text-xs text-gray-400">
                            {doc.analysisStatus === "done" ? "분석 완료" : doc.analysisStatus === "analyzing" ? "분석 중..." : "대기 중"} ·{" "}
                            {new Date(doc.createdAt).toLocaleDateString("ko-KR")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => handleDeleteDoc(doc.id, e)}
                          className={`p-1.5 transition-colors ${deletingDocId === doc.id ? "text-red-600 bg-red-50" : "text-gray-300 hover:text-red-500"}`}
                          title={deletingDocId === doc.id ? "한 번 더 클릭하면 삭제됩니다" : "삭제"}
                        >
                          <Trash2 size={14} />
                        </button>
                        <ChevronRight size={16} className="text-gray-300" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Stats + Recent Sessions */}
          <div className="col-span-4 pl-12">
            <div className="mb-10">
              <div className="swiss-label mb-6">학습 현황</div>
              <div className="grid grid-cols-2 gap-0">
                <div className="border border-black p-5 border-r-0">
                  <div className="text-3xl font-black mb-1">{(documents?.length ?? 0) + (groups?.reduce((acc, g) => acc, 0) ?? 0)}</div>
                  <div className="swiss-label">문서</div>
                </div>
                <div className="border border-black p-5">
                  <div className="text-3xl font-black mb-1">{groups?.length ?? 0}</div>
                  <div className="swiss-label">그룹</div>
                </div>
                <div className="border border-black p-5 border-t-0 border-r-0">
                  <div className="text-3xl font-black mb-1" style={{ color: "var(--swiss-red)" }}>
                    {sessions?.filter((s) => s.status === "completed").length ?? 0}
                  </div>
                  <div className="swiss-label">완료 세션</div>
                </div>
                <div className="border border-black p-5 border-t-0">
                  <div className="text-3xl font-black mb-1">
                    {sessions?.filter((s) => s.status === "active").length ?? 0}
                  </div>
                  <div className="swiss-label">진행 중</div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="swiss-label">최근 학습 세션</div>
                <button
                  onClick={() => navigate("/history")}
                  className="text-xs text-gray-400 hover:text-black transition-colors"
                >
                  전체 보기
                </button>
              </div>
              {recentSessions.length === 0 ? (
                <div className="border border-gray-200 p-8 text-center">
                  <BookOpen size={24} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-xs text-gray-400">학습 기록이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {recentSessions.map((s, i) => (
                    <div
                      key={s.id}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors border border-black ${i > 0 ? "border-t-0" : ""}`}
                      onClick={() => navigate(`/sessions/${s.id}`)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={`w-1.5 h-1.5 flex-shrink-0 ${s.status === "completed" ? "swiss-red-bg" : s.status === "active" ? "bg-yellow-400" : "bg-gray-300"}`}
                        />
                        <p className="text-xs font-bold truncate">{s.startTopicTitle || "학습 세션"}</p>
                      </div>
                      <div className="flex items-center gap-2 pl-3.5">
                        <Clock size={10} className="text-gray-300" />
                        <p className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString("ko-KR")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── GroupRow 컴포넌트 ────────────────────────────────────────────────────────

interface GroupDoc {
  id: number;
  title: string;
  fileType?: string | null;
  analysisStatus: string;
  createdAt: Date | string;
}

interface GroupData {
  id: number;
  name: string;
  description?: string | null;
  analysisStatus: string;
  createdAt: Date | string;
}

function GroupRow({
  group,
  isLast,
  isExpanded,
  onToggle,
  onDelete,
  onAnalyze,
  onAddFile,
  onDeleteDoc,
  deletingDocId,
  isDeleting,
  isAnalyzing,
  navigate,
}: {
  group: GroupData;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onAnalyze: (e: React.MouseEvent) => void;
  onAddFile: (e: React.MouseEvent) => void;
  onDeleteDoc: (docId: number, e: React.MouseEvent) => void;
  deletingDocId: number | null;
  isDeleting: boolean;
  isAnalyzing: boolean;
  navigate: (path: string) => void;
}) {
  const { data: groupDetail } = trpc.group.get.useQuery(
    { groupId: group.id },
    { enabled: isExpanded }
  );

  return (
    <div className={`border border-black ${!isLast ? "border-b-0" : ""}`}>
      {/* Group header row */}
      <div
        className="flex items-center justify-between p-5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <FolderOpen size={16} className="text-[var(--swiss-red)]" />
          ) : (
            <Folder size={16} className="text-gray-400" />
          )}
          <div>
            <p className="text-sm font-bold">{group.name}</p>
            {group.description && (
              <p className="text-xs text-gray-400 mt-0.5">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-2 py-0.5 ${
              group.analysisStatus === "done"
                ? "bg-green-100 text-green-700"
                : group.analysisStatus === "analyzing"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {group.analysisStatus === "done" ? "분석 완료" : group.analysisStatus === "analyzing" ? "분석 중" : "미분석"}
          </span>
          {group.analysisStatus === "done" && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/groups/${group.id}`); }}
              className="text-xs font-bold px-2 py-0.5 border border-black hover:bg-black hover:text-white transition-colors"
            >
              열기
            </button>
          )}
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="text-xs font-bold px-2 py-0.5 border border-black hover:bg-black hover:text-white transition-colors disabled:opacity-40"
            title="그룹 전체 분석"
          >
            분석
          </button>
          <button
            onClick={onDelete}
            className={`p-1.5 transition-colors ${isDeleting ? "text-red-600 bg-red-50" : "text-gray-300 hover:text-red-500"}`}
            title={isDeleting ? "한 번 더 클릭하면 삭제됩니다" : "그룹 삭제"}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded: document list + add file */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50">
          {groupDetail?.documents && groupDetail.documents.length > 0 ? (
            <div>
              {groupDetail.documents.map((doc: GroupDoc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between px-8 py-3 border-b border-gray-200 last:border-b-0 hover:bg-white transition-colors cursor-pointer"
                  onClick={() => navigate(`/documents/${doc.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-1.5 h-1.5 flex-shrink-0 ${
                        doc.analysisStatus === "done" ? "swiss-red-bg" : doc.analysisStatus === "analyzing" ? "bg-yellow-400" : "bg-gray-300"
                      }`}
                    />
                    <span className="text-sm font-medium">{doc.title}</span>
                    <FileTypeBadge fileType={doc.fileType ?? undefined} />
                  </div>
                  <button
                    onClick={(e) => onDeleteDoc(doc.id, e)}
                    className={`p-1 transition-colors ${
                      deletingDocId === doc.id ? "text-red-600" : "text-gray-300 hover:text-red-500"
                    }`}
                    title={deletingDocId === doc.id ? "한 번 더 클릭하면 삭제됩니다" : "삭제"}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-8 py-4 text-xs text-gray-400">파일이 없습니다.</div>
          )}
          <div className="px-8 py-3 border-t border-gray-200">
            <button
              onClick={onAddFile}
              className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-black transition-colors"
            >
              <Plus size={12} /> 파일 추가 (PDF / DOC / DOCX / PPT / PPTX)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
