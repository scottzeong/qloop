import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { FileText, Upload, Clock, ChevronRight, BookOpen, BarChart2, LogOut } from "lucide-react";

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const { data: documents, refetch } = trpc.document.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: sessions } = trpc.session.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const uploadMutation = trpc.document.upload.useMutation();
  const analyzeMutation = trpc.document.analyze.useMutation();

  const handleFile = useCallback(
    async (file: File) => {
      if (!file || file.type !== "application/pdf") {
        toast.error("PDF 파일만 업로드할 수 있습니다.");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("파일 크기는 20MB 이하여야 합니다.");
        return;
      }

      setUploading(true);
      setUploadProgress(10);

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

        setUploadProgress(40);

        const { documentId } = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileData: base64,
          fileSize: file.size,
          mimeType: file.type,
        });

        setUploadProgress(60);
        toast.info("PDF 분석 중...", { duration: 3000 });

        await analyzeMutation.mutateAsync({ documentId });

        setUploadProgress(100);
        toast.success("분석 완료! 문서가 준비되었습니다.");
        await refetch();
        navigate(`/documents/${documentId}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "업로드 실패";
        toast.error(msg);
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [uploadMutation, analyzeMutation, refetch, navigate]
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

  const recentSessions = sessions?.slice(0, 3) ?? [];

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
        <div className="grid grid-cols-12 gap-0">
          {/* Left: Upload + Docs */}
          <div className="col-span-8 pr-12 border-r border-black">
            {/* Upload area */}
            <div className="mb-12">
              <div className="swiss-label mb-4">새 문서 업로드</div>
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
                  accept=".pdf"
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
                    <p className="text-sm font-bold mb-1">PDF 파일을 드래그하거나 클릭하여 업로드</p>
                    <p className="text-xs text-gray-400">최대 20MB · PDF 형식만 지원</p>
                  </>
                )}
              </div>
            </div>

            {/* Documents list */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="swiss-label">내 문서</div>
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
                        <div className={`w-2 h-2 flex-shrink-0 ${doc.analysisStatus === "done" ? "swiss-red-bg" : doc.analysisStatus === "analyzing" ? "bg-yellow-400" : "bg-gray-300"}`} />
                        <div>
                          <p className="text-sm font-bold">{doc.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {doc.analysisStatus === "done" ? "분석 완료" : doc.analysisStatus === "analyzing" ? "분석 중..." : "대기 중"} ·{" "}
                            {new Date(doc.createdAt).toLocaleDateString("ko-KR")}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Stats + Recent Sessions */}
          <div className="col-span-4 pl-12">
            {/* Stats */}
            <div className="mb-10">
              <div className="swiss-label mb-6">학습 현황</div>
              <div className="grid grid-cols-2 gap-0">
                <div className="border border-black p-5 border-r-0">
                  <div className="text-3xl font-black mb-1">{documents?.length ?? 0}</div>
                  <div className="swiss-label">문서</div>
                </div>
                <div className="border border-black p-5">
                  <div className="text-3xl font-black mb-1">{sessions?.length ?? 0}</div>
                  <div className="swiss-label">학습 세션</div>
                </div>
                <div className="border border-black p-5 border-t-0 border-r-0">
                  <div className="text-3xl font-black mb-1" style={{ color: "var(--swiss-red)" }}>
                    {sessions?.filter((s) => s.status === "completed").length ?? 0}
                  </div>
                  <div className="swiss-label">완료</div>
                </div>
                <div className="border border-black p-5 border-t-0">
                  <div className="text-3xl font-black mb-1">
                    {sessions?.filter((s) => s.status === "active").length ?? 0}
                  </div>
                  <div className="swiss-label">진행 중</div>
                </div>
              </div>
            </div>

            {/* Recent sessions */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="swiss-label">최근 학습 세션</div>
                <button onClick={() => navigate("/history")} className="text-xs text-gray-400 hover:text-black transition-colors">
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
                        <div className={`w-1.5 h-1.5 flex-shrink-0 ${s.status === "completed" ? "swiss-red-bg" : s.status === "active" ? "bg-yellow-400" : "bg-gray-300"}`} />
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
