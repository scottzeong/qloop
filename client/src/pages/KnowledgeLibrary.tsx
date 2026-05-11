import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen, Plus, Download, Search, Tag, ArrowLeft, Library,
  Trash2, Eye, EyeOff, Upload, CheckSquare, Square, FileText,
  Loader2, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

// ─── 파일 타입 뱃지 ──────────────────────────────────────────────────────────

function FileTypeBadge({ fileType }: { fileType?: string | null }) {
  const colors: Record<string, string> = {
    pdf: "bg-red-100 text-red-700",
    doc: "bg-blue-100 text-blue-700",
    docx: "bg-blue-100 text-blue-700",
    ppt: "bg-orange-100 text-orange-700",
    pptx: "bg-orange-100 text-orange-700",
  };
  if (!fileType) return null;
  const label = fileType.toUpperCase();
  const cls = colors[fileType] ?? "bg-gray-100 text-gray-700";
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${cls}`}>{label}</span>;
}

// ─── 태그 파싱 헬퍼 ──────────────────────────────────────────────────────────

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

// ─── 학습자 뷰 ───────────────────────────────────────────────────────────────

function LearnerView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: libraryData, refetch: refetchLibrary } = trpc.library.listLibrary.useQuery({
    search: searchQuery || undefined,
    tag: selectedTag !== "all" ? selectedTag : undefined,
  });
  const libraryItems = libraryData?.items ?? [];

  const importMutation = trpc.library.importFromLibrary.useMutation({
    onSuccess: () => {
      toast.success("학습자료로 가져왔습니다. 대시보드에서 확인하세요.");
      refetchLibrary();
    },
    onError: (err) => toast.error(err.message),
  });

  const allTags = Array.from(
    new Set(libraryItems.flatMap((item) => parseTags(item.tags as string | null)))
  );

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImportSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    let success = 0;
    for (const id of ids) {
      try {
        await importMutation.mutateAsync({ libraryItemId: id });
        success++;
      } catch {
        // 개별 오류는 mutation onError에서 처리
      }
    }
    if (success > 0) {
      toast.success(`${success}개 자료를 학습자료로 가져왔습니다.`);
      setSelectedIds(new Set());
    }
  };

  return (
    <>
      {/* 검색 및 필터 */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="자료 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedTag} onValueChange={setSelectedTag}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="태그 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 태그</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 선택 일괄 가져오기 툴바 */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-sm text-blue-800 font-medium">{selectedIds.size}개 선택됨</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
              선택 해제
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
              onClick={handleImportSelected}
              disabled={importMutation.isPending}
            >
              <Download className="w-4 h-4" />
              선택 자료 가져오기
            </Button>
          </div>
        </div>
      )}

      {/* 자료 목록 */}
      {libraryItems.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Library className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">아직 등록된 지식이 없습니다.</p>
          <p className="text-sm mt-2">관리자가 자료를 등록하면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {libraryItems.map((item) => {
            const tags = parseTags(item.tags as string | null);
            const isSelected = selectedIds.has(item.id);
            return (
              <Card
                key={item.id}
                className={`border transition-all cursor-pointer ${
                  isSelected
                    ? "border-red-500 bg-red-50 shadow-md"
                    : "border-border hover:shadow-md"
                }`}
                onClick={() => toggleSelect(item.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    {/* 선택 체크박스 */}
                    <div className="mt-0.5 flex-shrink-0">
                      {isSelected
                        ? <CheckSquare className="w-5 h-5 text-red-600" />
                        : <Square className="w-5 h-5 text-muted-foreground" />
                      }
                    </div>
                    <BookOpen className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base leading-tight">{item.title}</CardTitle>
                        <FileTypeBadge fileType={item.fileType} />
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        추가일: {new Date(item.createdAt as unknown as string).toLocaleDateString("ko-KR")}
                        {item.downloadCount ? ` · 다운로드 ${item.downloadCount}회` : ""}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    className={`w-full gap-2 mt-1 ${isSelected ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      importMutation.mutate({ libraryItemId: item.id });
                    }}
                    disabled={importMutation.isPending}
                  >
                    <Download className="w-4 h-4" />
                    학습자료로 가져오기
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── 관리자 뷰 ───────────────────────────────────────────────────────────────

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
};
const FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx";

function AdminView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // 업로드 폼 상태
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTagInput, setUploadTagInput] = useState("");
  const [uploadDescInput, setUploadDescInput] = useState("");
  const [uploadIsPublic, setUploadIsPublic] = useState(true);



  const { data: adminData, refetch: refetchAdmin } = trpc.library.listLibraryAdmin.useQuery();
  const adminItems = adminData?.items ?? [];



  const uploadAndRegisterMutation = trpc.library.uploadAndRegister.useMutation({
    onSuccess: (data) => {
      if (data.hasContext) {
        toast.success("파일이 Library에 등록되었습니다! 컨텍스트 추출이 완료되었습니다.");
      } else {
        toast.success("파일이 Library에 등록되었습니다.");
      }
      setPendingFile(null);
      setUploadTagInput("");
      setUploadDescInput("");
      refetchAdmin();
    },
    onError: (err) => toast.error(`업로드 실패: ${err.message}`),
  });



  const removeMutation = trpc.library.removeFromLibrary.useMutation({
    onSuccess: () => { toast.success("라이브러리에서 제거되었습니다."); refetchAdmin(); },
    onError: (err) => toast.error(err.message),
  });

  const toggleVisibilityMutation = trpc.library.toggleLibraryVisibility.useMutation({
    onSuccess: () => { toast.success("공개 상태가 변경되었습니다."); refetchAdmin(); },
    onError: (err) => toast.error(err.message),
  });

  const handleFileSelect = useCallback((file: File) => {
    if (!ALLOWED_TYPES[file.type]) {
      toast.error("PDF, DOC, DOCX, PPT, PPTX 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("파일 크기는 20MB 이하여야 합니다.");
      return;
    }
    setPendingFile(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleUploadAndRegister = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadProgress(20);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(pendingFile);
      });
      setUploadProgress(50);
      toast.info("AI 분석 중... 잠시 기다려주세요.", { duration: 10000 });
      await uploadAndRegisterMutation.mutateAsync({
        fileName: pendingFile.name,
        fileData: base64,
        fileSize: pendingFile.size,
        mimeType: pendingFile.type,
        description: uploadDescInput.trim() || undefined,
        tags: uploadTagInput.split(",").map((t) => t.trim()).filter(Boolean).join(",") || undefined,
        isPublic: uploadIsPublic,
      });
      setUploadProgress(100);
    } catch {
      // onError에서 처리
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };



  return (
    <>
      {/* 파일 직접 업로드 영역 */}
      <div className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest mb-3 text-muted-foreground">지식 업로드</h2>

        {!pendingFile ? (
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
              dragging ? "border-red-500 bg-red-50" : "border-border hover:border-red-400 hover:bg-gray-50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-sm">파일을 드래그하거나 클릭하여 업로드</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, PPT, PPTX · 최대 20MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
          </div>
        ) : (
          <div className="border border-border rounded-lg p-5 space-y-4">
            {/* 선택된 파일 표시 */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <FileText className="w-8 h-8 text-red-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{pendingFile.name}</p>
                <p className="text-xs text-muted-foreground">{(pendingFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button
                onClick={() => setPendingFile(null)}
                className="text-muted-foreground hover:text-red-600 transition-colors text-xs"
              >
                변경
              </button>
            </div>

            {/* 메타데이터 입력 */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">설명 (선택)</label>
                <Input
                  placeholder="학습자에게 보여줄 자료 설명"
                  value={uploadDescInput}
                  onChange={(e) => setUploadDescInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">태그 (쉼표로 구분)</label>
                <Input
                  placeholder="예: 수학, 미적분, 기초"
                  value={uploadTagInput}
                  onChange={(e) => setUploadTagInput(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium">공개 여부</label>
                <button
                  onClick={() => setUploadIsPublic((v) => !v)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    uploadIsPublic
                      ? "bg-green-50 border-green-400 text-green-700"
                      : "bg-gray-50 border-gray-300 text-gray-600"
                  }`}
                >
                  {uploadIsPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {uploadIsPublic ? "공개" : "비공개"}
                </button>
              </div>
            </div>

            {/* 업로드 진행 바 */}
            {uploading && (
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-red-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingFile(null)}
                disabled={uploading}
              >
                취소
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2"
                onClick={handleUploadAndRegister}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> AI 분석 중...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Library에 등록</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>



      {/* 등록된 자료 목록 */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            등록된 지식 ({adminItems.length}개)
          </h2>
          <p className="text-xs text-muted-foreground">위 업로드 영역에서 파일을 직접 등록하세요.</p>
        </div>

        {adminItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
            <Library className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">등록된 지식이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {adminItems.map((item) => {
              const tags = parseTags(item.tags as string | null);
              const isPublic = item.isPublic === 1;
              return (
                <div key={item.id} className="border border-border rounded-lg p-4 flex items-start gap-4">
                  <BookOpen className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{item.title}</span>
                      <FileTypeBadge fileType={item.fileType} />
                      <Badge variant={isPublic ? "default" : "secondary"} className="text-xs">
                        {isPublic ? "공개" : "비공개"}
                      </Badge>
                      {item.hasContext && (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-400">
                          컨텍스트 추출완료
                        </Badge>
                      )}
                      {tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      등록일: {new Date(item.createdAt as unknown as string).toLocaleDateString("ko-KR")}
                      {item.downloadCount ? ` · 다운로드 ${item.downloadCount}회` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleVisibilityMutation.mutate({ libraryItemId: item.id, isPublic: !isPublic })}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={isPublic ? "비공개로 전환" : "공개로 전환"}
                    >
                      {isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm("라이브러리에서 제거하시겠습니까?")) return;
                        removeMutation.mutate({ libraryItemId: item.id });
                      }}
                      className="text-muted-foreground hover:text-red-600 transition-colors"
                      title="라이브러리에서 제거"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


    </>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function KnowledgeLibrary() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<"browse" | "manage">(isAdmin ? "manage" : "browse");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 헤더 */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Library className="w-6 h-6 text-red-600" />
        <h1 className="text-xl font-bold">Knowledge Library</h1>
        <Badge variant="secondary" className="text-xs">
          {isAdmin ? "관리자" : "학습자"}
        </Badge>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* 안내 배너 */}
        <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          <strong>Knowledge Library</strong>는 학습자가 자신의 지식데이터로 활용하고 싶은 자료를 관리하는 것으로 OPEN QLOOP가 활성화되면 자신의 학습자료나 학습그룹에 추가하여 학습이 이루어지게 됩니다.
          {isAdmin
            ? ""
            : ""}
        </div>

        {/* 탭 (관리자만) */}
        {isAdmin && (
          <div className="flex gap-0 border-b border-border mb-6">
            <button
              onClick={() => setActiveTab("manage")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === "manage"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              지식 관리
            </button>
            <button
              onClick={() => setActiveTab("browse")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === "browse"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              학습자 뷰 미리보기
            </button>
          </div>
        )}

        {/* 콘텐츠 */}
        {isAdmin && activeTab === "manage" ? <AdminView /> : <LearnerView />}
      </div>
    </div>
  );
}
