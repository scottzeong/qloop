import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import type {
  DocumentStructure,
  TopicNode,
  ChapterNode,
  ConceptNode,
  ConceptCard,
  TimelineItem,
  ComparisonTable,
  LearningPathStep,
} from "../../../server/routers";

// ─── Tab types ────────────────────────────────────────────────────────────────

type ViewTab = "tree" | "concepts" | "cards" | "timeline" | "comparison" | "path";

const TAB_LABELS: Record<ViewTab, string> = {
  tree: "목차 트리",
  concepts: "개념 맵",
  cards: "개념 카드",
  timeline: "타임라인",
  comparison: "비교표",
  path: "학습 경로",
};

// ─── Tree View ────────────────────────────────────────────────────────────────

function TopicItem({
  topic,
  depth,
  onSelect,
}: {
  topic: TopicNode;
  depth: number;
  onSelect: (t: TopicNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasSubs = topic.subtopics && topic.subtopics.length > 0;

  return (
    <div className={`border-l-2 border-black/10 ${depth > 0 ? "ml-5" : ""}`}>
      <div className="flex items-start gap-2 py-2 px-3 hover:bg-black/[0.03] group">
        {hasSubs ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 w-4 h-4 flex-shrink-0 text-xs font-mono text-black/40 hover:text-black"
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="mt-1.5 w-4 flex-shrink-0 flex items-center justify-center">
            <span className="w-1.5 h-1.5 bg-red-600 block" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-black leading-snug">{topic.title}</p>
          {topic.description && (
            <p className="text-xs text-black/50 mt-0.5 leading-relaxed">{topic.description}</p>
          )}
        </div>
        <button
          onClick={() => onSelect(topic)}
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-xs font-bold uppercase tracking-widest text-red-600 border border-red-600 px-2 py-0.5 hover:bg-red-600 hover:text-white transition-colors"
        >
          학습
        </button>
      </div>
      {expanded && hasSubs && (
        <div>
          {topic.subtopics!.map((s) => (
            <TopicItem key={s.id} topic={s} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeView({
  structure,
  onSelectTopic,
}: {
  structure: DocumentStructure;
  onSelectTopic: (topic: TopicNode) => void;
}) {
  const totalTopics = structure.chapters.reduce(
    (acc, ch) => acc + ch.topics.length + ch.topics.reduce((a, t) => a + (t.subtopics?.length ?? 0), 0),
    0
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-black/40 font-bold uppercase tracking-widest">
        {structure.chapters.length}개 챕터 · {totalTopics}개 토픽 — 학습할 토픽을 선택하세요
      </p>
      {structure.chapters.map((ch) => (
        <div key={ch.id} className="border border-black">
          <div className="bg-black text-white px-4 py-2.5 flex items-center gap-3">
            <span className="text-xs font-mono text-white/40">CH.{String(ch.order).padStart(2, "0")}</span>
            <span className="font-bold text-sm tracking-wide uppercase">{ch.title}</span>
            <span className="ml-auto text-xs text-white/40">{ch.topics.length}개 토픽</span>
          </div>
          <div className="divide-y divide-black/10">
            {ch.topics.map((t) => (
              <TopicItem key={t.id} topic={t} depth={0} onSelect={onSelectTopic} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Concept Map View ─────────────────────────────────────────────────────────

function ConceptMapView({
  nodes,
  structure,
  onSelectTopic,
}: {
  nodes: ConceptNode[];
  structure: DocumentStructure;
  onSelectTopic: (topic: TopicNode) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!nodes || nodes.length === 0) {
    return <EmptyState message="이 문서에서 개념 맵 데이터를 추출하지 못했습니다." />;
  }

  const coreNodes = nodes.filter((n) => n.type === "core");
  const subNodes = nodes.filter((n) => n.type === "sub");
  const relatedNodes = nodes.filter((n) => n.type === "related");

  const W = 800;
  const H = 560;
  const cx = W / 2;
  const cy = H / 2;

  const positions: Record<string, { x: number; y: number }> = {};

  coreNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(coreNodes.length, 1) - Math.PI / 2;
    const r = coreNodes.length === 1 ? 0 : 90;
    positions[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  subNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(subNodes.length, 1) - Math.PI / 4;
    positions[n.id] = { x: cx + 190 * Math.cos(angle), y: cy + 190 * Math.sin(angle) };
  });

  relatedNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(relatedNodes.length, 1);
    positions[n.id] = { x: cx + 270 * Math.cos(angle), y: cy + 270 * Math.sin(angle) };
  });

  const nodeColor: Record<string, string> = { core: "#dc2626", sub: "#000000", related: "#9ca3af" };

  const edgeSet = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];
  nodes.forEach((n) => {
    n.connections.forEach((cid) => {
      const key = [n.id, cid].sort().join("--");
      if (!edgeSet.has(key) && positions[n.id] && positions[cid]) {
        edgeSet.add(key);
        edges.push({ from: n.id, to: cid });
      }
    });
  });

  const hoveredNode = hovered ? nodes.find((n) => n.id === hovered) : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-6 text-xs font-bold uppercase tracking-widest">
        {[["core", "핵심 개념"], ["sub", "하위 개념"], ["related", "연관 개념"]].map(([type, label]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className="w-3 h-3 inline-block" style={{ background: nodeColor[type] }} />
            {label}
          </span>
        ))}
      </div>

      <div className="border border-black overflow-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480, maxHeight: 560 }}>
          {edges.map((e) => {
            const from = positions[e.from];
            const to = positions[e.to];
            const isActive = hovered === e.from || hovered === e.to;
            return (
              <line
                key={`${e.from}-${e.to}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={isActive ? "#dc2626" : "#000"}
                strokeWidth={isActive ? 1.5 : 0.5}
                strokeOpacity={isActive ? 0.8 : 0.15}
              />
            );
          })}
          {nodes.map((n) => {
            const pos = positions[n.id];
            if (!pos) return null;
            const isHov = hovered === n.id;
            const isConnected = hovered ? nodes.find((x) => x.id === hovered)?.connections.includes(n.id) : false;
            const radius = n.type === "core" ? 38 : n.type === "sub" ? 30 : 24;
            const color = nodeColor[n.type];
            return (
              <g
                key={n.id}
                transform={`translate(${pos.x},${pos.y})`}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={radius}
                  fill={isHov || isConnected ? color : "white"}
                  stroke={color}
                  strokeWidth={isHov ? 2.5 : 1.5}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={n.type === "core" ? 10 : 9}
                  fontWeight="bold"
                  fill={isHov || isConnected ? "white" : color}
                  style={{ userSelect: "none", fontFamily: "Inter, sans-serif" }}
                >
                  {n.label.length > 8 ? n.label.slice(0, 7) + "…" : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {hoveredNode && (
        <div className="border-l-4 border-red-600 pl-4 py-2 bg-black/[0.02]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-bold text-sm">{hoveredNode.label}</p>
              <p className="text-xs text-black/60 mt-1">{hoveredNode.description}</p>
              {hoveredNode.connections.length > 0 && (
                <p className="text-xs text-black/40 mt-1">
                  연결: {hoveredNode.connections.map((cid) => nodes.find((n) => n.id === cid)?.label).filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            {(() => {
              // 이 개념과 관련된 토픽 찾기
              const relatedTopic = structure.chapters
                .flatMap((ch) => [...ch.topics, ...(ch.topics.flatMap((t) => t.subtopics ?? []))])
                .find((t) => t.title.toLowerCase().includes(hoveredNode.label.toLowerCase()) || hoveredNode.label.toLowerCase().includes(t.title.toLowerCase()));
              return relatedTopic ? (
                <button
                  onClick={() => onSelectTopic(relatedTopic)}
                  className="flex-shrink-0 text-xs font-bold uppercase tracking-widest text-red-600 border border-red-600 px-2 py-1 hover:bg-red-600 hover:text-white transition-colors whitespace-nowrap"
                >
                  학습 시작
                </button>
              ) : null;
            })()}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`border p-3 cursor-pointer transition-colors ${hovered === n.id ? "border-red-600 bg-red-50" : "border-black/20 hover:border-black"}`}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 flex-shrink-0" style={{ background: nodeColor[n.type] }} />
              <span className="font-bold text-xs uppercase tracking-wide">{n.label}</span>
            </div>
            <p className="text-xs text-black/50 mt-1 leading-relaxed">{n.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Concept Cards View ───────────────────────────────────────────────────────

function ConceptCardsView({
  cards,
  structure,
  onSelectTopic,
}: {
  cards: ConceptCard[];
  structure: DocumentStructure;
  onSelectTopic: (topic: TopicNode) => void;
}) {
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  if (!cards || cards.length === 0) {
    return <EmptyState message="이 문서에서 핵심 개념 카드를 추출하지 못했습니다." />;
  }

  const filtered = filter === "all" ? cards : cards.filter((c) => c.importance === filter);
  const importanceLabel: Record<string, string> = { high: "필수", medium: "중요", low: "참고" };
  const importanceStyle: Record<string, string> = {
    high: "bg-red-600 text-white",
    medium: "bg-black text-white",
    low: "bg-black/15 text-black",
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["all", "high", "medium", "low"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-bold uppercase tracking-widest px-3 py-1 border transition-colors ${
              filter === f ? "bg-black text-white border-black" : "border-black/30 hover:border-black"
            }`}
          >
            {f === "all" ? `전체 (${cards.length})` : `${importanceLabel[f]} (${cards.filter((c) => c.importance === f).length})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((card) => (
          <div key={card.id} className="border border-black flex flex-col">
            <div className="bg-black px-3 py-2.5 flex items-center justify-between gap-2">
              <span className="font-bold text-white text-sm leading-tight">{card.term}</span>
              <span className={`text-xs font-bold px-2 py-0.5 flex-shrink-0 ${importanceStyle[card.importance]}`}>
                {importanceLabel[card.importance]}
              </span>
            </div>
            <div className="p-3 flex-1 space-y-2.5">
              <p className="text-xs leading-relaxed text-black/80">{card.definition}</p>
              {card.example && (
                <div className="border-l-2 border-red-600 pl-2">
                  <p className="text-xs text-black/40 font-bold uppercase tracking-wider mb-0.5">예시</p>
                  <p className="text-xs text-black/70 leading-relaxed">{card.example}</p>
                </div>
              )}
              {card.relatedTerms.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-black/10">
                  {card.relatedTerms.map((t) => (
                    <span key={t} className="text-xs border border-black/20 px-1.5 py-0.5 text-black/50">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {(() => {
                const allTopics = structure.chapters.flatMap((ch) => [
                  ...ch.topics,
                  ...(ch.topics.flatMap((t) => t.subtopics ?? [])),
                ]);
                const relatedTopic = allTopics.find(
                  (t) =>
                    t.title.toLowerCase().includes(card.term.toLowerCase()) ||
                    card.term.toLowerCase().includes(t.title.toLowerCase())
                );
                return relatedTopic ? (
                  <button
                    onClick={() => onSelectTopic(relatedTopic)}
                    className="mt-1 w-full text-xs font-bold uppercase tracking-widest text-red-600 border border-red-600 py-1 hover:bg-red-600 hover:text-white transition-colors"
                  >
                    관련 토픽 학습
                  </button>
                ) : null;
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

function TimelineView({
  items,
  structure,
  onSelectTopic,
}: {
  items: TimelineItem[];
  structure: DocumentStructure;
  onSelectTopic: (topic: TopicNode) => void;
}) {
  if (!items || items.length === 0) {
    return <EmptyState message="이 문서에는 타임라인 형태로 표현할 수 있는 시계열/단계 데이터가 없습니다." />;
  }

  return (
    <div className="relative">
      <div className="absolute left-[88px] top-0 bottom-0 w-px bg-black/20" />
      <div className="space-y-0">
        {items.map((item, idx) => (
          <div key={item.id} className="flex group">
            <div className="w-[80px] flex-shrink-0 text-right pr-4 pt-3">
              <span className="text-xs font-bold text-black/50 leading-tight block">{item.period}</span>
            </div>
            <div className="flex-shrink-0 w-[16px] flex flex-col items-center">
              <div
                className={`w-3 h-3 border-2 mt-3.5 flex-shrink-0 transition-colors ${
                  idx === 0 ? "bg-red-600 border-red-600" : "bg-white border-black group-hover:bg-black"
                }`}
              />
            </div>
            <div className="flex-1 pl-4 pb-8 pt-2">
              <p className="font-bold text-sm text-black">{item.title}</p>
              <p className="text-xs text-black/60 mt-1 leading-relaxed">{item.description}</p>
              {item.significance && (
                <p className="text-xs text-red-600 mt-1.5 font-medium">{item.significance}</p>
              )}
              {(() => {
                const allTopics = structure.chapters.flatMap((ch) => [
                  ...ch.topics,
                  ...(ch.topics.flatMap((t) => t.subtopics ?? [])),
                ]);
                const relatedTopic = allTopics.find(
                  (t) =>
                    t.title.toLowerCase().includes(item.title.toLowerCase()) ||
                    item.title.toLowerCase().includes(t.title.toLowerCase())
                );
                return relatedTopic ? (
                  <button
                    onClick={() => onSelectTopic(relatedTopic)}
                    className="mt-2 text-xs font-bold uppercase tracking-widest text-red-600 border border-red-600 px-2 py-0.5 hover:bg-red-600 hover:text-white transition-colors"
                  >
                    관련 토픽 학습
                  </button>
                ) : null;
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Comparison View ──────────────────────────────────────────────────────────

function ComparisonView({
  tables,
  structure,
  onSelectTopic,
}: {
  tables: ComparisonTable[];
  structure: DocumentStructure;
  onSelectTopic: (topic: TopicNode) => void;
}) {
  if (!tables || tables.length === 0) {
    return <EmptyState message="이 문서에는 비교표 형태로 표현할 수 있는 대조 데이터가 없습니다." />;
  }

  return (
    <div className="space-y-8">
      {tables.map((table, ti) => (
        <div key={ti} className="border border-black">
          <div className="bg-black text-white px-4 py-2.5">
            <span className="font-bold text-sm uppercase tracking-wide">{table.title}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-black">
                  <th className="text-left px-4 py-2.5 font-bold text-xs uppercase tracking-widest bg-black/5 w-36">구분</th>
                  {table.headers.map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 font-bold text-xs uppercase tracking-widest bg-black/5 border-l border-black/10">
                      {h}
                    </th>
                  ))}
                  <th className="text-left px-4 py-2.5 font-bold text-xs uppercase tracking-widest bg-black/5 border-l border-black/10 w-24">학습</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => {
                  const allTopics = structure.chapters.flatMap((ch) => [
                    ...ch.topics,
                    ...(ch.topics.flatMap((t) => t.subtopics ?? [])),
                  ]);
                  const relatedTopic = allTopics.find(
                    (t) =>
                      t.title.toLowerCase().includes(row.subject.toLowerCase()) ||
                      row.subject.toLowerCase().includes(t.title.toLowerCase())
                  );
                  return (
                    <tr key={row.id} className={`border-b border-black/10 ${ri % 2 === 0 ? "" : "bg-black/[0.02]"}`}>
                      <td className="px-4 py-3 font-bold text-xs">{row.subject}</td>
                      {table.headers.map((h) => (
                        <td key={h} className="px-4 py-3 text-xs text-black/70 border-l border-black/10 leading-relaxed">
                          {row.attributes[h] ?? "—"}
                        </td>
                      ))}
                      <td className="px-4 py-3 border-l border-black/10">
                        {relatedTopic ? (
                          <button
                            onClick={() => onSelectTopic(relatedTopic)}
                            className="text-xs font-bold uppercase tracking-widest text-red-600 border border-red-600 px-2 py-0.5 hover:bg-red-600 hover:text-white transition-colors whitespace-nowrap"
                          >
                            학습
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Learning Path View ───────────────────────────────────────────────────────

function LearningPathView({
  steps,
  onStartStep,
}: {
  steps: LearningPathStep[];
  onStartStep: (step: LearningPathStep) => void;
}) {
  if (!steps || steps.length === 0) {
    return <EmptyState message="이 문서에서 학습 경로를 추출하지 못했습니다." />;
  }

  const totalMinutes = steps.reduce((s, st) => s + st.estimatedMinutes, 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-black/40 font-bold uppercase tracking-widest">
        {steps.length}단계 · 총 예상 {totalMinutes}분
      </p>
      <div className="space-y-0">
        {steps.map((step, idx) => (
          <div key={step.id}>
            <div className="border border-black group hover:border-red-600 transition-colors flex items-stretch">
              <div className="w-14 bg-black text-white flex items-center justify-center flex-shrink-0 group-hover:bg-red-600 transition-colors">
                <span className="font-bold text-lg">{String(step.order).padStart(2, "0")}</span>
              </div>
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-sm">{step.title}</p>
                    <p className="text-xs text-black/60 mt-1 leading-relaxed">{step.description}</p>
                    <p className="text-xs text-black/30 mt-2">예상 {step.estimatedMinutes}분</p>
                  </div>
                  <button
                    onClick={() => onStartStep(step)}
                    className="flex-shrink-0 text-xs font-bold uppercase tracking-widest text-red-600 border border-red-600 px-3 py-1.5 hover:bg-red-600 hover:text-white transition-colors whitespace-nowrap"
                  >
                    시작
                  </button>
                </div>
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div className="ml-7 h-3 w-px bg-black/20" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-black/20 py-16 text-center">
      <p className="text-sm text-black/40">{message}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const docId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<ViewTab>("tree");
  const [starting, setStarting] = useState(false);

  const { data: doc, isLoading, refetch } = trpc.document.get.useQuery(
    { documentId: docId },
    { enabled: isAuthenticated && !!docId }
  );

  const analyzeMutation = trpc.document.analyze.useMutation({
    onSuccess: () => {
      toast.success("AI 분석이 완료되었습니다.");
      refetch();
    },
    onError: (e) => toast.error(`분석 실패: ${e.message}`),
  });

  const startSession = trpc.session.start.useMutation();

  const structure = doc?.structure as DocumentStructure | null;
  const isAnalyzing = doc?.analysisStatus === "analyzing" || analyzeMutation.isPending;

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
      toast.error(e instanceof Error ? e.message : "세션 시작 실패");
      setStarting(false);
    }
  };

  const handleStartPathStep = async (step: LearningPathStep) => {
    if (!structure) return;
    const firstTopicId = step.topicIds[0];
    let foundTopic: TopicNode | null = null;
    if (firstTopicId) {
      for (const ch of structure.chapters) {
        for (const t of ch.topics) {
          if (t.id === firstTopicId) { foundTopic = t; break; }
          const sub = t.subtopics?.find((s) => s.id === firstTopicId);
          if (sub) { foundTopic = sub; break; }
        }
        if (foundTopic) break;
      }
    }
    if (foundTopic) {
      await handleSelectTopic(foundTopic);
    } else {
      // 토픽을 못 찾으면 단계 자체를 토픽으로 사용
      if (!doc || starting) return;
      setStarting(true);
      try {
        const { sessionId } = await startSession.mutateAsync({
          documentId: docId,
          topicId: step.id,
          topicTitle: step.title,
          topicDescription: step.description,
        });
        navigate(`/sessions/${sessionId}`);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "세션 시작 실패");
        setStarting(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-black border-t-transparent animate-spin mx-auto" />
          <p className="text-xs font-bold uppercase tracking-widest text-black/40">로딩 중</p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="font-bold">문서를 찾을 수 없습니다.</p>
          <button onClick={() => navigate("/dashboard")} className="text-xs font-bold uppercase tracking-widest border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors">
            대시보드로
          </button>
        </div>
      </div>
    );
  }

  const docTypeLabel: Record<string, string> = {
    textbook: "교재", research: "연구자료", manual: "매뉴얼",
    report: "보고서", narrative: "서술형", reference: "참고자료", other: "기타",
  };

  // 사용 가능한 탭 (분석 완료 후 데이터가 있는 것만)
  const availableTabs: ViewTab[] = ["tree"];
  if (structure?.conceptMap && structure.conceptMap.length > 0) availableTabs.push("concepts");
  if (structure?.keyConceptCards && structure.keyConceptCards.length > 0) availableTabs.push("cards");
  if (structure?.timeline && structure.timeline.length > 0) availableTabs.push("timeline");
  if (structure?.comparisonTables && structure.comparisonTables.length > 0) availableTabs.push("comparison");
  if (structure?.learningPath && structure.learningPath.length > 0) availableTabs.push("path");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black transition-colors"
          >
            <ArrowLeft size={12} /> 대시보드
          </button>
          <div className="w-px h-4 bg-black" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 bg-red-600 flex-shrink-0" />
            <span className="text-sm font-bold truncate">{doc.title}</span>
            {structure?.documentType && (
              <span className="text-xs text-black/30 flex-shrink-0">
                — {docTypeLabel[structure.documentType] ?? structure.documentType}
              </span>
            )}
          </div>
          {doc.analysisStatus === "done" && !isAnalyzing && (
            <button
              onClick={() => analyzeMutation.mutate({ documentId: docId })}
              className="text-xs font-bold uppercase tracking-widest border border-black/30 px-3 py-1.5 hover:border-black transition-colors"
            >
              재분석
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-8 py-10 w-full">
        {/* 분석 전 */}
        {doc.analysisStatus === "pending" && (
          <div className="border border-black p-12 text-center space-y-5">
            <div className="w-6 h-6 bg-red-600 mx-auto" />
            <div>
              <p className="font-bold text-lg">AI 분석을 시작하세요</p>
              <p className="text-sm text-black/50 mt-2 max-w-md mx-auto">
                PDF를 분석하여 목차 트리, 개념 맵, 핵심 카드, 타임라인, 비교표, 학습 경로를 동시에 생성합니다.
              </p>
            </div>
            <button
              onClick={() => analyzeMutation.mutate({ documentId: docId })}
              className="bg-red-600 text-white font-bold uppercase tracking-widest px-6 py-2.5 hover:bg-red-700 transition-colors text-sm"
            >
              AI 분석 시작
            </button>
          </div>
        )}

        {/* 분석 중 */}
        {isAnalyzing && (
          <div className="border border-black p-12 text-center space-y-4">
            <div className="w-8 h-8 border-2 border-black border-t-transparent animate-spin mx-auto" />
            <p className="font-bold">AI가 문서를 분석하고 있습니다…</p>
            <p className="text-sm text-black/50">목차 트리, 개념 맵, 핵심 카드, 타임라인, 비교표, 학습 경로를 동시에 추출 중입니다.</p>
          </div>
        )}

        {/* 분석 오류 */}
        {doc.analysisStatus === "error" && !isAnalyzing && (
          <div className="border border-red-600 p-6 space-y-3">
            <p className="font-bold text-red-600">분석 중 오류가 발생했습니다.</p>
            <button
              onClick={() => analyzeMutation.mutate({ documentId: docId })}
              className="bg-red-600 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 hover:bg-red-700 transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 분석 완료 */}
        {doc.analysisStatus === "done" && structure && !isAnalyzing && (
          <div className="space-y-6">
            {/* 요약 + 통계 */}
            <div className="grid grid-cols-12 gap-0 border border-black">
              <div className="col-span-8 p-5 border-r border-black">
                <p className="text-xs font-bold uppercase tracking-widest text-black/40 mb-2">문서 요약</p>
                <p className="text-sm text-black/70 leading-relaxed">{structure.summary}</p>
              </div>
              <div className="col-span-4 grid grid-cols-2 divide-x divide-y divide-black">
                <div className="p-4 text-center">
                  <div className="text-2xl font-black text-red-600">{structure.chapters.length}</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-black/40 mt-1">챕터</div>
                </div>
                <div className="p-4 text-center">
                  <div className="text-2xl font-black">{structure.keyConceptCards?.length ?? 0}</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-black/40 mt-1">개념 카드</div>
                </div>
                <div className="p-4 text-center">
                  <div className="text-2xl font-black">{structure.timeline?.length ?? 0}</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-black/40 mt-1">타임라인</div>
                </div>
                <div className="p-4 text-center">
                  <div className="text-2xl font-black">{structure.learningPath?.length ?? 0}</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-black/40 mt-1">학습 단계</div>
                </div>
              </div>
            </div>

            {/* 탭 네비게이션 */}
            <div className="border-b-2 border-black">
              <div className="flex gap-0 overflow-x-auto">
                {availableTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-3 text-xs font-bold uppercase tracking-widest whitespace-nowrap border-b-2 -mb-0.5 transition-colors ${
                      activeTab === tab
                        ? "border-red-600 text-red-600"
                        : "border-transparent text-black/40 hover:text-black"
                    }`}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>
            </div>

            {/* 탭 콘텐츠 */}
            <div>
              {activeTab === "tree" && <TreeView structure={structure} onSelectTopic={handleSelectTopic} />}
              {activeTab === "concepts" && <ConceptMapView nodes={structure.conceptMap ?? []} structure={structure} onSelectTopic={handleSelectTopic} />}
              {activeTab === "cards" && <ConceptCardsView cards={structure.keyConceptCards ?? []} structure={structure} onSelectTopic={handleSelectTopic} />}
              {activeTab === "timeline" && <TimelineView items={structure.timeline ?? []} structure={structure} onSelectTopic={handleSelectTopic} />}
              {activeTab === "comparison" && <ComparisonView tables={structure.comparisonTables ?? []} structure={structure} onSelectTopic={handleSelectTopic} />}
              {activeTab === "path" && <LearningPathView steps={structure.learningPath ?? []} onStartStep={handleStartPathStep} />}
            </div>
          </div>
        )}
      </main>

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
