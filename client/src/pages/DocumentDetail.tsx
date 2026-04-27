import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Play, ArrowLeft, BookOpen, Layers } from "lucide-react";

interface TopicNode {
  id: string;
  title: string;
  description: string;
  order: number;
  subtopics?: TopicNode[];
}

interface ChapterNode {
  id: string;
  title: string;
  order: number;
  topics: TopicNode[];
}

interface DocumentStructure {
  title: string;
  summary: string;
  chapters: ChapterNode[];
}

function TopicItem({
  topic,
  chapterTitle,
  onSelect,
  depth = 0,
}: {
  topic: TopicNode;
  chapterTitle: string;
  onSelect: (topic: TopicNode) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSubtopics = topic.subtopics && topic.subtopics.length > 0;

  return (
    <div className={depth > 0 ? "ml-6 border-l border-gray-200 pl-4" : ""}>
      <div
        className="flex items-start justify-between py-3 px-4 hover:bg-gray-50 transition-colors group cursor-pointer border-b border-gray-100"
        onClick={() => hasSubtopics && setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3 flex-1">
          <div className="flex-shrink-0 mt-0.5">
            {hasSubtopics ? (
              expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />
            ) : (
              <div className="w-2 h-2 mt-1" style={{ backgroundColor: "var(--swiss-red)" }} />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">{topic.title}</p>
            {topic.description && (
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{topic.description}</p>
            )}
          </div>
        </div>
        <button
          className="ml-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white px-3 py-1 text-xs font-bold tracking-wide hover:bg-[var(--swiss-red)] flex items-center gap-1"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(topic);
          }}
        >
          <Play size={10} /> 학습 시작
        </button>
      </div>
      {hasSubtopics && expanded && (
        <div>
          {topic.subtopics!.map((sub) => (
            <TopicItem key={sub.id} topic={sub} chapterTitle={chapterTitle} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const docId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);

  const { data: doc, isLoading } = trpc.document.get.useQuery(
    { documentId: docId },
    { enabled: isAuthenticated && !!docId }
  );

  const startSession = trpc.session.start.useMutation();

  const structure = doc?.structure as DocumentStructure | null;

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const handleSelectTopic = async (topic: TopicNode) => {
    if (!doc || starting) return;
    setStarting(true);
    try {
      const { sessionId } = await startSession.mutateAsync({
        documentId: docId,
        topicId: topic.id,
        topicTitle: topic.title,
        topicDescription: topic.description,
      });
      navigate(`/sessions/${sessionId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "세션 시작 실패";
      toast.error(msg);
      setStarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 swiss-red-bg animate-pulse" />
          <span className="swiss-label">문서 로딩 중</span>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">문서를 찾을 수 없습니다.</p>
        <button onClick={() => navigate("/dashboard")} className="swiss-label hover:text-black">
          대시보드로 돌아가기
        </button>
      </div>
    );
  }

  const totalTopics = structure?.chapters.reduce(
    (acc, ch) => acc + ch.topics.length + ch.topics.reduce((a, t) => a + (t.subtopics?.length ?? 0), 0),
    0
  ) ?? 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 swiss-label hover:text-black transition-colors">
              <ArrowLeft size={12} /> 대시보드
            </button>
            <div className="w-px h-4 bg-black" />
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 swiss-red-bg flex-shrink-0" />
              <span className="text-sm font-bold truncate max-w-xs">{doc.title}</span>
            </div>
          </div>
          <div className="swiss-label">{doc.analysisStatus === "done" ? "분석 완료" : "분석 중..."}</div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-8 py-12 w-full">
        <div className="grid grid-cols-12 gap-0">
          {/* Left: Document info */}
          <div className="col-span-3 pr-8 border-r border-black">
            <div className="swiss-label mb-4">문서 정보</div>
            <div className="space-y-4">
              <div>
                <div className="swiss-label mb-1">제목</div>
                <p className="text-sm font-bold">{structure?.title || doc.title}</p>
              </div>
              {structure?.summary && (
                <div>
                  <div className="swiss-label mb-1">요약</div>
                  <p className="text-xs text-gray-600 leading-relaxed">{structure.summary}</p>
                </div>
              )}
              <div className="swiss-rule" />
              <div className="grid grid-cols-2 gap-0">
                <div className="border border-black p-3 border-r-0">
                  <div className="text-2xl font-black">{structure?.chapters.length ?? 0}</div>
                  <div className="swiss-label">챕터</div>
                </div>
                <div className="border border-black p-3">
                  <div className="text-2xl font-black">{totalTopics}</div>
                  <div className="swiss-label">토픽</div>
                </div>
              </div>
              <div className="swiss-rule" />
              <div>
                <div className="swiss-label mb-2">파일 크기</div>
                <p className="text-xs text-gray-500">{doc.fileSize ? `${(doc.fileSize / 1024 / 1024).toFixed(1)} MB` : "—"}</p>
              </div>
              <div>
                <div className="swiss-label mb-2">업로드 일시</div>
                <p className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleDateString("ko-KR")}</p>
              </div>
            </div>
          </div>

          {/* Right: Structure tree */}
          <div className="col-span-9 pl-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Layers size={16} />
                <div className="swiss-label">문서 구조 — 학습 시작 토픽 선택</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 swiss-red-bg" />
                <span className="text-xs text-gray-500">토픽 위에 마우스를 올리면 학습 시작 버튼이 나타납니다</span>
              </div>
            </div>

            {doc.analysisStatus !== "done" ? (
              <div className="border-2 border-dashed border-gray-200 p-16 text-center">
                <BookOpen size={32} className="mx-auto mb-4 text-gray-200" />
                <div className="swiss-label mb-2">AI 분석 진행 중</div>
                <p className="text-sm text-gray-400">잠시 후 페이지를 새로고침하세요.</p>
              </div>
            ) : !structure ? (
              <div className="border border-gray-200 p-12 text-center">
                <p className="text-sm text-gray-400">구조 데이터를 불러올 수 없습니다.</p>
              </div>
            ) : (
              <div className="border-2 border-black">
                {structure.chapters.map((chapter, ci) => (
                  <div key={chapter.id} className={ci > 0 ? "border-t-2 border-black" : ""}>
                    {/* Chapter header */}
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleChapter(chapter.id)}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-black" style={{ color: "var(--swiss-red)" }}>
                          {String(chapter.order).padStart(2, "0")}
                        </span>
                        <span className="text-sm font-black uppercase tracking-wide">{chapter.title}</span>
                        <span className="text-xs text-gray-400">{chapter.topics.length}개 토픽</span>
                      </div>
                      {expandedChapters.has(chapter.id) ? (
                        <ChevronDown size={16} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={16} className="text-gray-400" />
                      )}
                    </div>

                    {/* Topics */}
                    {expandedChapters.has(chapter.id) && (
                      <div className="border-t border-gray-100">
                        {chapter.topics.map((topic) => (
                          <TopicItem
                            key={topic.id}
                            topic={topic}
                            chapterTitle={chapter.title}
                            onSelect={handleSelectTopic}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {starting && (
              <div className="fixed inset-0 bg-white bg-opacity-80 flex items-center justify-center z-50">
                <div className="flex items-center gap-4 border-2 border-black px-8 py-6 bg-white">
                  <div className="w-4 h-4 swiss-red-bg animate-pulse" />
                  <div>
                    <div className="swiss-label mb-1">학습 세션 준비 중</div>
                    <p className="text-xs text-gray-500">AI가 첫 번째 질문을 생성하고 있습니다...</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
