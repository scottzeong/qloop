import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/PageHeader";
import {
  BookOpen, Search, Tag, Library,
  Trash2, Upload, FileText,
  Loader2, CheckCircle2, X, ChevronDown, ChevronUp,
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

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
};
const FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx";

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function KnowledgeLibrary() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // 업로드 상태
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 검색/필터 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  // 미리보기 펼침 상태 (item.id → boolean)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 내 Library 목록 조회
  const { data: myData, refetch } = trpc.library.listMyLibrary.useQuery();
  const myItems = myData?.items ?? [];

  // 업로드 뮤테이션
  const uploadMutation = trpc.library.uploadFile.useMutation({
    onSuccess: () => {
      toast.success("Knowledge Library에 등록되었습니다.");
      setPendingFile(null);
      setTitle("");
      setDescription("");
      setTags("");
      setUploadProgress(0);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "등록에 실패했습니다.");
      setUploading(false);
      setUploadProgress(0);
    },
  });

  // 삭제 뮤테이션
  const deleteMutation = trpc.library.deleteMyLibraryItem.useMutation({
    onSuccess: () => {
      toast.success("삭제되었습니다.");
      refetch();
    },
    onError: (err) => toast.error(err.message || "삭제에 실패했습니다."),
  });

  // 파일 선택 처리
  const handleFileSelect = useCallback((file: File) => {
    if (!ALLOWED_TYPES[file.type]) {
      toast.error("PDF, DOC, DOCX, PPT, PPTX 파일만 지원합니다.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("파일 크기가 20MB를 초과합니다.");
      return;
    }
    setPendingFile(file);
    setTitle(file.name.replace(/\.[^.]+$/, ""));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // 업로드 실행
  const handleUpload = async () => {
    if (!pendingFile || !title.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    setUploading(true);
    setUploadProgress(20);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        setUploadProgress(50);
        const ext = pendingFile.name.split(".").pop()?.toLowerCase() ?? "pdf";
        await uploadMutation.mutateAsync({
          fileData: base64,
          fileName: pendingFile.name,
          mimeType: pendingFile.type,
          fileSize: pendingFile.size,
          title: title.trim(),
          description: description.trim() || undefined,
          tags: tags.trim() || undefined,
          isPublic: false,
        });
        setUploadProgress(100);
        setUploading(false);
      };
      reader.readAsDataURL(pendingFile);
    } catch {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // 검색/필터 적용
  const allTags = Array.from(new Set(myItems.flatMap((item) => parseTags(item.tags as string | null))));
  const filteredItems = myItems.filter((item) => {
    const matchSearch = !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchTag = !selectedTag || parseTags(item.tags as string | null).includes(selectedTag);
    return matchSearch && matchTag;
  });

  return (
    <div className="min-h-screen bg-white">
      <PageHeader
        title="KNOWLEDGE LIBRARY"

      />

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* 안내 배너 */}
        <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          <strong>Knowledge Library</strong>는 학습자가 자신의 지식데이터로 활용하고 싶은 자료를 관리하는 것으로 CORE QLOOP에서 자신이 학습자료와 학습그룹에 추가되어 참고하는 지식데이터베이스입니다.
          <br />
          <span className="text-xs mt-1 block text-blue-700">
            📌 <strong>Curated QLoop</strong> 또는 <strong>Open QLoop</strong> 모델로 학습 시 이 Library의 모든 자료가 자동으로 AI 질문 생성에 참조됩니다.
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 왼쪽: 업로드 영역 */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
              새 자료 등록
            </h2>
            {!pendingFile ? (
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-red-400 bg-red-50" : "border-border hover:border-red-300 hover:bg-muted/30"
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">파일을 드래그하거나 클릭하여 업로드</p>
                <div className="flex justify-center gap-2 flex-wrap mt-2">
                  {["PDF", "DOC", "DOCX", "PPT", "PPTX"].map((t) => (
                    <span key={t} className="text-xs border border-border rounded px-2 py-0.5 text-muted-foreground">{t}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">최대 20MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_ACCEPT}
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>
            ) : (
              <div className="border border-border rounded-xl p-5 space-y-4">
                {/* 파일 정보 */}
                <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                  <FileText className="w-8 h-8 text-red-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{pendingFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(pendingFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* 메타 입력 */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">제목 *</label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="자료 제목"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">설명 (선택)</label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="간단한 설명"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">태그 (쉼표로 구분)</label>
                    <Input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="예: 경제학, 미시경제, 수요공급"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                {/* 진행 바 */}
                {uploading && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-red-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
                {/* 버튼 */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPendingFile(null)} disabled={uploading}>
                    취소
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2"
                    onClick={handleUpload}
                    disabled={uploading || !title.trim()}
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

          {/* 오른쪽: 등록된 자료 목록 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                내 지식 목록 ({filteredItems.length}/{myItems.length})
              </h2>
            </div>

            {/* 검색 + 태그 필터 */}
            {myItems.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="제목으로 검색..."
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setSelectedTag(null)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        !selectedTag ? "bg-red-600 text-white border-red-600" : "border-border text-muted-foreground hover:border-red-300"
                      }`}
                    >
                      전체
                    </button>
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                          selectedTag === tag ? "bg-red-600 text-white border-red-600" : "border-border text-muted-foreground hover:border-red-300"
                        }`}
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 목록 */}
            {myItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                <Library className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">등록된 지식이 없습니다.</p>
                <p className="text-xs mt-1">왼쪽에서 파일을 업로드하여 등록하세요.</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">검색 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {filteredItems.map((item) => {
                  const itemTags = parseTags(item.tags as string | null);
                  return (
                    <div key={item.id} className="border border-border rounded-lg p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start gap-3">
                        <BookOpen className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{item.title}</span>
                            <FileTypeBadge fileType={item.fileType} />
                          </div>
                          {(item as any).description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{(item as any).description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {itemTags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs gap-1 py-0">
                                <Tag className="w-2.5 h-2.5" />
                                {tag}
                              </Badge>
                            ))}
                            <span className="text-xs text-muted-foreground">
                              {new Date(item.createdAt as unknown as string).toLocaleDateString("ko-KR")}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {(item as any).extractedText && (
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-muted"
                              title="내용 미리보기"
                            >
                              {expandedIds.has(item.id) ? (
                                <><ChevronUp className="w-3.5 h-3.5" /><span>접기</span></>
                              ) : (
                                <><ChevronDown className="w-3.5 h-3.5" /><span>미리보기</span></>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (!window.confirm("Library에서 삭제하시겠습니까?")) return;
                              deleteMutation.mutate({ libraryItemId: item.id });
                            }}
                            className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded hover:bg-muted"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* 미리보기 펼침 영역 */}
                      {expandedIds.has(item.id) && (item as any).extractedText && (
                        <div className="mt-3 ml-8 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground leading-relaxed border border-border/50">
                          <div className="font-semibold text-foreground mb-1.5 text-[11px] uppercase tracking-wide">추출 텍스트 미리보기</div>
                          {((item as any).extractedText as string).slice(0, 500)}
                          {((item as any).extractedText as string).length > 500 && (
                            <span className="text-muted-foreground/60"> ...이하 {((item as any).extractedText as string).length - 500}자 생략</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
