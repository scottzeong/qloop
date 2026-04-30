import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Download, Search, Tag, ArrowLeft, Library, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

// ─── 학습자 뷰 ────────────────────────────────────────────────────────────────

function LearnerView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");

  const { data: libraryData, refetch: refetchLibrary } = trpc.library.listLibrary.useQuery({
    search: searchQuery || undefined,
    tag: selectedTag !== "all" ? selectedTag : undefined,
  });
  const libraryItems = libraryData?.items ?? [];

  const importMutation = trpc.library.importFromLibrary.useMutation({
    onSuccess: () => {
      toast.success("내 문서로 가져왔습니다. 대시보드에서 확인하세요.");
      refetchLibrary();
    },
    onError: (err) => toast.error(err.message),
  });

  // 태그 목록 추출
  const allTags = Array.from(
    new Set(libraryItems.flatMap((item) => {
      const raw = item.tags;
      if (!raw) return [];
      return (raw as string).split(",").map((t: string) => t.trim()).filter(Boolean);
    }))
  );

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

      {/* 자료 목록 */}
      {libraryItems.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Library className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">아직 등록된 자료가 없습니다.</p>
          <p className="text-sm mt-2">관리자가 자료를 등록하면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {libraryItems.map((item) => {
            const tags = item.tags
              ? (item.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean)
              : [];
            return (
              <Card key={item.id} className="border border-border hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base leading-tight">{item.title}</CardTitle>
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
                      {tags.map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-2 mt-1"
                    onClick={() => importMutation.mutate({ libraryItemId: item.id })}
                    disabled={importMutation.isPending}
                  >
                    <Download className="w-4 h-4" />
                    내 문서로 가져오기
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

// ─── 관리자 뷰 ────────────────────────────────────────────────────────────────

function AdminView() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [descInput, setDescInput] = useState("");

  const { data: adminData, refetch: refetchAdmin } = trpc.library.listLibraryAdmin.useQuery();
  const adminItems = adminData?.items ?? [];

  const { data: myDocs } = trpc.document.list.useQuery();

  const addMutation = trpc.library.addToLibrary.useMutation({
    onSuccess: () => {
      toast.success("Knowledge Library에 추가되었습니다.");
      setAddDialogOpen(false);
      setSelectedDocId("");
      setTagInput("");
      setDescInput("");
      refetchAdmin();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.library.removeFromLibrary.useMutation({
    onSuccess: () => {
      toast.success("라이브러리에서 제거되었습니다.");
      refetchAdmin();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleVisibilityMutation = trpc.library.toggleLibraryVisibility.useMutation({
    onSuccess: () => {
      toast.success("공개 상태가 변경되었습니다.");
      refetchAdmin();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAdd = () => {
    if (!selectedDocId) return toast.error("문서를 선택해주세요.");
    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean).join(",");
    addMutation.mutate({
      documentId: Number(selectedDocId),
      tags: tags || undefined,
      description: descInput.trim() || undefined,
    });
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted-foreground">총 {adminItems.length}개 자료 등록됨</p>
        <Button onClick={() => setAddDialogOpen(true)} size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          자료 추가
        </Button>
      </div>

      {adminItems.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Library className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">등록된 자료가 없습니다.</p>
          <p className="text-sm mt-2">'자료 추가' 버튼으로 첫 번째 자료를 등록하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adminItems.map((item) => {
            const tags = item.tags
              ? (item.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean)
              : [];
            const isPublic = item.isPublic === 1;
            return (
              <div key={item.id} className="border border-border rounded-lg p-4 flex items-start gap-4">
                <BookOpen className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.title}</span>
                    <Badge variant={isPublic ? "default" : "secondary"} className="text-xs">
                      {isPublic ? "공개" : "비공개"}
                    </Badge>
                    {tags.map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-xs gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
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

      {/* 자료 추가 다이얼로그 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Knowledge Library에 자료 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">문서 선택</label>
              <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                <SelectTrigger>
                  <SelectValue placeholder="추가할 문서를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {(myDocs ?? []).map((doc: any) => (
                    <SelectItem key={doc.id} value={String(doc.id)}>
                      {doc.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">설명 (선택)</label>
              <Input
                placeholder="자료에 대한 간단한 설명"
                value={descInput}
                onChange={(e) => setDescInput(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">태그 (쉼표로 구분)</label>
              <Input
                placeholder="예: 수학, 미적분, 기초"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleAdd}
              disabled={addMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function KnowledgeLibrary() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<"browse" | "manage">("browse");

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
          <strong>Knowledge Library</strong>는 관리자가 선별한 학습 자료 모음입니다.
          {isAdmin
            ? " 자료를 추가하거나 제거하여 학습자들이 활용할 수 있도록 관리하세요."
            : " 원하는 자료를 내 문서로 가져와 학습을 시작하세요."}
        </div>

        {/* 관리자 탭 */}
        {isAdmin && (
          <div className="flex gap-0 border-b border-border mb-6">
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
            <button
              onClick={() => setActiveTab("manage")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === "manage"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              관리자 관리
            </button>
          </div>
        )}

        {/* 콘텐츠 */}
        {isAdmin && activeTab === "manage" ? <AdminView /> : <LearnerView />}
      </div>
    </div>
  );
}
