import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Send, ArrowLeft, CheckCircle, HelpCircle, MessageSquare, BookOpen } from "lucide-react";
import { Streamdown } from "streamdown";

type MessageType = "question" | "answer" | "feedback" | "user_question" | "ai_answer" | "system";

interface Message {
  id: number;
  role: "ai" | "user";
  messageType: MessageType;
  content: string;
  topicId?: string | null;
  topicTitle?: string | null;
  questionIndex?: number | null;
  questionTypeName?: string | null;
  socraticQuestionId?: number | null;
  createdAt: Date;
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  definition: "정의",
  clarification: "명료화",
  justification: "근거",
  assumption: "전제",
  counterexample: "반례",
  consistency: "일관성",
  perspective: "관점",
  implication: "함의",
  value: "가치",
  synthesis: "종합",
  application: "적용",
  reflection: "성찰",
};

function MessageBubble({ msg, questionNumber }: { msg: Message & { questionTypeName?: string | null }; questionNumber?: number }) {
  const isAI = msg.role === "ai";
  const isQuestion = msg.messageType === "question";
  const isUserQuestion = msg.messageType === "user_question";
  const questionTypeLabel = msg.questionTypeName ? (QUESTION_TYPE_LABELS[msg.questionTypeName] ?? msg.questionTypeName) : null;

  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"} mb-6`}>
      <div className={`max-w-[75%] ${isAI ? "" : "order-2"}`}>
        {/* Role label */}
        <div className={`flex items-center gap-2 mb-2 ${isAI ? "" : "justify-end"}`}>
          {isAI ? (
            <>
              <div className="w-3 h-3 swiss-red-bg flex-shrink-0" />
              <span className="swiss-label">
                {isQuestion ? "Neural Tutor 질문" : "Neural Tutor"}
                {questionNumber ? ` #${questionNumber}` : ""}
              </span>
              {isQuestion && questionTypeLabel && (
                <span className="text-xs px-2 py-0.5 border border-gray-300 text-gray-500 font-medium">
                  [{questionTypeLabel}]
                </span>
              )}
            </>
          ) : (
            <>
              <span className="swiss-label">{isUserQuestion ? "역질문" : "내 답변"}</span>
              <div className="w-3 h-3 bg-black flex-shrink-0" />
            </>
          )}
        </div>

        {/* Message content */}
        <div
          className={`p-5 ${
            isAI
              ? isQuestion
                ? "border-2 border-black bg-white"
                : "border border-gray-200 bg-gray-50"
              : isUserQuestion
              ? "border-2 border-black bg-black text-white"
              : "border border-black bg-white"
          }`}
        >
          {isAI ? (
            <div className="text-sm leading-relaxed prose-swiss">
              <Streamdown>{msg.content}</Streamdown>
            </div>
          ) : (
            <p className="text-sm leading-relaxed">{msg.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LearningSession() {
  const { id } = useParams<{ id: string }>();
  const sessionId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [input, setInput] = useState("");
  const [isUserQuestion, setIsUserQuestion] = useState(false);
  const [sending, setSending] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [currentModel, setCurrentModel] = useState<"core" | "curated" | "open">("core");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: session, refetch: refetchSession } = trpc.session.get.useQuery(
    { sessionId },
    { enabled: isAuthenticated && !!sessionId }
  );

  const { data: messages, refetch: refetchMessages } = trpc.session.getMessages.useQuery(
    { sessionId },
    { enabled: isAuthenticated && !!sessionId }
  );

  const { data: doc } = trpc.document.get.useQuery(
    { documentId: session?.documentId ?? 0 },
    { enabled: !!session?.documentId }
  );

  const sendMessage = trpc.session.sendMessage.useMutation();
  const updateModel = trpc.session.updateModel.useMutation();
  const completeSession = trpc.session.complete.useMutation();
  const completeModule = trpc.socratic.completeModule.useMutation();

  // AI Tutor 질문 메시지에 순차 번호 부여
  const numberedMessages = useMemo(() => {
    if (!messages) return [];
    let count = 0;
    return messages.map((msg) => {
      const typedMsg = msg as Message;
      if (typedMsg.role === "ai" && typedMsg.messageType === "question") {
        count += 1;
        return { ...typedMsg, _questionNumber: count };
      }
      return { ...typedMsg, _questionNumber: undefined };
    });
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  // 세션 로드 시 현재 QLoop 모델 초기화
  useEffect(() => {
    if (!session) return;
    const openQloopMode = (session as any).openQloopMode;
    if (openQloopMode === 1) setCurrentModel("open");
    // curated는 openQloopMode=0이지만 libraryContextIds가 있는 경우 (현재는 openQloopMode로만 구분)
    // 기본값은 core
  }, [session]);

  // AI 메시지 수신 후 입력창 자동 포커스
  useEffect(() => {
    if (!messages || messages.length === 0 || sending) return;
    const lastMsg = messages[messages.length - 1] as Message;
    if (lastMsg.role === "ai") {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
    }
  }, [messages, sending]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    try {
      const result = await sendMessage.mutateAsync({
        sessionId,
        content,
        isUserQuestion,
      });

      await refetchMessages();
      await refetchSession();

      if (result.isTopicComplete) {
        toast.success("토픽 학습 완료!", { duration: 3000 });
      }

      setIsUserQuestion(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "메시지 전송 실패";
      toast.error(msg);
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleComplete = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      // 1단계: 세션 완료 처리 (요약 생성)
      const { summary } = await completeSession.mutateAsync({ sessionId });
      // 2단계: Socratic 모듈 평가 및 QLOOP Profile 자동 업데이트
      try {
        await completeModule.mutateAsync({
          sessionId,
          moduleTitle: session?.startTopicTitle ?? undefined,
        });
        toast.success("학습 세션 완료! QLOOP Profile이 업데이트되었습니다.", { duration: 4000 });
      } catch (moduleErr: unknown) {
        const errMsg = moduleErr instanceof Error ? moduleErr.message : "";
        if (errMsg.includes("평가할 답변이 없습니다")) {
          // 질문 없이 종료한 경우 — 정상 케이스
          toast.success("학습 세션이 완료되었습니다.");
        } else {
          // 실제 오류 — 세션은 종료됐지만 프로필 업데이트 실패
          toast.success("학습 세션이 완료되었습니다.");
          toast.error("QLOOP Profile 업데이트에 실패했습니다. 잠시 후 다시 시도해 주세요.", { duration: 5000 });
        }
      }
      await refetchSession();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "세션 종료 실패";
      toast.error(msg);
    } finally {
      setCompleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const completedTopics = Array.isArray(session?.completedTopics) ? session.completedTopics : [];
  const progress = session?.totalQuestions
    ? Math.round(((session.answeredQuestions ?? 0) / session.totalQuestions) * 100)
    : 0;
  const isCompleted = session?.status === "completed";

  if (!session) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 swiss-red-bg animate-pulse" />
          <span className="swiss-label">세션 로딩 중</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate((session as any).groupId ? `/groups/${(session as any).groupId}` : `/documents/${session.documentId}`)}
              className="flex items-center gap-2 swiss-label hover:text-black transition-colors"
            >
              <ArrowLeft size={12} /> {(session as any).groupId ? '그룹으로 돌아가기' : '문서로 돌아가기'}
            </button>
            <div className="w-px h-4 bg-black" />
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 swiss-red-bg flex-shrink-0" />
              <span className="text-sm font-bold truncate max-w-xs">{session.startTopicTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {/* Progress */}
            <div className="flex items-center gap-3">
              <div className="swiss-label">진도</div>
              <div className="w-24 bg-gray-100 h-1">
                <div
                  className="h-1 swiss-red-bg transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs font-bold">{progress}%</span>
            </div>
            {/* QLoop 모델 표시 + 변경 */}
            {!isCompleted && (
              <div className="relative">
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className={`px-3 py-1.5 text-xs font-bold border-2 flex items-center gap-1.5 transition-colors ${
                    currentModel === "open" ? "border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white" :
                    currentModel === "curated" ? "border-red-600 text-red-600 hover:bg-red-600 hover:text-white" :
                    "border-black text-black hover:bg-black hover:text-white"
                  }`}
                >
                  <span>{currentModel === "open" ? "Open" : currentModel === "curated" ? "Curated" : "Core"} QLoop</span>
                  <span className="opacity-60">▾</span>
                </button>
                {showModelPicker && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white border-2 border-black z-50 shadow-lg">
                    {(["core", "curated", "open"] as const).map((model) => {
                      const labels: Record<string, { name: string; desc: string }> = {
                        core: { name: "Core QLoop", desc: "학습자료만 참조" },
                        curated: { name: "Curated QLoop", desc: "자료 + Knowledge Library" },
                        open: { name: "Open QLoop", desc: "자료 + Library + 인터넷" },
                      };
                      const colors: Record<string, string> = {
                        core: "hover:bg-black hover:text-white",
                        curated: "hover:bg-red-600 hover:text-white",
                        open: "hover:bg-blue-600 hover:text-white",
                      };
                      return (
                        <button
                          key={model}
                          onClick={async () => {
                            setCurrentModel(model);
                            setShowModelPicker(false);
                            try {
                              await updateModel.mutateAsync({ sessionId, qloopModel: model });
                              if (model === "curated") {
                                toast.success("Curated QLoop로 변경되었습니다. 다음 질문부터 Knowledge Library가 참조됩니다.", { duration: 4000 });
                              } else if (model === "open") {
                                toast.success("Open QLoop로 변경되었습니다. 다음 질문부터 Knowledge Library와 인터넷 검색이 참조됩니다.", { duration: 4000 });
                              } else {
                                toast.success("Core QLoop로 변경되었습니다. 학습자료만 참조합니다.", { duration: 3000 });
                              }
                              refetchSession();
                            } catch (e) {
                              toast.error("모델 변경 실패");
                            }
                          }}
                          className={`w-full px-4 py-3 text-left border-b border-black/10 last:border-b-0 ${colors[model]} ${currentModel === model ? "bg-black/5 font-bold" : ""}`}
                        >
                          <div className="text-xs font-bold">{labels[model].name}</div>
                          <div className="text-[10px] opacity-60 mt-0.5">{labels[model].desc}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {!isCompleted && (
              <button
                onClick={handleComplete}
                disabled={completing}
                className="border border-black px-4 py-2 text-xs font-bold hover:bg-black hover:text-white transition-colors disabled:opacity-50"
              >
                {completing ? "처리 중..." : "세션 종료"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Left sidebar - progress tracker */}
        <div className="w-64 flex-shrink-0 border-r border-black p-6 sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto">
          <div className="swiss-label mb-4">학습 진행 상황</div>

          {/* Session stats */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">총 질문</span>
              <span className="text-xs font-bold">{session.totalQuestions ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">답변 완료</span>
              <span className="text-xs font-bold">{session.answeredQuestions ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">완료 토픽</span>
              <span className="text-xs font-bold" style={{ color: "var(--swiss-red)" }}>
                {completedTopics.length}
              </span>
            </div>
          </div>

          <div className="swiss-rule mb-6" />

          {/* Current topic */}
          <div className="mb-6">
            <div className="swiss-label mb-2">현재 토픽</div>
            <div className="border-l-2 pl-3" style={{ borderColor: "var(--swiss-red)" }}>
              <p className="text-xs font-bold">{session.startTopicTitle}</p>
              <p className="text-xs text-gray-400 mt-1">
                {isCompleted ? "완료" : "학습 중"}
              </p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 ${isCompleted ? "swiss-red-bg" : "bg-yellow-400"}`} />
            <span className="swiss-label">{isCompleted ? "완료" : "진행 중"}</span>
          </div>

          {/* Summary if completed */}
          {isCompleted && session.summary && (
            <>
              <div className="swiss-rule my-4" />
              <div>
                <div className="swiss-label mb-2">학습 요약</div>
                <div className="text-xs text-gray-600 leading-relaxed max-h-72 overflow-y-auto">
                  <Streamdown>{session.summary}</Streamdown>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-8">
            {!messages || messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <BookOpen size={32} className="text-gray-200" />
                <p className="text-sm text-gray-400">메시지를 불러오는 중...</p>
              </div>
            ) : (
              <>
                {numberedMessages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} questionNumber={msg._questionNumber} />
                ))}
                {sending && (
                  <div className="flex justify-start mb-6">
                    <div className="border-2 border-black p-4 flex items-center gap-3">
                      <div className="w-2 h-2 swiss-red-bg animate-pulse" />
                      <span className="swiss-label">Tutor 생각중...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          {!isCompleted ? (
            <div className="border-t-2 border-black p-6">
              {/* Mode toggle */}
              <div className="flex items-center gap-4 mb-4">
                <button
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border transition-colors ${
                    !isUserQuestion
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:border-black"
                  }`}
                  onClick={() => setIsUserQuestion(false)}
                >
                  <MessageSquare size={12} /> 답변하기
                </button>
                <button
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border transition-colors ${
                    isUserQuestion
                      ? "border-2 text-white"
                      : "bg-white text-black border-gray-300 hover:border-black"
                  }`}
                  style={isUserQuestion ? { backgroundColor: "var(--swiss-red)", borderColor: "var(--swiss-red)" } : {}}
                  onClick={() => setIsUserQuestion(true)}
                >
                  <HelpCircle size={12} /> 역질문하기
                </button>
                <span className="text-xs text-gray-400 ml-2">
                  {isUserQuestion ? "AI에게 궁금한 점을 질문하세요" : "AI의 질문에 답변하세요"}
                </span>
              </div>

              {/* Textarea + Send */}
              <div className="flex gap-3">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isUserQuestion ? "AI에게 질문을 입력하세요..." : "답변을 입력하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"}
                  className="flex-1 border border-black p-4 text-sm resize-none focus:outline-none focus:border-2 min-h-[80px] max-h-[160px]"
                  style={isUserQuestion ? { borderColor: "var(--swiss-red)", borderWidth: "2px" } : {}}
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="flex-shrink-0 w-12 flex items-center justify-center disabled:opacity-30 transition-colors"
                  style={{ backgroundColor: isUserQuestion ? "var(--swiss-red)" : "black", color: "white" }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t-2 border-black p-6">
              <div className="flex items-center gap-4">
                <CheckCircle size={20} style={{ color: "var(--swiss-red)" }} />
                <div>
                  <p className="text-sm font-bold">학습 세션이 완료되었습니다.</p>
                  <p className="text-xs text-gray-500">왼쪽 패널에서 학습 요약을 확인하세요.</p>
                </div>
                <button
                  onClick={() => navigate((session as any).groupId ? `/groups/${(session as any).groupId}` : `/documents/${session.documentId}`)}
                  className="ml-auto bg-black text-white px-6 py-3 text-xs font-bold tracking-wide hover:bg-[var(--swiss-red)] transition-colors"
                >
                  {(session as any).groupId ? '그룹으로 돌아가기' : '다른 토픽 학습하기'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
