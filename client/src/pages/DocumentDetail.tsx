import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Trash2, Lock, RotateCcw, CheckCircle2, AlertCircle, Search, X, Brain, ChevronDown, ChevronUp, BookOpen, BarChart2, GitBranch, Network, Lightbulb, MessageSquare, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

type ViewTab = "tree" | "concepts" | "path";

const TAB_LABELS: Record<ViewTab, string> = {
  tree: "목차 트리",
  concepts: "개념 맵",
  path: "학습 경로",
};

// ─── Tree View ────────────────────────────────────────────────────────────────

type TopicStatus = "completed" | "active" | "none";

function TopicStatusBadge({ status }: { status: TopicStatus }) {
  if (status === "completed") return <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 bg-red-600 text-white">완료</span>;
  if (status === "active") return <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 bg-yellow-400 text-black">진행중</span>;
  return <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 bg-gray-100 text-gray-400">미진행</span>;
}

function TopicItem({
  topic,
  depth,
  onSelect,
  topicProgress,
  previewOnly = false,
}: {
  topic: TopicNode;
  depth: number;
  onSelect: (t: TopicNode) => void;
  topicProgress: Record<string, "completed" | "active">;
  previewOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasSubs = topic.subtopics && topic.subtopics.length > 0;
  const status: TopicStatus = topicProgress[topic.id] ?? "none";
  // 완성도별 배경색: 미진행=흰색, 진행중=회색, 완료=dark gray
  const bgClass = status === "completed" ? "bg-gray-500" : status === "active" ? "bg-gray-200" : "bg-white";
  const textClass = status === "completed" ? "text-white" : "text-black";
  const subTextClass = status === "completed" ? "text-white/70" : "text-black/50";

  return (
    <div className={`border-l-2 border-black/10 ${depth > 0 ? "ml-5" : ""}`}>
      <div className={`flex items-start gap-2 py-2 px-3 group transition-colors ${bgClass} hover:brightness-95`}>
        {hasSubs ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`mt-0.5 w-4 h-4 flex-shrink-0 text-xs font-mono hover:opacity-80 ${status === "completed" ? "text-white/60" : "text-black/40"}`}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="mt-1.5 w-4 flex-shrink-0 flex items-center justify-center">
            <span className={`w-1.5 h-1.5 block ${status === "completed" ? "bg-white" : "bg-red-600"}`} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-snug ${textClass}`}>{topic.title}</p>
          {topic.description && (
            <p className={`text-xs mt-0.5 leading-relaxed ${subTextClass}`}>{topic.description}</p>
          )}
        </div>
        {!previewOnly && (status === "active" ? (
          <span className="flex-shrink-0 text-xs font-bold uppercase tracking-widest px-2 py-0.5 text-gray-500 border border-gray-400">
            진행 중
          </span>
        ) : (
          <button
            onClick={() => onSelect(topic)}
            className={`flex-shrink-0 text-xs font-bold uppercase tracking-widest px-2 py-0.5 transition-colors ${
              status === "completed"
                ? "text-white border border-white hover:bg-white hover:text-gray-700"
                : "text-red-600 border border-red-600 hover:bg-red-600 hover:text-white"
            }`}
          >
            {status === "completed" ? "다시 학습" : "학습 시작"}
          </button>
        ))}
      </div>
      {expanded && hasSubs && (
        <div>
          {topic.subtopics!.map((s) => (
            <TopicItem key={s.id} topic={s} depth={depth + 1} onSelect={onSelect} topicProgress={topicProgress} previewOnly={previewOnly} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeView({
  structure,
  onSelectTopic,
  topicProgress,
  previewOnly = false,
}: {
  structure: DocumentStructure;
  onSelectTopic: (topic: TopicNode) => void;
  topicProgress: Record<string, "completed" | "active">;
  previewOnly?: boolean;
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
              <TopicItem key={t.id} topic={t} depth={0} onSelect={onSelectTopic} topicProgress={topicProgress} previewOnly={previewOnly} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Concept Map View ─────────────────────────────────────────────────────────

/** SVG 내부에서 텍스트를 여러 줄로 래핑하는 헬퍼 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // 단어 자체가 최대 글자 수 초과 시 강제 자르기
      if (word.length > maxCharsPerLine) {
        lines.push(word.slice(0, maxCharsPerLine - 1) + "…");
        current = "";
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // 최대 3줄
}

// 개념맵 노드 레이블로 목차 토픽 완성도 역매핑
function getNodeProgress(
  nodeLabel: string,
  structure: DocumentStructure,
  topicProgress: Record<string, "completed" | "active">
): TopicStatus {
  const allTopics = structure.chapters.flatMap((ch) => [
    ...ch.topics,
    ...(ch.topics.flatMap((t) => t.subtopics ?? [])),
  ]);
  const matched = allTopics.find(
    (t) =>
      t.title.toLowerCase().includes(nodeLabel.toLowerCase()) ||
      nodeLabel.toLowerCase().includes(t.title.toLowerCase())
  );
  if (matched) return topicProgress[matched.id] ?? "none";
  // concept- 형태 ID로도 조회
  const conceptId = `concept-${nodeLabel.replace(/\s+/g, '-').toLowerCase()}`;
  return topicProgress[conceptId] ?? "none";
}

function ConceptMapView({
  nodes,
  structure,
  onSelectTopic,
  onStartFromNode,
  topicProgress,
  previewOnly = false,
}: {
  nodes: ConceptNode[];
  structure: DocumentStructure;
  onSelectTopic: (topic: TopicNode) => void;
  onStartFromNode: (nodeLabel: string, nodeDescription: string) => void;
  topicProgress: Record<string, "completed" | "active">;
  previewOnly?: boolean;
}) {
  // 클릭 선택 고정 (호버 아님)
  const [selected, setSelected] = useState<string | null>(null);

  if (!nodes || nodes.length === 0) {
    return <EmptyState message="이 문서에서 개념 맵 데이터를 추출하지 못했습니다." />;
  }

  const coreNodes = nodes.filter((n) => n.type === "core");
  const subNodes = nodes.filter((n) => n.type === "sub");
  const relatedNodes = nodes.filter((n) => n.type === "related");

  // 노드 수에 따라 SVG 캔버스 크기 동적 조정
  const W = 900;
  const H = Math.max(620, Math.min(800, nodes.length * 40 + 200));
  const cx = W / 2;
  const cy = H / 2;

  const positions: Record<string, { x: number; y: number }> = {};

  // 노드 타입별 반지름 (확대)
  const RADIUS: Record<string, number> = { core: 58, sub: 46, related: 36 };

  coreNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(coreNodes.length, 1) - Math.PI / 2;
    const r = coreNodes.length === 1 ? 0 : 110;
    positions[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  subNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(subNodes.length, 1) - Math.PI / 4;
    positions[n.id] = { x: cx + 230 * Math.cos(angle), y: cy + 230 * Math.sin(angle) };
  });

  relatedNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(relatedNodes.length, 1);
    positions[n.id] = { x: cx + 330 * Math.cos(angle), y: cy + 330 * Math.sin(angle) };
  });

  const nodeColor: Record<string, string> = { core: "#dc2626", sub: "#000000", related: "#6b7280" };

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

  const selectedNode = selected ? nodes.find((n) => n.id === selected) : null;

  const handleNodeClick = (nodeId: string) => {
    setSelected((prev) => (prev === nodeId ? null : nodeId));
  };

  return (
    <div className="space-y-4">
      {/* 레전드 */}
      <div className="flex gap-6 text-xs font-bold uppercase tracking-widest">
        {([["core", "핵심 개념"], ["sub", "하위 개념"], ["related", "연관 개념"]] as const).map(([type, label]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className="w-3 h-3 inline-block" style={{ background: nodeColor[type] }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-black/30">● 클릭하여 선택</span>
      </div>

      {/* SVG 개념맵 */}
      <div className="border border-black overflow-auto bg-white">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ minWidth: 520, maxHeight: H }}
        >
          {/* 엣지 */}
          {edges.map((e) => {
            const from = positions[e.from];
            const to = positions[e.to];
            const isActive = selected === e.from || selected === e.to;
            return (
              <line
                key={`${e.from}-${e.to}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={isActive ? "#dc2626" : "#000"}
                strokeWidth={isActive ? 2 : 0.8}
                strokeOpacity={isActive ? 0.9 : 0.18}
              />
            );
          })}

          {/* 노드 */}
          {nodes.map((n) => {
            const pos = positions[n.id];
            if (!pos) return null;
            const isSel = selected === n.id;
            const isConnected = selected
              ? nodes.find((x) => x.id === selected)?.connections.includes(n.id)
              : false;
            const r = RADIUS[n.type] ?? 36;
            const color = nodeColor[n.type];
            // 노드 완성도 (topicProgress 역매핑)
            const nodeStatus = getNodeProgress(n.label, structure, topicProgress);
            // 완성도별 노드 배경색: 미진행=흰색, 진행중=연회색, 완료=dark gray
            const nodeFillDefault = nodeStatus === "completed" ? "#6b7280" : nodeStatus === "active" ? "#e5e7eb" : "white";
            const nodeStrokeDefault = nodeStatus === "completed" ? "#374151" : color;
            const nodeTextDefault = nodeStatus === "completed" ? "white" : nodeStatus === "active" ? "#374151" : color;
            // 텍스트 래핑: 노드 지름에 따라 한 줄 최대 글자 수 조정
            const charsPerLine = n.type === "core" ? 6 : n.type === "sub" ? 5 : 4;
            const lines = wrapText(n.label, charsPerLine);
            const lineHeight = n.type === "core" ? 14 : 12;
            const fontSize = n.type === "core" ? 12 : n.type === "sub" ? 11 : 10;
            const totalTextH = lines.length * lineHeight;
            const startY = -totalTextH / 2 + lineHeight / 2;
            return (
              <g
                key={n.id}
                transform={`translate(${pos.x},${pos.y})`}
                onClick={() => handleNodeClick(n.id)}
                style={{ cursor: "pointer" }}
              >
                {/* 선택 시 외부 링 */}
                {isSel && (
                  <circle r={r + 8} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 3" strokeOpacity={0.5} />
                )}
                <circle
                  r={r}
                  fill={isSel || isConnected ? color : nodeFillDefault}
                  stroke={isSel ? color : nodeStrokeDefault}
                  strokeWidth={isSel ? 3 : 1.5}
                />
                {/* 래핑된 텍스트 */}
                {lines.map((line, li) => (
                  <text
                    key={li}
                    x={0}
                    y={startY + li * lineHeight}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize}
                    fontWeight="bold"
                    fill={isSel || isConnected ? "white" : nodeTextDefault}
                    style={{ userSelect: "none", fontFamily: "Helvetica Neue, Inter, Arial, sans-serif" }}
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 선택된 노드 상세 패널 (클릭 후 고정, 다른 노드 선택 전까지 유지) */}
      {selectedNode ? (
        <div className="border-l-4 border-red-600 pl-5 py-4 bg-black/[0.02] border border-black/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 flex-shrink-0 inline-block"
                  style={{ background: nodeColor[selectedNode.type] }}
                />
                <p className="font-black text-base tracking-tight">{selectedNode.label}</p>
                <span className="text-xs font-bold uppercase tracking-widest text-black/30 ml-1">
                  {selectedNode.type === "core" ? "핵심" : selectedNode.type === "sub" ? "하위" : "연관"}
                </span>
              </div>
              <p className="text-sm text-black/70 leading-relaxed">{selectedNode.description}</p>
              {selectedNode.connections.length > 0 && (
                <p className="text-xs text-black/40 mt-2">
                  <span className="font-bold uppercase tracking-widest">연결 </span>
                  {selectedNode.connections
                    .map((cid) => nodes.find((n) => n.id === cid)?.label)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              {(() => {
                const allTopics = structure.chapters.flatMap((ch) => [
                  ...ch.topics,
                  ...(ch.topics.flatMap((t) => t.subtopics ?? [])),
                ]);
                const relatedTopic = allTopics.find(
                  (t) =>
                    t.title.toLowerCase().includes(selectedNode.label.toLowerCase()) ||
                    selectedNode.label.toLowerCase().includes(t.title.toLowerCase())
                );
                const nodeStatus = getNodeProgress(selectedNode.label, structure, topicProgress);
                if (nodeStatus === "active") {
                  return (
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500 border border-gray-400 px-4 py-2 whitespace-nowrap text-center">
                      진행 중
                    </span>
                  );
                }
                const btnLabel = nodeStatus === "completed" ? "다시 학습" : "학습 시작";
                if (previewOnly) return null;
                return relatedTopic ? (
                  <button
                    onClick={() => onSelectTopic(relatedTopic)}
                    className="text-xs font-bold uppercase tracking-widest text-white bg-red-600 border border-red-600 px-4 py-2 hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    {btnLabel}
                  </button>
                ) : (
                  <button
                    onClick={() => onStartFromNode(selectedNode.label, selectedNode.description)}
                    className="text-xs font-bold uppercase tracking-widest text-white bg-red-600 border border-red-600 px-4 py-2 hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    {btnLabel}
                  </button>
                );
              })()}
              <button
                onClick={() => setSelected(null)}
                className="text-xs font-bold uppercase tracking-widest text-black/40 border border-black/20 px-4 py-2 hover:border-black hover:text-black transition-colors whitespace-nowrap"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-black/20 py-5 text-center">
          <p className="text-sm text-black/30 font-bold uppercase tracking-widest">개념맵에서 원하는 노드를 클릭하세요</p>
        </div>
      )}
    </div>
  );
}

// ─── Concept Cards View ───────────────────────────────────────────────────────

function ConceptCardsView({
  cards,
  structure,
  onSelectTopic,
  onStartFromNode,
}: {
  cards: ConceptCard[];
  structure: DocumentStructure;
  onSelectTopic: (topic: TopicNode) => void;
  onStartFromNode: (nodeLabel: string, nodeDescription: string) => void;
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
                    학습 시작
                  </button>
                ) : (
                  <button
                    onClick={() => onStartFromNode(card.term, card.definition)}
                    className="mt-1 w-full text-xs font-bold uppercase tracking-widest text-red-600 border border-red-600 py-1 hover:bg-red-600 hover:text-white transition-colors"
                  >
                    학습 시작
                  </button>
                );
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
                      {table.headers.map((h, hi) => (
                        <td key={h} className="px-4 py-3 text-xs text-black/70 border-l border-black/10 leading-relaxed">
                          {(row.values?.[hi]) ?? (row as unknown as Record<string, Record<string, string>>).attributes?.[h] ?? "—"}
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
  topicProgress,
  previewOnly = false,
}: {
  steps: LearningPathStep[];
  onStartStep: (step: LearningPathStep) => void;
  topicProgress: Record<string, "completed" | "active">;
  previewOnly?: boolean;
}) {
  if (!steps || steps.length === 0) {
    return <EmptyState message="이 문서에서 학습 경로를 추출하지 못했습니다." />;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-black/40 font-bold uppercase tracking-widest">
        {steps.length}단계
      </p>
      <div className="space-y-0">
        {steps.map((step, idx) => (
          <div key={step.id}>
            <div className="border border-black group hover:border-red-600 transition-colors flex items-stretch">
              <div className="w-14 bg-black text-white flex items-center justify-center flex-shrink-0 group-hover:bg-red-600 transition-colors">
                <span className="font-bold text-lg">{String(step.order).padStart(2, "0")}</span>
              </div>
              <div className="flex-1 p-4">
                {(() => {
                  const stepStatus: TopicStatus = step.topicIds.some(tid => topicProgress[tid] === "completed") ? "completed"
                    : step.topicIds.some(tid => topicProgress[tid] === "active") ? "active" : "none";
                  return (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-sm">{step.title}</p>
                        <p className="text-xs text-black/60 mt-1 leading-relaxed">{step.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <TopicStatusBadge status={stepStatus} />
                        </div>
                      </div>
                      {!previewOnly && (stepStatus === "active" ? (
                        <span className="flex-shrink-0 text-xs font-bold uppercase tracking-widest text-gray-500 border border-gray-400 px-3 py-1.5 whitespace-nowrap">
                          진행 중
                        </span>
                      ) : (
                        <button
                          onClick={() => onStartStep(step)}
                          className="flex-shrink-0 text-xs font-bold uppercase tracking-widest text-red-600 border border-red-600 px-3 py-1.5 hover:bg-red-600 hover:text-white transition-colors whitespace-nowrap"
                        >
                          {stepStatus === "completed" ? "다시 학습" : "학습 시작"}
                        </button>
                      ))}
                    </div>
                  );
                })()}
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

// ─── Language Badge ─────────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  ko: "한국어", en: "English", ja: "日本語", zh: "中文",
  fr: "Français", de: "Deutsch", es: "Español", pt: "Português",
  ar: "العربية", ru: "Русский",
};

const LANG_SHORT: Record<string, string> = {
  ko: "KO", en: "EN", eng: "EN", ja: "JA", zh: "ZH",
  fr: "FR", de: "DE", es: "ES", pt: "PT", ar: "AR", ru: "RU",
};

const LEARNING_LANG_OPTIONS = [
  { value: "ko", label: "한국어로 학습" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
];

function LanguageBadge({ doc, docId }: { doc: any; docId: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const setLangMutation = trpc.document.setLearningLanguage.useMutation({
    onSuccess: () => {
      utils.document.get.invalidate({ documentId: docId });
      toast.success("학습 언어가 변경되었습니다.");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const srcLang = doc.sourceLanguage ?? "ko";
  const learnLang = doc.learningLanguage ?? "ko";
  const isForeign = srcLang !== "ko" && srcLang !== learnLang;

  const shortSrc = LANG_SHORT[srcLang.toLowerCase()] ?? srcLang.slice(0, 2).toUpperCase();
  const shortLearn = LANG_SHORT[learnLang.toLowerCase()] ?? learnLang.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="학습 언어 설정"
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[#E5E5E3] bg-white hover:bg-[#F8F7F5] text-[#525252] transition-colors"
      >
        <span>{shortSrc}</span>
        {isForeign && (
          <>
            <span className="text-[#D4D4D2]">→</span>
            <span>{shortLearn}</span>
          </>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-[#E5E5E3] rounded-xl shadow-lg z-50 min-w-[160px] overflow-hidden">
          <p className="px-3 py-2 text-xs font-medium text-[#A3A3A3] border-b border-[#F0EFED]">
            학습 언어 선택
          </p>
          {LEARNING_LANG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setLangMutation.mutate({ documentId: docId, learningLanguage: opt.value })}
              disabled={setLangMutation.isPending}
              className={`w-full text-left px-3 py-2.5 text-xs font-medium hover:bg-[#F8F7F5] transition-colors border-b border-[#F0EFED] last:border-b-0 ${
                learnLang === opt.value ? "text-[#5B5BD6] font-semibold" : "text-[#525252]"
              }`}
            >
              {opt.label} {learnLang === opt.value && "✓"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── CONTEXTA 결과 패널 헬퍼 ──────────────────────────────────────────────────

function AccordionCard({
  title, icon, children, defaultOpen = false
}: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#E5E5E3] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-[#F8F7F5] transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[#5B5BD6]">{icon}</span>
          <span className="font-bold text-sm">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-black/40" /> : <ChevronDown size={14} className="text-black/40" />}
      </button>
      {open && <div className="px-5 py-4 bg-[#FAFAFA] border-t border-[#E5E5E3] text-sm space-y-3">{children}</div>}
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="text-xs bg-[#5B5BD6]/10 text-[#5B5BD6] px-2.5 py-1 rounded-full font-medium">{item}</span>
      ))}
    </div>
  );
}

function BulletList({ items }: { items: unknown[] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-black/70">
          <span className="text-[#5B5BD6] font-bold mt-0.5">·</span>
          <span>{typeof item === "string" ? item : JSON.stringify(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function ContextaResultPanel({
  analysis,
  structureAnalysisDone,
  isStructureAnalyzing,
  structure,
  onRerunContexta,
  onSetStructure,
  isSettingStructure,
  structureLocked,
}: {
  analysis: Record<string, unknown>;
  structureAnalysisDone: boolean;
  isStructureAnalyzing: boolean;
  structure: DocumentStructure | null;
  onRerunContexta: () => void;
  onSetStructure: (type: "tree" | "conceptMap" | "learningPath") => void;
  isSettingStructure: boolean;
  structureLocked: boolean;
}) {
  const ca = analysis.contentAnalysis as Record<string, unknown> | null;
  const sa = analysis.structureAnalysis as Record<string, unknown> | null;
  const la = analysis.logicAnalysis as Record<string, unknown> | null;
  const cs = analysis.conceptSummary as Record<string, unknown> | null;
  const us = analysis.understandingSummary as Record<string, unknown> | null;
  const ct = analysis.criticalThinking as Record<string, unknown> | null;

  const tabs = [
    { key: "content",       label: "내용분석",    icon: <BookOpen size={14} />,      data: ca },
    { key: "structure",     label: "구조분석",    icon: <BarChart2 size={14} />,     data: sa },
    { key: "logic",         label: "논리분석",    icon: <GitBranch size={14} />,     data: la },
    { key: "concept",       label: "개념지도",    icon: <Network size={14} />,       data: cs },
    { key: "understanding", label: "이해 흐름도", icon: <Lightbulb size={14} />,     data: us },
    { key: "critical",      label: "비판적 사고", icon: <MessageSquare size={14} />, data: ct },
  ];
  const [activeTab, setActiveTab] = useState("content");
  const [activeStructTab, setActiveStructTab] = useState<"tree" | "conceptMap" | "learningPath" | null>(null);

  const structTabs = [
    { key: "tree" as const,         label: "목차 트리",  available: !!(structure?.chapters?.length) },
    { key: "conceptMap" as const,   label: "개념 맵",    available: !!(structure?.conceptMap?.length) },
    { key: "learningPath" as const, label: "학습 경로",  available: !!(structure?.learningPath?.length) },
  ];

  return (
    <div className="space-y-4 mb-10">

      {/* ── 헤더: 타이틀 + 서브타이틀 + 재분석 버튼 ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-2.5">
          <Brain className="w-5 h-5 text-[#5B5BD6] mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="font-bold text-lg leading-tight">자료 분석 결과</h2>
            <p className="text-[11px] text-black/40 mt-0.5 leading-snug">
              6개의 자료분석으로 자료의 내용을 파악하고 3개의 학습구조분석 중 하나를 선택해 학습하세요
            </p>
          </div>
        </div>
        <button
          onClick={onRerunContexta}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#E5E5E3] bg-white hover:bg-[#F8F7F5] text-[#525252] transition-colors flex-shrink-0"
        >
          <RotateCcw size={11} /> 재분석
        </button>
      </div>

      {/* ── 핵심 요약 카드 (항상 상단 표시) ── */}
      {ca && (
        <div className="bg-[#5B5BD6] text-white rounded-xl p-5 space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-widest opacity-70">핵심 요약</p>
          <p className="text-base font-bold leading-snug">{ca.one_sentence_summary as string}</p>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {ca.difficulty_level && <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-medium">{ca.difficulty_level as string}</span>}
            {ca.target_audience && <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-medium">{ca.target_audience as string}</span>}
          </div>
          {ca.keywords && <TagList items={(ca.keywords as string[]).slice(0, 8)} />}
        </div>
      )}

      {/* ── 탭 바 ── */}
      <div className="border border-[#E5E5E3] rounded-xl overflow-hidden">
        <div className="flex border-b border-[#E5E5E3] overflow-x-auto">

          {/* ════ 자료분석 그룹 ════ */}
          <div className="flex bg-[#F8F7F5]">
            {/* 그룹 레이블 */}
            <div className="flex items-center px-2.5 border-r border-[#E5E5E3]">
              <div className="bg-black text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded whitespace-nowrap">자료분석</div>
            </div>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setActiveStructTab(null); }}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key && !activeStructTab
                    ? "border-[#5B5BD6] text-[#5B5BD6] bg-white"
                    : "border-transparent text-black/45 hover:text-black/70 hover:bg-white/50"
                } ${!tab.data ? "opacity-30 cursor-not-allowed pointer-events-none" : ""}`}
                disabled={!tab.data}
              >
                <span className={activeTab === tab.key && !activeStructTab ? "text-[#5B5BD6]" : "text-black/35"}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* ════ 구분 배지 (레이블 겸 구분선) ════ */}
          <div className="flex items-center flex-shrink-0 bg-black/[0.03] border-x-2 border-black/10 px-2.5">
            <div className="bg-black text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded whitespace-nowrap">
              학습구조
            </div>
          </div>

          {/* ════ 학습구조 탭 그룹 ════ */}
          <div className="flex bg-[#111]/[0.03]">
            {isStructureAnalyzing ? (
              <div className="flex items-center gap-2 px-5 text-xs text-black/40 whitespace-nowrap">
                <div className="w-3 h-3 border-2 border-black/30 border-t-transparent animate-spin rounded-full" />
                분석중…
              </div>
            ) : structureAnalysisDone ? (
              structTabs.map(stab => (
                <button
                  key={stab.key}
                  onClick={() => { setActiveStructTab(stab.key); setActiveTab(""); }}
                  disabled={!stab.available}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-px ${
                    activeStructTab === stab.key
                      ? "border-black text-black bg-black/[0.07]"
                      : "border-transparent text-black/50 hover:text-black hover:bg-black/[0.05]"
                  } ${!stab.available ? "opacity-25 cursor-not-allowed pointer-events-none" : ""}`}
                >
                  {stab.label}
                  {structureLocked && stab.key === (structure as any)?._selectedStructure && (
                    <Lock size={8} className="text-black/40 ml-0.5" />
                  )}
                </button>
              ))
            ) : (
              <div className="flex items-center gap-1.5 px-5 text-xs text-black/25 whitespace-nowrap">
                대기중
              </div>
            )}
          </div>

        </div>

        {/* ── 탭 콘텐츠 ── */}
        <div className="p-5 bg-white min-h-[260px]">

          {/* ① 내용 분석 */}
          {activeTab === "content" && ca && (
            <div className="space-y-4">
              {ca.core_claims && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">핵심 주장</p>
                  <BulletList items={ca.core_claims as unknown[]} />
                </div>
              )}
              {ca.key_concepts && Array.isArray(ca.key_concepts) && ca.key_concepts.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">핵심 개념</p>
                  <div className="space-y-2">
                    {(ca.key_concepts as Array<{name:string;definition:string;importance:string}>).map((c, i) => (
                      <div key={i} className="bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg p-3">
                        <p className="font-bold text-sm">{c.name}</p>
                        <p className="text-xs text-black/60 mt-1">{c.definition}</p>
                        {c.importance && <p className="text-xs text-[#5B5BD6] mt-1">{c.importance}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ca.important_facts && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">중요 사실</p>
                  <BulletList items={ca.important_facts as unknown[]} />
                </div>
              )}
            </div>
          )}

          {/* ② 구조 분석 */}
          {activeTab === "structure" && sa && (
            <div className="space-y-4">
              {sa.structure_type && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">구조 유형</p>
                  <span className="text-sm font-semibold bg-[#5B5BD6]/10 text-[#5B5BD6] px-3 py-1.5 rounded-lg">{sa.structure_type as string}</span>
                </div>
              )}
              {sa.flow && Array.isArray(sa.flow) && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">전개 흐름</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {(sa.flow as string[]).map((f, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-xs bg-[#FAFAFA] border border-[#E5E5E3] px-2.5 py-1.5 rounded-md">{f}</span>
                        {i < (sa.flow as string[]).length - 1 && <ArrowRight size={10} className="text-black/30" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sa.section_roles && Array.isArray(sa.section_roles) && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">섹션 역할</p>
                  <div className="space-y-2">
                    {(sa.section_roles as Array<{title:string;role:string;summary:string}>).slice(0, 5).map((s, i) => (
                      <div key={i} className="flex gap-2.5 bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg p-3">
                        <span className="text-xs font-bold text-[#5B5BD6] bg-[#5B5BD6]/10 px-2 py-0.5 rounded h-fit mt-0.5 whitespace-nowrap">{s.role}</span>
                        <div><p className="text-xs font-semibold">{s.title}</p><p className="text-xs text-black/50 mt-0.5">{s.summary}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ③ 논리 분석 */}
          {activeTab === "logic" && la && (
            <div className="space-y-4">
              {la.overall_logic_summary && (
                <p className="text-sm text-black/70 bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg p-3">{la.overall_logic_summary as string}</p>
              )}
              {la.arguments && Array.isArray(la.arguments) && (
                <div className="space-y-3">
                  {(la.arguments as Array<{claim:string;grounds:unknown[];weaknesses:unknown[];strength:string}>).map((arg, i) => (
                    <div key={i} className="bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg p-4 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                          arg.strength === "strong" ? "bg-green-100 text-green-700" :
                          arg.strength === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                        }`}>{arg.strength === "strong" ? "강" : arg.strength === "medium" ? "중" : "약"}</span>
                        <p className="text-sm font-semibold">{arg.claim}</p>
                      </div>
                      {arg.grounds && arg.grounds.length > 0 && <div><p className="text-xs text-black/40 mb-1">근거</p><BulletList items={arg.grounds} /></div>}
                      {arg.weaknesses && arg.weaknesses.length > 0 && <div><p className="text-xs text-black/40 mb-1">약점</p><BulletList items={arg.weaknesses} /></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ④ 개념 요약 */}
          {activeTab === "concept" && cs && (
            <div className="space-y-3">
              {cs.concepts && Array.isArray(cs.concepts) &&
                (cs.concepts as Array<{name:string;definition:string;why_it_matters:string;examples:string[]}>).map((c, i) => (
                  <div key={i} className="bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg p-4 space-y-1.5">
                    <p className="font-bold text-sm">{c.name}</p>
                    <p className="text-xs text-black/70">{c.definition}</p>
                    {c.why_it_matters && <p className="text-xs text-[#5B5BD6]">왜 중요한가: {c.why_it_matters}</p>}
                    {c.examples && c.examples.length > 0 && <TagList items={c.examples.slice(0, 3)} />}
                  </div>
                ))
              }
            </div>
          )}

          {/* ⑤ 이해 요약 */}
          {activeTab === "understanding" && us && (
            <div className="space-y-4">
              {us.plain_language_summary && (
                <p className="text-sm text-black/70 bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg p-4 leading-relaxed">{us.plain_language_summary as string}</p>
              )}
              {us.learning_path && Array.isArray(us.learning_path) && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">권장 학습 순서</p>
                  <div className="space-y-2">
                    {(us.learning_path as Array<{step:number;title:string;explanation:string}>).map((s, i) => (
                      <div key={i} className="flex gap-3 bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg p-3">
                        <span className="w-6 h-6 rounded-full bg-[#5B5BD6] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                        <div><p className="text-sm font-semibold">{s.title}</p><p className="text-xs text-black/60 mt-0.5">{s.explanation}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {us.check_questions && Array.isArray(us.check_questions) && (us.check_questions as string[]).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">이해 확인 질문</p>
                  <div className="space-y-1.5">
                    {(us.check_questions as string[]).map((q, i) => (
                      <div key={i} className="bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg px-3.5 py-2.5 text-sm text-black/70 flex gap-2">
                        <span className="text-[#5B5BD6] font-bold">Q{i + 1}.</span><span>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ⑥ 비판적 사고 */}
          {activeTab === "critical" && ct && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-black/40">신뢰도</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  ct.reliability_score === "높음" ? "bg-green-100 text-green-700" :
                  ct.reliability_score === "보통" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                }`}>{ct.reliability_score as string}</span>
                {ct.reliability_reason && <span className="text-xs text-black/50">{ct.reliability_reason as string}</span>}
              </div>
              {ct.overall_assessment && (
                <p className="text-sm text-black/70 bg-[#FAFAFA] border border-[#E5E5E3] rounded-lg p-3">{ct.overall_assessment as string}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {ct.strengths && (ct.strengths as string[]).length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-green-700 mb-2">강점</p>
                    <BulletList items={(ct.strengths as unknown[]).slice(0, 3)} />
                  </div>
                )}
                {ct.weaknesses && (ct.weaknesses as string[]).length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-red-700 mb-2">약점</p>
                    <BulletList items={(ct.weaknesses as unknown[]).slice(0, 3)} />
                  </div>
                )}
              </div>
              {ct.unanswered_questions && Array.isArray(ct.unanswered_questions) && (ct.unanswered_questions as string[]).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-black/40 uppercase tracking-wider mb-2">미답 질문</p>
                  <BulletList items={(ct.unanswered_questions as unknown[]).slice(0, 4)} />
                </div>
              )}
            </div>
          )}

          {/* 학습구조 탭 콘텐츠 */}
          {activeStructTab && structureAnalysisDone && structure && (
            <div className="space-y-4">
              {/* 확정 버튼 / 확정 완료 표시 */}
              {structureLocked ? (
                <div className="flex items-center gap-2 pb-2 border-b border-[#E5E5E3]">
                  <CheckCircle2 size={14} className="text-green-600" />
                  <span className="text-xs font-semibold text-green-600">학습 구조 확정됨</span>
                </div>
              ) : (
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E5E3]">
                  <span className="text-xs text-black/40 font-medium">미리보기 후 원하는 구조로 학습을 시작하세요</span>
                  <button
                    onClick={() => onSetStructure(activeStructTab)}
                    disabled={isSettingStructure}
                    className="flex items-center gap-2 bg-black text-white text-xs font-bold uppercase tracking-widest px-4 py-2 hover:bg-black/80 transition-colors disabled:opacity-50 rounded-lg"
                  >
                    {isSettingStructure
                      ? <><span className="w-3 h-3 border border-white border-t-transparent animate-spin rounded-full" /> 확정 중…</>
                      : <>이 구조로 학습하기 <ArrowRight size={11} /></>}
                  </button>
                </div>
              )}
              {/* 구조 미리보기 */}
              <div className="max-h-[420px] overflow-y-auto">
                {activeStructTab === "tree" && (
                  <TreeView structure={structure} onSelectTopic={() => {}} topicProgress={{}} previewOnly={true} />
                )}
                {activeStructTab === "conceptMap" && (
                  <ConceptMapView
                    nodes={structure.conceptMap ?? []}
                    structure={structure}
                    onSelectTopic={() => {}}
                    onStartFromNode={() => {}}
                    topicProgress={{}}
                    previewOnly={true}
                  />
                )}
                {activeStructTab === "learningPath" && (
                  <LearningPathView
                    steps={structure.learningPath ?? []}
                    onStartStep={() => {}}
                    topicProgress={{}}
                    previewOnly={true}
                  />
                )}
              </div>
            </div>
          )}

          {/* 학습구조 탭 클릭했으나 데이터 없음 */}
          {activeStructTab && structureAnalysisDone && !structure && (
            <div className="flex items-center justify-center h-40 text-xs text-black/40">
              학습 구조 데이터를 불러올 수 없습니다
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Open QLoop Toggle ───────────────────────────────────────────────────────

function OpenQloopToggle({ documentId }: { documentId: number }) {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.library.getDocumentSettings.useQuery({ documentId });
  const setOpenQloop = trpc.library.setOpenQloop.useMutation({
    onSuccess: () => {
      utils.library.getDocumentSettings.invalidate({ documentId });
    },
  });
  const enabled = settings?.openQloopEnabled ?? false;
  return (
    <button
      onClick={() => setOpenQloop.mutate({ documentId, enabled: !enabled })}
      disabled={setOpenQloop.isPending}
      title={enabled ? "Open QLoop 비활성화: 인터넷 검색 기반 확장 학습 모드 끄기" : "Open QLoop 활성화: 인터넷 검색 기반 확장 학습 모드 켜기"}
      className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 border transition-colors ${
        enabled
          ? "bg-black text-white border-black hover:bg-black/80"
          : "border-black/30 text-black/50 hover:border-black hover:text-black"
      }`}
    >
      Open QLoop {enabled ? "ON" : "OFF"}
    </button>
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
    {
      enabled: isAuthenticated && !!docId,
      // 분석 중일 때 2초마다 폴링하여 단계 업데이트 반영
      refetchInterval: (query) => {
        const d = query.state.data as any;
        return (d?.analysisStatus === "analyzing" || d?.contextaStatus === "analyzing") ? 2000 : false;
      },
    }
  );

  // 구조 선택 state: null=미선택, 'tree'|'conceptMap'|'learningPath'=미리보기 중
  const [previewStructure, setPreviewStructure] = useState<"tree" | "conceptMap" | "learningPath" | null>(null);
  // 평가 선택 모달 state
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [pendingTopic, setPendingTopic] = useState<{ id: string; title: string; description: string } | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [evalEnabled, setEvalEnabled] = useState<boolean | null>(null);
  // QLoop 모델 선택 state
  const [qloopModel, setQloopModel] = useState<"core" | "curated" | "open">("core");
  // 학습자 레벨 선택 state
  const [learnerLevel, setLearnerLevel] = useState<"student" | "college" | "general">("general");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // ⑤ 세션 재시작 다이얼로그
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumeSessionId, setResumeSessionId] = useState<number | null>(null);
  // ⑦ PDF 미리보기 모달
  const [showPdfViewer, setShowPdfViewer] = useState(false);

  const deleteDocMutation = trpc.document.delete.useMutation();
  const [contextaStarted, setContextaStarted] = useState(false);
  const contextaRunMutation = trpc.contexta.runAnalysis.useMutation({
    onMutate: () => setContextaStarted(true),
    onSuccess: () => { refetch(); },
    onError: (e) => { setContextaStarted(false); toast.error(`자료 분석 실패: ${e.message}`); },
  });
  const analyzeMutation = trpc.document.analyze.useMutation({
    onSuccess: () => {
      // 분석은 백그라운드에서 실행됨 — 완료는 폴링으로 감지, 여기선 toast 없음
      refetch();
    },
    onError: (e) => toast.error(`분석 실패: ${e.message}`),
  });
  const setStructureMutation = trpc.document.setStructure.useMutation({
    onSuccess: () => {
      toast.success("학습 구조가 확정되었습니다.");
      setPreviewStructure(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const reanalyzeMutation = trpc.document.reanalyze.useMutation({
    onSuccess: () => {
      toast.success("재분석이 완료되었습니다.");
      refetch();
    },
    onError: (e) => toast.error(`재분석 실패: ${e.message}`),
  });
  const { data: policies } = trpc.socratic.getPolicies.useQuery();

  const startSession = trpc.session.start.useMutation();
  const { data: viewUrlData, refetch: refetchViewUrl } = trpc.document.getViewUrl.useQuery(
    { documentId: docId },
    { enabled: false } // 버튼 클릭 시에만 fetch
  );
  const { data: myLibraryData } = trpc.library.listMyLibrary.useQuery();
  const myLibraryItems = myLibraryData?.items ?? [];
  const { data: topicProgressData } = trpc.session.getTopicProgress.useQuery(
    { documentId: docId },
    { enabled: isAuthenticated && !!docId }
  );
  const topicProgress: Record<string, "completed" | "active"> = (topicProgressData as Record<string, "completed" | "active">) ?? {};
  const structure = doc?.structure as DocumentStructure | null;;
  const isAnalyzing = doc?.analysisStatus === "analyzing" || analyzeMutation.isPending;
  const contextaStatus = (doc as any)?.contextaStatus as string | null | undefined;
  const contextaStep = (doc as any)?.contextaStep as string | null | undefined;
  const contextaAnalysis = (doc as any)?.contextaAnalysis as Record<string, unknown> | null;
  const contextaDone = contextaStatus === "done";
  const isContextaAnalyzing = contextaStatus === "analyzing" || contextaRunMutation.isPending || (contextaStarted && !contextaDone);
  const showContextaStart = !contextaStarted && (!contextaStatus || contextaStatus === "pending");

  // 학습 시작 전 평가 선택 모달 표시
  const handleSelectTopic = (topic: TopicNode) => {
    if (!doc || starting) return;
    setPendingTopic({ id: topic.id, title: topic.title, description: topic.description });
    setEvalEnabled(null);
    setSelectedPolicyId(null);
    setQloopModel("core");
    setShowEvalModal(true);
  };

  // 평가 선택 후 실제 세션 시작
  const handleConfirmStart = async () => {
    if (!pendingTopic || !doc || starting) return;
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
      const selectedStructure = (doc as any).selectedStructure as "tree" | "conceptMap" | "learningPath" | null;
      const result = await startSession.mutateAsync({
        documentId: docId,
        topicId: pendingTopic.id,
        topicTitle: pendingTopic.title,
        topicDescription: pendingTopic.description,
        evaluationEnabled: evalEnabled,
        evaluationPolicyId: evalEnabled ? (selectedPolicyId ?? undefined) : undefined,
        selectedStructure: selectedStructure ?? undefined,
        qloopModel,
        learnerLevel,
      });
      if ((result as any).resumed) {
        // 이전 세션 재개 — 사용자에게 확인 요청
        setResumeSessionId(result.sessionId);
        setShowResumeDialog(true);
        setStarting(false);
        return;
      }
      navigate(`/sessions/${result.sessionId}?level=${learnerLevel}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "세션 시작 실패");
      setStarting(false);
    }
  };

  const handleStartPathStep = (step: LearningPathStep) => {
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
      handleSelectTopic(foundTopic);
    } else {
      // 토픽을 못 찾으면 단계 자체를 토픽으로 사용
      setPendingTopic({ id: step.id, title: step.title, description: step.description });
      setEvalEnabled(null);
      setSelectedPolicyId(null);
      setShowEvalModal(true);
    }
  };

  // 개념 맵 노드에서 직접 학습 시작
  const handleStartFromNode = (nodeLabel: string, nodeDescription: string) => {
    const nodeId = `concept-${nodeLabel.replace(/\s+/g, '-').toLowerCase()}`;
    setPendingTopic({ id: nodeId, title: nodeLabel, description: nodeDescription || nodeLabel });
    setEvalEnabled(null);
    setSelectedPolicyId(null);
    setShowEvalModal(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#EDECEA] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-black border-t-transparent animate-spin mx-auto" />
          <p className="text-xs font-bold uppercase tracking-widest text-black/40">로딩 중</p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-[#EDECEA] flex items-center justify-center">
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
  if (structure?.learningPath && structure.learningPath.length > 0) availableTabs.push("path");

  return (
    <div className="min-h-screen bg-[#EDECEA] flex flex-col">
      <PageHeader title={doc.title} />

      {/* Document control sub-bar */}
      <div className="sticky top-14 z-40 bg-white border-b border-[#E5E5E3]">
        <div className="max-w-7xl mx-auto px-6 h-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {(doc as any).structureLocked === 1 && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#F0EFED]">
                <Lock size={10} className="text-[#737373]" />
                <span className="text-xs font-medium text-[#737373]">
                  {(doc as any).selectedStructure === 'tree' ? '목차 트리' : (doc as any).selectedStructure === 'conceptMap' ? '개념 맵' : '학습 경로'} 고정
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageBadge doc={doc} docId={docId} />
            {doc.analysisStatus === "done" && !isAnalyzing && (
              <button
                onClick={() => {
                  if ((doc as any).structureLocked === 1) {
                    if (!window.confirm("재분석하면 학습 구조 선택이 초기화됩니다.\n계속하시겠습니까?")) return;
                    reanalyzeMutation.mutate({ documentId: docId });
                  } else {
                    analyzeMutation.mutate({ documentId: docId });
                  }
                }}
                disabled={reanalyzeMutation.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-[#E5E5E3] bg-white hover:bg-[#F8F7F5] text-[#525252] transition-colors disabled:opacity-50"
              >
                <RotateCcw size={11} /> 재분석
              </button>
            )}
            {/* ⑦ 원문 보기 버튼 */}
            {doc.analysisStatus === "done" && (
              <button
                onClick={async () => {
                  setShowPdfViewer(true);
                  await refetchViewUrl();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-[#E5E5E3] bg-white hover:bg-[#F8F7F5] text-[#525252] transition-colors"
                title="원문 미리보기"
              >
                <Search size={11} /> 원문 보기
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-[#A3A3A3] hover:text-red-500 hover:bg-red-50 transition-colors"
              title="문서 삭제"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학습자료 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{doc.title}"</strong>을(를) 삭제하시겠습니까?<br />
              <span className="text-red-600 font-medium">관련 학습이력도 모두 함께 삭제됩니다.</span>
              <br />이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await deleteDocMutation.mutateAsync({ documentId: docId });
                  toast.success("학습자료와 관련 학습이력이 삭제되었습니다.");
                  navigate("/dashboard");
                } catch {
                  toast.error("삭제에 실패했습니다.");
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ⑤ 세션 재시작 확인 다이얼로그 */}
      <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이전 학습 세션이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{pendingTopic?.title}"</strong> 토픽의 진행 중인 세션이 있습니다.<br />
              이어서 학습하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowResumeDialog(false); setResumeSessionId(null); }}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resumeSessionId) navigate(`/sessions/${resumeSessionId}`);
                setShowResumeDialog(false);
              }}
              className="bg-black text-white hover:bg-black/80"
            >
              이어서 학습하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ⑦ PDF 미리보기 모달 */}
      <Dialog open={showPdfViewer} onOpenChange={setShowPdfViewer}>
        <DialogContent className="max-w-5xl w-full h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b border-[#E5E5E3] flex-shrink-0">
            <DialogTitle className="text-sm font-bold">{doc?.title} — 원문 보기</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {viewUrlData?.url ? (
              doc?.fileType === "pdf" ? (
                <iframe
                  src={viewUrlData.url}
                  className="w-full h-full border-0"
                  title="문서 미리보기"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-sm text-[#737373]">
                  <p>이 파일 형식({doc?.fileType?.toUpperCase()})은 브라우저 미리보기를 지원하지 않습니다.</p>
                  <a
                    href={viewUrlData.url}
                    download
                    className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/80"
                  >
                    파일 다운로드
                  </a>
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-full gap-3">
                <div className="w-3 h-3 rounded-full animate-pulse bg-[#5B5BD6]" />
                <span className="text-sm text-[#737373]">파일 로딩 중...</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <main className="flex-1 max-w-7xl mx-auto px-8 py-10 w-full">

        {/* ══ STAGE 1: 자료 분석 (CONTEXTA) ══════════════════════════════════ */}

        {/* 자료 분석 시작 전 */}
        {showContextaStart && !isContextaAnalyzing && (
          <div className="border border-black p-12 text-center space-y-5 mb-8">
            <div className="flex items-center justify-center gap-2">
              <Brain className="w-7 h-7 text-[#5B5BD6]" />
              <p className="font-bold text-xl">자료 분석</p>
            </div>
            <p className="text-sm text-black/50 max-w-lg mx-auto leading-relaxed">
              AI가 문서를 자료분석(6단계)과 학습구조분석을 동시에 진행합니다.<br />
              내용 · 구조 · 논리 · 개념 · 이해 · 비판적 사고 + 목차 트리 · 개념 맵 · 학습 경로
            </p>
            <button
              onClick={() => {
                contextaRunMutation.mutate({ documentId: docId });
                analyzeMutation.mutate({ documentId: docId });
              }}
              disabled={contextaRunMutation.isPending}
              className="bg-[#5B5BD6] text-white font-bold uppercase tracking-widest px-8 py-3 hover:bg-[#4747B5] transition-colors text-sm disabled:opacity-50"
            >
              자료 분석 시작
            </button>
          </div>
        )}

        {/* 자료 분석 진행 중 — 6단계 진행바 */}
        {isContextaAnalyzing && (() => {
          const ctxSteps = [
            { key: "content",       label: "내용 분석",   icon: BookOpen },
            { key: "structure",     label: "구조 분석",   icon: BarChart2 },
            { key: "logic",         label: "논리 분석",   icon: GitBranch },
            { key: "concept",       label: "개념 요약",   icon: Network },
            { key: "understanding", label: "이해 요약",   icon: Lightbulb },
            { key: "critical",      label: "비판적 사고", icon: MessageSquare },
          ];
          const currentIdx = ctxSteps.findIndex(s => s.key === contextaStep);
          const activeIdx = currentIdx >= 0 ? currentIdx : 0;
          return (
            <div className="border border-[#5B5BD6] p-10 text-center space-y-8 mb-8">
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-[#5B5BD6] border-t-transparent animate-spin" />
                <p className="font-bold text-lg">자료를 분석하고 있습니다</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl mx-auto">
                {ctxSteps.map((s, i) => {
                  const Icon = s.icon;
                  const done = i < activeIdx;
                  const active = i === activeIdx;
                  return (
                    <div key={s.key} className="flex items-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                          done ? "bg-[#5B5BD6] border-[#5B5BD6] text-white" :
                          active ? "bg-[#5B5BD6]/10 border-[#5B5BD6] text-[#5B5BD6] animate-pulse" :
                          "bg-white border-gray-200 text-gray-300"
                        }`}>
                          {done ? <CheckCircle2 size={15} /> : <Icon size={15} />}
                        </div>
                        <span className={`text-xs font-semibold whitespace-nowrap ${
                          active ? "text-[#5B5BD6]" : done ? "text-black/70" : "text-gray-300"
                        }`}>{s.label}</span>
                      </div>
                      {i < ctxSteps.length - 1 && (
                        <div className={`w-8 h-0.5 mx-1 mb-5 ${i < activeIdx ? "bg-[#5B5BD6]" : "bg-gray-200"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-black/40">6개 분석 + 학습구조 병렬 진행 중 · 약 15~25초 소요</p>
            </div>
          );
        })()}

        {/* 자료 분석 오류 */}
        {contextaStatus === "error" && !isContextaAnalyzing && (
          <div className="border border-red-600 p-6 space-y-4 mb-8">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="font-bold text-red-600">자료 분석 중 오류가 발생했습니다.</p>
            </div>
            <button
              onClick={() => contextaRunMutation.mutate({ documentId: docId })}
              disabled={contextaRunMutation.isPending}
              className="flex items-center gap-2 bg-red-600 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 hover:bg-red-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 자료 분석 재시도
            </button>
          </div>
        )}

        {/* 자료 분석 결과 패널 */}
        {contextaDone && contextaAnalysis && (
          <ContextaResultPanel
            analysis={contextaAnalysis}
            structureAnalysisDone={doc.analysisStatus === "done"}
            isStructureAnalyzing={isAnalyzing}
            structure={structure}
            onRerunContexta={() => { contextaRunMutation.mutate({ documentId: docId }); analyzeMutation.mutate({ documentId: docId }); }}
            onSetStructure={(type) => setStructureMutation.mutate({ documentId: docId, structure: type })}
            isSettingStructure={setStructureMutation.isPending}
            structureLocked={(doc as any).structureLocked === 1}
          />
        )}

        {/* ══ STAGE 2: 학습 구조 분석 (QLOOP) — contextaDone 이후에만 표시 ══ */}
        {(contextaDone || contextaStatus === "skipped") && <>

        {/* 분석 중 - 단계별 진행 표시 */}
        {isAnalyzing && (() => {
          const step = (doc as any)?.analysisStep as string | undefined;
          type StepInfo = { key: string; label: string; desc: string };
          const steps: StepInfo[] = [
            { key: "uploading", label: "업로드 완료", desc: "파일이 서버에 저장되었습니다" },
            { key: "extracting", label: "파일 접근 중", desc: "AI가 파일을 읽고 있습니다" },
            { key: "structuring", label: "AI 학습구조분석 중", desc: "목차 트리, 개념 맵, 학습 경로를 추출하고 있습니다" },
            { key: "done", label: "분석 완료", desc: "모든 구조 추출이 완료되었습니다" },
          ];
          const currentIdx = steps.findIndex(s => s.key === step);
          const activeIdx = currentIdx >= 0 ? currentIdx : 1;
          return (
            <div className="border border-black p-12 text-center space-y-6">
              <div className="w-8 h-8 border-2 border-black border-t-transparent animate-spin mx-auto" />
              <p className="font-bold text-lg">AI가 문서를 분석하고 있습니다</p>
              <div className="flex items-center justify-center gap-0 max-w-2xl mx-auto">
                {steps.map((s, i) => (
                  <div key={s.key} className="flex items-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                        i < activeIdx ? "bg-black border-black text-white" :
                        i === activeIdx ? "bg-red-600 border-red-600 text-white animate-pulse" :
                        "bg-white border-gray-300 text-gray-400"
                      }`}>
                        {i < activeIdx ? "✓" : i + 1}
                      </div>
                      <span className={`text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                        i === activeIdx ? "text-red-600" : i < activeIdx ? "text-black" : "text-gray-400"
                      }`}>{s.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`w-12 h-0.5 mx-1 mb-5 ${i < activeIdx ? "bg-black" : "bg-gray-200"}`} />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm text-black/60">{steps[activeIdx]?.desc}</p>
            </div>
          );
        })()}

        {/* 분석 오류 */}
        {doc.analysisStatus === "error" && !isAnalyzing && (
          <div className="border border-red-600 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-red-600">분석 중 오류가 발생했습니다.</p>
                <p className="text-sm text-black/60">아래 안내를 확인하고 분석 재시도해 주세요.</p>
              </div>
            </div>
            {(doc as any).analysisError && (
              <div className="bg-red-50 border border-red-300 p-3 rounded">
                <p className="text-xs font-bold text-red-700 mb-1">오류 상세:</p>
                <p className="text-xs text-red-600 font-mono break-all">{(doc as any).analysisError}</p>
              </div>
            )}
            <div className="bg-red-50 border border-red-200 p-4 rounded space-y-2 text-sm">
              <p className="font-bold text-red-700">파일 크기 또는 형식 문제일 수 있습니다:</p>
              <ul className="space-y-1 text-red-600">
                <li>• <strong>Word (.docx)</strong>: 문서 내 이미지를 압축하세요. [구성요소] → [그림 압축]</li>
                <li>• <strong>PPT (.pptx)</strong>: 슬라이드 이미지를 150dpi 이하로 줄이세요.</li>
                <li>• <strong>PDF</strong>: 스캔 PDF는 텍스트 추출이 안 될 수 있습니다. 원본 파일로 저장하세요.</li>
                <li>• 파일 크기가 <strong>20MB</strong>를 초과하지 않는지 확인하세요.</li>
              </ul>
            </div>
            <button
              onClick={() => analyzeMutation.mutate({ documentId: docId })}
              disabled={analyzeMutation.isPending}
              className="flex items-center gap-2 bg-red-600 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              분석 재시도
            </button>
          </div>
        )}

        {/* 구조 선택 화면 - 분석 완료 후 구조 미선택 시: 미리보기 + 확정 2단계 */}
        {doc.analysisStatus === "done" && structure && !isAnalyzing && (doc as any).structureLocked !== 1 && (() => {
          type StructureKey = "tree" | "conceptMap" | "learningPath";
          const structures: Array<{
            key: StructureKey;
            label: string;
            shortLabel: string;
            desc: string;
            stat: string;
            available: boolean;
          }> = [
            {
              key: "tree",
              label: "목차 트리",
              shortLabel: "트리",
              desc: "체계적인 챕터와 토픽 구조로 순서대로 학습. 대부분의 학습자에게 가장 적합합니다.",
              stat: `${structure.chapters.length}개 챕터 · ${structure.chapters.reduce((a,c)=>a+c.topics.length,0)}개 토픽`,
              available: true,
            },
            {
              key: "conceptMap",
              label: "개념 맵",
              shortLabel: "맵",
              desc: "개념 간 연결 관계를 시각적으로 학습. 전체 연관성을 파악하고 싶을 때 적합합니다.",
              stat: `${structure.conceptMap?.length ?? 0}개 개념 노드`,
              available: !!(structure.conceptMap && structure.conceptMap.length > 0),
            },
            {
              key: "learningPath",
              label: "학습 경로",
              shortLabel: "경로",
              desc: "AI가 추천하는 단계별 학습 순서. 처음 학습하는 분야에 적합합니다.",
              stat: `${structure.learningPath?.length ?? 0}단계`,
              available: !!(structure.learningPath && structure.learningPath.length > 0),
            },
          ];

          return (
            <div className="space-y-0 border-2 border-red-600">
              <div className="px-8 py-5 border-b-2 border-red-600 flex items-center gap-4">
                <div className="w-4 h-4 bg-red-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-black text-lg uppercase tracking-widest">학습 구조 선택</p>
                  <p className="text-sm text-black/50 mt-0.5">각 구조를 클릭해 미리본 후, 원하는 구조를 최종 확정하세요.</p>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x-2 divide-black/10">
                {structures.map((s) => {
                  const isSelected = previewStructure === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => s.available && setPreviewStructure(isSelected ? null : s.key)}
                      disabled={!s.available}
                      className={`p-6 text-left transition-all ${
                        !s.available
                          ? "opacity-40 cursor-not-allowed bg-white"
                          : isSelected
                          ? "bg-black text-white"
                          : "bg-white hover:bg-black/5"
                      }`}
                    >
                      <div className={`text-2xl font-black mb-2 ${isSelected ? "text-white" : "text-black"}`}>{s.shortLabel}</div>
                      <div className={`text-sm font-bold uppercase tracking-widest mb-2 ${isSelected ? "text-white" : "text-black"}`}>{s.label}</div>
                      <div className={`text-xs leading-relaxed mb-3 ${isSelected ? "text-white/70" : "text-black/50"}`}>{s.desc}</div>
                      <div className={`text-xs font-bold ${isSelected ? "text-red-300" : "text-red-600"}`}>{s.stat}</div>
                      {isSelected && (
                        <div className="mt-3 text-xs font-bold uppercase tracking-widest text-white/60 flex items-center gap-1">
                          <span className="w-2 h-2 bg-red-400 inline-block" /> 미리보기 중
                        </div>
                      )}
                      {!s.available && <div className="mt-3 text-xs text-black/30">데이터 없음</div>}
                    </button>
                  );
                })}
              </div>
              {previewStructure && (
                <div className="border-t-2 border-black/10">
                  <div className="px-8 py-4 bg-black/[0.03] border-b border-black/10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-black/40">미리보기</span>
                      <span className="text-sm font-black uppercase tracking-widest">
                        {structures.find(s => s.key === previewStructure)?.label}
                      </span>
                    </div>
                    <button
                      onClick={() => setStructureMutation.mutate({ documentId: docId, structure: previewStructure })}
                      disabled={setStructureMutation.isPending}
                      className="flex items-center gap-2 bg-red-600 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {setStructureMutation.isPending ? (
                        <><span className="w-3 h-3 border border-white border-t-transparent animate-spin rounded-full" /> 확정 중…</>
                      ) : (
                        <>이 구조로 학습하기 →</>
                      )}
                    </button>
                  </div>
                  <div className="px-8 py-6 max-h-[60vh] overflow-y-auto">
                    {previewStructure === "tree" && (
                      <TreeView structure={structure} onSelectTopic={() => {}} topicProgress={{}} previewOnly={true} />
                    )}
                    {previewStructure === "conceptMap" && (
                      <ConceptMapView
                        nodes={structure.conceptMap ?? []}
                        structure={structure}
                        onSelectTopic={() => {}}
                        onStartFromNode={() => {}}
                        topicProgress={{}}
                        previewOnly={true}
                      />
                    )}
                    {previewStructure === "learningPath" && (
                      <LearningPathView
                        steps={structure.learningPath ?? []}
                        onStartStep={() => {}}
                        topicProgress={{}}
                        previewOnly={true}
                      />
                    )}
                  </div>
                </div>
              )}
              {!previewStructure && (
                <div className="px-8 py-10 text-center border-t-2 border-black/10">
                  <p className="text-sm text-black/40">위 카드를 클릭하면 해당 구조의 전체 내용을 미리볼 수 있습니다.</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* 분석 완료 - 구조 선택 후 */}
        {doc.analysisStatus === "done" && structure && !isAnalyzing && (doc as any).structureLocked === 1 && (
          <div className="space-y-6">
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
            <div>
              {(doc as any).selectedStructure === "tree" && <TreeView structure={structure} onSelectTopic={handleSelectTopic} topicProgress={topicProgress} />}
              {(doc as any).selectedStructure === "conceptMap" && <ConceptMapView nodes={structure.conceptMap ?? []} structure={structure} onSelectTopic={handleSelectTopic} onStartFromNode={handleStartFromNode} topicProgress={topicProgress} />}
              {(doc as any).selectedStructure === "learningPath" && <LearningPathView steps={structure.learningPath ?? []} onStartStep={handleStartPathStep} topicProgress={topicProgress} />}
            </div>
          </div>
        )}

        </>}
      </main>

      {/* 평가 선택 모달 */}
      <Dialog open={showEvalModal} onOpenChange={(open) => { if (!open) { setShowEvalModal(false); setPendingTopic(null); } }}>
        <DialogContent className="max-w-lg border-2 border-black rounded-none p-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="px-6 py-4 border-b border-black shrink-0">
            <DialogTitle className="text-sm font-black uppercase tracking-widest">평가 설정</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            {/* 구조 미리보기 */}
            {pendingTopic && (
              <div className="border border-black/10 bg-black/[0.02] px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-black/40 font-bold uppercase tracking-widest">학습 구조 미리보기</p>
                  {(doc as any)?.selectedStructure && (
                    <span className="text-xs font-bold px-2 py-0.5 bg-black text-white">
                      {(doc as any).selectedStructure === 'tree' ? '목차 트리' : (doc as any).selectedStructure === 'conceptMap' ? '개념 맵' : '학습 경로'}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold">{pendingTopic.title}</p>
                {pendingTopic.description && (
                  <p className="text-xs text-black/50 leading-relaxed">{pendingTopic.description}</p>
                )}
                {/* 구조별 요약 정보 */}
                {structure && (doc as any)?.selectedStructure === 'tree' && structure.chapters && (
                  <p className="text-xs text-black/30">전체 {structure.chapters.length}개 챕터 · {structure.chapters.reduce((a: number, c: any) => a + (c.topics?.length ?? 0), 0)}개 토픽</p>
                )}
                {structure && (doc as any)?.selectedStructure === 'conceptMap' && structure.conceptMap && (
                  <p className="text-xs text-black/30">전체 {structure.conceptMap.length}개 개념 노드</p>
                )}
                {structure && (doc as any)?.selectedStructure === 'learningPath' && structure.learningPath && (
                  <p className="text-xs text-black/30">전체 {structure.learningPath.length}단계</p>
                )}
              </div>
            )}
            {/* 학습자 레벨 선택 */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-black/50 mb-3">학습자 레벨 선택 <span className="text-red-600">*필수</span></p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "student", label: "Student", age: "13세 이하", desc: "쉬운 말과 친근한 예시로 설명해요" },
                  { key: "college", label: "College", age: "14–18세", desc: "표준 학습 수준의 질문과 설명" },
                  { key: "general", label: "General", age: "19세 이상", desc: "전문 용어와 심화 분석 포함" },
                ] as const).map(({ key, label, age, desc }) => (
                  <button
                    key={key}
                    onClick={() => setLearnerLevel(key)}
                    className={`border-2 p-3 text-left transition-colors ${
                      learnerLevel === key ? "border-[#5B5BD6] bg-[#5B5BD6] text-white" : "border-black/20 hover:border-[#5B5BD6]/50"
                    }`}
                  >
                    <div className={`text-sm font-black mb-0.5 ${learnerLevel === key ? "" : "text-black"}`}>{label}</div>
                    <div className={`text-[10px] font-bold mb-1 ${learnerLevel === key ? "opacity-80" : "text-[#5B5BD6]"}`}>{age}</div>
                    <div className={`text-[10px] leading-tight ${learnerLevel === key ? "opacity-70" : "text-black/40"}`}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* QLoop 모델 선택 */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-black/50 mb-3">QLoop 모델 선택 <span className="text-red-600">*필수</span></p>
              <div className="space-y-2">
                {/* Core QLoop */}
                <button
                  onClick={() => setQloopModel("core")}
                  className={`w-full border-2 p-3 text-left transition-colors ${
                    qloopModel === "core" ? "border-black bg-black text-white" : "border-black/20 hover:border-black"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${qloopModel === "core" ? "border-white" : "border-black/30"}`}>
                      {qloopModel === "core" && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-black">Core QLoop</div>
                      <div className={`text-xs mt-0.5 ${qloopModel === "core" ? "opacity-70" : "text-black/40"}`}>업로드한 학습자료 또는 학습그룹만으로 학습합니다</div>
                    </div>
                  </div>
                </button>
                {/* Curated QLoop */}
                <button
                  onClick={() => setQloopModel("curated")}
                  className={`w-full border-2 p-3 text-left transition-colors ${
                    qloopModel === "curated" ? "border-red-600 bg-red-600 text-white" : "border-black/20 hover:border-red-400"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${qloopModel === "curated" ? "border-white" : "border-black/30"}`}>
                      {qloopModel === "curated" && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-black">Curated QLoop</div>
                      <div className={`text-xs mt-0.5 ${qloopModel === "curated" ? "opacity-70" : "text-black/40"}`}>
                        Core QLoop + 내 Knowledge Library 자료 자동 참조
                        {myLibraryItems.length > 0 && <span className={`ml-1 font-bold ${qloopModel === "curated" ? "opacity-90" : "text-red-600"}`}>({myLibraryItems.length}개 등록됨)</span>}
                      </div>
                    </div>
                  </div>
                </button>
                {/* Open QLoop */}
                <button
                  onClick={() => setQloopModel("open")}
                  className={`w-full border-2 p-3 text-left transition-colors ${
                    qloopModel === "open" ? "border-blue-600 bg-blue-600 text-white" : "border-black/20 hover:border-blue-400"
                  }`}
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
