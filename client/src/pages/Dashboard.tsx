import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import {
  FileText,
  Upload,
  Clock,
  ChevronRight,
  BookOpen,
  Trash2,
  FolderPlus,
  Folder,
  FolderOpen,
  Plus,
  X,
  FileType,
  AlignLeft,
  Bell,
  RefreshCw,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
    text: "bg-green-100 text-green-700",
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

  // 삭제 확인 팝업 상태
  const [deleteDocConfirm, setDeleteDocConfirm] = useState<{ id: number; title: string } | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{ id: number; name: string } | null>(null);
  const [deleteGroupDocConfirm, setDeleteGroupDocConfirm] = useState<{ id: number; title: string } | null>(null);

  const utils = trpc.useUtils();

  const { data: documents, refetch: refetchDocs } = trpc.document.list.useQuery(undefined, {
    enabled: isAuthenticated,
    // 분석 중인 문서가 있을 때만 3초 폴링 (단일 쿼리로 통합)
    refetchInterval: (query) => {
      const docs = (query.state.data as typeof documents) ?? [];
      const analyzing = docs.some(
        (d) => d.analysisStatus === "analyzing" || (d.analysisStatus === "pending" && (d as any).analysisStep)
      );
      return analyzing ? 3000 : false;
    },
  });
  const { data: groups, refetch: refetchGroups } = trpc.group.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: sessions } = trpc.session.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // ② 망각곡선 복습 알림
  const { data: reviewReminders } = trpc.session.getReviewReminders.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5 * 60 * 1000, // 5분마다
  });

  // 텍스트 입력 모드 상태
  const [uploadMode, setUploadMode] = useState<"file" | "text">("file");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [textUploading, setTextUploading] = useState(false);

  const uploadMutation = trpc.document.upload.useMutation();
  const analyzeMutation = trpc.document.analyze.useMutation();
  const uploadTextMutation = trpc.document.uploadText.useMutation();
  const analyzeTextMutation = trpc.document.analyzeText.useMutation();
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
          await analyzeMutation.mutateAsync({ documentId });
          setUploadProgress(100);
          await refetchDocs();
          // 문서 페이지로 이동 (analysisStatus "analyzing" 상태로 진입 → 폴링으로 완료 감지)
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

  const handleTextSubmit = useCallback(async () => {
    if (!textTitle.trim()) { toast.error("제목을 입력해주세요."); return; }
    if (textContent.trim().length < 10) { toast.error("내용을 10자 이상 입력해주세요."); return; }
    setTextUploading(true);
    try {
      const { documentId } = await uploadTextMutation.mutateAsync({
        title: textTitle.trim(),
        text: textContent.trim(),
      });
      // 분석 요청 전송 (서버에서 백그라운드 처리 후 즉시 반환)
      await analyzeTextMutation.mutateAsync({ documentId, text: textContent.trim() });
      setTextTitle("");
      setTextContent("");
      await refetchDocs();
      // 문서 페이지로 이동 (analysisStatus "analyzing" 상태로 진입 → 폴링으로 완료 감지)
      navigate(`/documents/${documentId}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setTextUploading(false);
    }
  }, [textTitle, textContent, uploadTextMutation, analyzeTextMutation, refetchDocs, navigate]);

  // 삭제 실행 함수들
  const confirmDeleteDoc = async (docId: number) => {
    try {
      await deleteDocMutation.mutateAsync({ documentId: docId });
      toast.success("학습자료와 관련 학습이력이 삭제되었습니다.");
      await refetchDocs();
      await refetchGroups();
    } catch {
      toast.error("삭제 실패");
    } finally {
      setDeleteDocConfirm(null);
    }
  };

  const confirmDeleteGroup = async (groupId: number) => {
    try {
      await deleteGroupMutation.mutateAsync({ groupId });
      toast.success("학습그룹과 관련 학습이력이 삭제되었습니다.");
      await refetchGroups();
      if (expandedGroupId === groupId) setExpandedGroupId(null);
    } catch {
      toast.error("삭제 실패");
    } finally {
      setDeleteGroupConfirm(null);
    }
  };

  const confirmDeleteGroupDoc = async (docId: number) => {
    try {
      await deleteDocMutation.mutateAsync({ documentId: docId });
      toast.success("자료와 관련 학습이력이 삭제되었습니다.");
      await refetchDocs();
      await refetchGroups();
    } catch {
      toast.error("삭제 실패");
    } finally {
      setDeleteGroupDocConfirm(null);
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
      <div className="min-h-screen bg-[#EDECEA] flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#5B5BD6] animate-pulse" />
          <span className="text-sm text-[#737373] font-medium">로딩 중</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#EDECEA] flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-[#737373]">로그인이 필요합니다</p>
        <a
          href={getLoginUrl()}
          className="bg-[#0F0F0F] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#262626] transition-colors"
        >
          로그인
        </a>
      </div>
    );
  }

  const recentSessions = sessions?.slice(0, 3) ?? [];

  return (
    <div className="min-h-screen bg-[#EDECEA] flex flex-col">
      {/* 삭제 확인 팝업 - 학습자료 */}
      <AlertDialog open={!!deleteDocConfirm} onOpenChange={(open) => !open && setDeleteDocConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학습자료 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteDocConfirm?.title}"</strong>을(를) 삭제하시겠습니까?<br />
              <span className="text-red-600 font-medium">관련 학습이력도 모두 함께 삭제됩니다.</span>
              <br />이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDocConfirm && confirmDeleteDoc(deleteDocConfirm.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 팝업 - 학습그룹 */}
      <AlertDialog open={!!deleteGroupConfirm} onOpenChange={(open) => !open && setDeleteGroupConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학습그룹 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteGroupConfirm?.name}"</strong> 그룹을 삭제하시겠습니까?<br />
              <span className="text-red-600 font-medium">그룹의 모든 학습이력도 함께 삭제됩니다.</span>
              <br />이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroupConfirm && confirmDeleteGroup(deleteGroupConfirm.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 팝업 - 그룹 내 자료 */}
      <AlertDialog open={!!deleteGroupDocConfirm} onOpenChange={(open) => !open && setDeleteGroupDocConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>자료 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteGroupDocConfirm?.title}"</strong>을(를) 삭제하시겠습니까?<br />
              <span className="text-red-600 font-medium">관련 학습이력도 모두 함께 삭제됩니다.</span>
              <br />그룹 구조 분석도 초기화됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroupDocConfirm && confirmDeleteGroupDoc(deleteGroupDocConfirm.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageHeader />

      {/* ② 망각곡선 복습 알림 배너 */}
      {reviewReminders && reviewReminders.length > 0 && (
        <div className="border-b border-[#E5E5E3] bg-[#FFFBEB]">
          <div className="max-w-7xl mx-auto px-8 py-3 flex items-start gap-3">
            <Bell size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-800 mb-1">복습 알림 — 망각이 시작됩니다!</p>
              <div className="flex flex-wrap gap-2">
                {reviewReminders.map((r) => (
                  <button
                    key={r.sessionId}
                    onClick={() => navigate(`/documents`)}
                    className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-200 transition-colors font-medium"
                  >
                    {r.daysAgo}일 전 · {r.topicTitle}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto px-8 py-12 w-full">
        <div className="grid grid-cols-12 gap-12">
          {/* Left: Upload + Groups + Docs */}
          <div className="col-span-8">
            {/* Upload area */}
            <div className="mb-8">
              <p className="pm-label mb-3">학습자료 등록</p>
              {/* 모드 탭 */}
              <div className="flex gap-1 mb-4 bg-[#F0EFED] rounded-lg p-1 w-fit">
                <button
                  onClick={() => setUploadMode("file")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    uploadMode === "file" ? "bg-white text-[#0F0F0F] shadow-sm" : "text-[#737373] hover:text-[#0F0F0F]"
                  }`}
                >
                  <Upload size={12} /> 파일 업로드
                </button>
                <button
                  onClick={() => setUploadMode("text")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    uploadMode === "text" ? "bg-white text-[#0F0F0F] shadow-sm" : "text-[#737373] hover:text-[#0F0F0F]"
                  }`}
                >
                  <AlignLeft size={12} /> 텍스트 입력
                </button>
              </div>

              {uploadMode === "file" ? (
                <>
                  <div
                    className={`border-2 border-dashed rounded-xl transition-all cursor-pointer p-12 text-center ${
                      dragging ? "border-[#5B5BD6] bg-[#E8E8FD]" : "border-[#E5E5E3] bg-white hover:border-[#5B5BD6] hover:bg-[#F8F8FF]"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <div className="space-y-3 max-w-xs mx-auto">
                        <div className="w-full bg-[#F0EFED] h-1.5 rounded-full">
                          <div
                            className="h-1.5 bg-[#5B5BD6] rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-[#737373]">업로드 및 분석 중... {uploadProgress}%</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-[#F0EFED] rounded-xl flex items-center justify-center mx-auto mb-3">
                          <Upload size={22} className="text-[#A3A3A3]" />
                        </div>
                        <p className="text-sm font-semibold text-[#0F0F0F] mb-1">파일을 드래그하거나 클릭하여 업로드</p>
                        <p className="text-xs text-[#A3A3A3]">PDF / DOC / DOCX / PPT / PPTX · 최대 50MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={FILE_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                      e.target.value = "";
                    }}
                  />
                </>
              ) : (
                <div className="bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#525252] mb-1.5">제목 <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      placeholder="학습자료 제목을 입력하세요"
                      value={textTitle}
                      onChange={(e) => setTextTitle(e.target.value)}
                      className="w-full border border-[#E5E5E3] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] outline-none focus:border-[#5B5BD6] focus:ring-2 focus:ring-[#5B5BD6]/10 transition-all"
                      disabled={textUploading}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#525252] mb-1.5">본문 <span className="text-red-400">*</span></label>
                    <textarea
                      placeholder="학습할 내용을 여기에 붙여넣으세요."
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      rows={8}
                      className="w-full border border-[#E5E5E3] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] outline-none focus:border-[#5B5BD6] focus:ring-2 focus:ring-[#5B5BD6]/10 transition-all resize-y"
                      disabled={textUploading}
                    />
                    <p className="text-xs text-[#A3A3A3] mt-1">{textContent.length.toLocaleString()}자</p>
                  </div>
                  <button
                    onClick={handleTextSubmit}
                    disabled={textUploading || !textTitle.trim() || textContent.trim().length < 10}
                    className="bg-[#0F0F0F] text-white px-5 py-2.5 rounded-lg text-xs font-semibold hover:bg-[#262626] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {textUploading ? (
                      <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />분석 중...</>
                    ) : (
                      <>분석 시작</>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Groups section */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <p className="pm-label">학습그룹</p>
                <button
                  onClick={() => setShowCreateGroup(!showCreateGroup)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#737373] hover:text-[#5B5BD6] transition-colors"
                >
                  <FolderPlus size={13} /> 그룹 만들기
                </button>
              </div>

              {showCreateGroup && (
                <div className="bg-white border border-[#E5E5E3] rounded-xl p-4 mb-4 space-y-3">
                  <input
                    type="text"
                    placeholder="그룹 이름"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full border border-[#E5E5E3] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] outline-none focus:border-[#5B5BD6] focus:ring-2 focus:ring-[#5B5BD6]/10 transition-all"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                  />
                  <input
                    type="text"
                    placeholder="설명 (선택사항)"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    className="w-full border border-[#E5E5E3] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] outline-none focus:border-[#5B5BD6] focus:ring-2 focus:ring-[#5B5BD6]/10 transition-all"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateGroup}
                      className="bg-[#0F0F0F] text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-[#262626] transition-colors"
                    >
                      생성
                    </button>
                    <button
                      onClick={() => setShowCreateGroup(false)}
                      className="border border-[#E5E5E3] px-4 py-2 rounded-lg text-xs font-semibold text-[#737373] hover:border-[#A3A3A3] transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              {!groups || groups.length === 0 ? (
                <div className="bg-white border border-dashed border-[#E5E5E3] rounded-xl p-8 text-center">
                  <p className="text-sm text-[#A3A3A3]">그룹이 없습니다. 여러 파일을 묶어 함께 학습하세요.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((group, i) => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      isLast={i === groups.length - 1}
                      isExpanded={expandedGroupId === group.id}
                      onToggle={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                      onDelete={(e) => { e.stopPropagation(); setDeleteGroupConfirm({ id: group.id, name: group.name }); }}
                      onAnalyze={(e) => handleAnalyzeGroup(group.id, e)}
                      onAddFile={(e) => {
                        e.stopPropagation();
                        groupFileInputRef.current?.setAttribute("data-group-id", String(group.id));
                        groupFileInputRef.current?.click();
                      }}
                      onDeleteDoc={(docId, docTitle) => setDeleteGroupDocConfirm({ id: docId, title: docTitle })}
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
                  const groupId = Number(groupFileInputRef.current?.getAttribute("data-group-id"));
                  if (file && groupId) handleFile(file, groupId);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Standalone docs section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="pm-label">학습자료</p>
                <span className="text-xs text-[#A3A3A3]">{documents?.filter((d) => !d.groupId).length ?? 0}개</span>
              </div>
              {!documents || documents.filter((d) => !d.groupId).length === 0 ? (
                <div className="bg-white border border-dashed border-[#E5E5E3] rounded-xl p-8 text-center">
                  <FileText size={24} className="mx-auto mb-2 text-[#D4D4D2]" />
                  <p className="text-sm text-[#A3A3A3]">업로드된 학습자료가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents
                    .filter((d) => !d.groupId)
                    .map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 cursor-pointer bg-white border border-[#E5E5E3] rounded-xl hover:border-[#D4D4D2] hover:shadow-sm transition-all"
                        onClick={() => navigate(`/documents/${doc.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              doc.analysisStatus === "done" ? "bg-[#5B5BD6]" : doc.analysisStatus === "analyzing" ? "bg-amber-400 animate-pulse" : doc.analysisStatus === "error" ? "bg-red-500" : "bg-[#D4D4D2]"
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-semibold text-[#0F0F0F]">{doc.title}</p>
                              <FileTypeBadge fileType={doc.fileType} />
                            </div>
                            <p className="text-xs text-[#A3A3A3]">
                              {doc.analysisStatus === "done"
                                ? "분석 완료"
                                : doc.analysisStatus === "analyzing"
                                ? (() => {
                                    const step = (doc as any).analysisStep;
                                    if (step === "extracting") return "텍스트 추출 중...";
                                    if (step === "structuring") return "AI 구조 분석 중...";
                                    return "분석 중...";
                                  })()
                                : doc.analysisStatus === "error"
                                ? "분석 실패"
                                : "분석 대기 중"} · {new Date(doc.createdAt).toLocaleDateString("ko-KR")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteDocConfirm({ id: doc.id, title: doc.title }); }}
                            className="p-1.5 transition-colors text-[#D4D4D2] hover:text-red-500"
                            title="삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                          <ChevronRight size={15} className="text-[#D4D4D2]" />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Stats + Recent Sessions */}
          <div className="col-span-4">
            <div className="mb-8">
              <p className="pm-label mb-4">학습 현황</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: documents?.length ?? 0, label: "문서" },
                  { value: groups?.length ?? 0, label: "그룹" },
                  { value: sessions?.filter((s) => s.status === "completed").length ?? 0, label: "완료 세션", accent: true },
                  { value: sessions?.filter((s) => s.status === "active").length ?? 0, label: "진행 중" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white border border-[#E5E5E3] rounded-xl p-4">
                    <div className={`text-2xl font-bold mb-1 ${stat.accent ? "text-[#5B5BD6]" : "text-[#0F0F0F]"}`}>
                      {stat.value}
                    </div>
                    <div className="pm-label">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="pm-label">최근 학습 세션</p>
                <button
                  onClick={() => navigate("/history")}
                  className="text-xs text-[#A3A3A3] hover:text-[#0F0F0F] transition-colors font-medium"
                >
                  전체 보기
                </button>
              </div>
              {recentSessions.length === 0 ? (
                <div className="bg-white border border-dashed border-[#E5E5E3] rounded-xl p-8 text-center">
                  <BookOpen size={22} className="mx-auto mb-2 text-[#D4D4D2]" />
                  <p className="text-xs text-[#A3A3A3]">학습 기록이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentSessions.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 cursor-pointer bg-white border border-[#E5E5E3] rounded-xl hover:border-[#D4D4D2] hover:shadow-sm transition-all"
                      onClick={() => navigate(`/sessions/${s.id}`)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.status === "completed" ? "bg-[#5B5BD6]" : s.status === "active" ? "bg-amber-400" : "bg-[#D4D4D2]"}`}
                        />
                        <p className="text-xs font-semibold text-[#0F0F0F] truncate">{s.startTopicTitle || "학습 세션"}</p>
                      </div>
                      <div className="flex items-center gap-1.5 pl-3.5">
                        <Clock size={10} className="text-[#D4D4D2]" />
                        <p className="text-xs text-[#A3A3A3]">{new Date(s.createdAt).toLocaleDateString("ko-KR")}</p>
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
  onDeleteDoc: (docId: number, docTitle: string) => void;
  isAnalyzing: boolean;
  navigate: (path: string) => void;
}) {
  const { data: groupDetail } = trpc.group.get.useQuery(
    { groupId: group.id },
    { enabled: isExpanded }
  );

  return (
    <div className="bg-white border border-[#E5E5E3] rounded-xl overflow-hidden hover:border-[#D4D4D2] transition-all">
      {/* Group header row */}
      <div
        className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-[#F8F7F5] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <FolderOpen size={15} className="text-[#5B5BD6]" />
          ) : (
            <Folder size={15} className="text-[#A3A3A3]" />
          )}
          <div>
            <p className="text-sm font-semibold text-[#0F0F0F]">{group.name}</p>
            {group.description && (
              <p className="text-xs text-[#A3A3A3] mt-0.5">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              group.analysisStatus === "done"
                ? "bg-[#DCFCE7] text-[#15803D]"
                : group.analysisStatus === "analyzing"
                ? "bg-[#FEF3C7] text-[#92400E]"
                : "bg-[#F0EFED] text-[#737373]"
            }`}
          >
            {group.analysisStatus === "done" ? "분석 완료" : group.analysisStatus === "analyzing" ? "분석 중" : "미분석"}
          </span>
          {group.analysisStatus === "done" && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/groups/${group.id}`); }}
              className="text-xs font-semibold px-3 py-1 bg-[#0F0F0F] text-white rounded-md hover:bg-[#262626] transition-colors"
            >
              열기
            </button>
          )}
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="text-xs font-semibold px-3 py-1 border border-[#E5E5E3] rounded-md text-[#525252] hover:border-[#A3A3A3] hover:text-[#0F0F0F] transition-colors disabled:opacity-40"
            title="그룹 전체 분석"
          >
            분석
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 transition-colors text-[#D4D4D2] hover:text-red-500"
            title="그룹 삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded: document list + add file */}
      {isExpanded && (
        <div className="border-t border-[#E5E5E3] bg-[#F8F7F5]">
          {groupDetail?.documents && groupDetail.documents.length > 0 ? (
            <div>
              {groupDetail.documents.map((doc: GroupDoc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between px-6 py-3 border-b border-[#E5E5E3] last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        doc.analysisStatus === "done" ? "bg-[#5B5BD6]" : doc.analysisStatus === "analyzing" ? "bg-amber-400" : "bg-[#D4D4D2]"
                      }`}
                    />
                    <span className="text-sm font-medium text-[#0F0F0F]">{doc.title}</span>
                    <FileTypeBadge fileType={doc.fileType ?? undefined} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteDoc(doc.id, doc.title); }}
                    className="p-1 transition-colors text-[#D4D4D2] hover:text-red-500"
                    title="삭제"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-4 text-xs text-[#A3A3A3]">파일이 없습니다.</div>
          )}
          <div className="px-6 py-3 border-t border-[#E5E5E3]">
            <button
              onClick={onAddFile}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#737373] hover:text-[#5B5BD6] transition-colors"
            >
              <Plus size={12} /> 파일 추가 (PDF / DOC / DOCX / PPT / PPTX)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
