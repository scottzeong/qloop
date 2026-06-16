import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Send, CheckCircle, HelpCircle, MessageSquare, BookOpen, ChevronDown } from "lucide-react";
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
    <div className={`flex ${isAI ? "justify-start" : "justify-end"} mb-5`}>
      <div className={`max-w-[78%] ${isAI ? "" : "order-2"}`}>
        {/* Role label */}
        <div className={`flex items-center gap-2 mb-1.5 ${isAI ? "" : "justify-end"}`}>
          {isAI ? (
            <>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--pm-indigo)" }} />
              <span className="pm-label">
                {isQuestion ? "Neural Tutor 질문" : "Neural Tutor"}
                {questionNumber ? ` #${questionNumber}` : ""}
              </span>
              {isQuestion && questionTypeLabel && (
                <span className="pm-badge pm-badge-indigo">{questionTypeLabel}</span>
              )}
            </>
          ) : (
            <>
              <span className="pm-label">{isUserQuestion ? "역질문" : "내 답변"}</span>
              <div className="w-2 h-2 rounded-full bg-[#0F0F0F] flex-shrink-0" />
            </>
          )}
        </div>

        {/* Message content */}
        <div
          className={`px-5 py-4 rounded-2xl shadow-sm ${
            isAI
              ? isQuestion
                ? "bg-white border-l-4 border-[#E5E5E3]"
                : "bg-[#F8F7F5] border border-[#E5E5E3]"
              : isUserQuestion
              ? "text-white"
              : "bg-[#0F0F0F] text-white"
          }`}
          style={isAI && isQuestion ? { borderLeftColor: "var(--pm-indigo)" } :
                 !isAI && isUserQuestion ? { backgroundColor: "var(--pm-indigo)" } : {}}
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

  useEffect(() => {
    if (!session) return;
    const openQloopMode = (session as any).openQloopMode;
    if (openQloopMode === 1) setCurrentModel("open");
  }, [session]);

  useEffect(() => {
    if (!messages || messages.length === 0 || sending) return;
    const lastMsg = messages[messages.length - 1] as Message;
    if (lastMsg.role === "ai") {
      setTimeout(() => { textareaRef.current?.focus(); }, 150);
    }
  }, [messages, sending]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    try {
      const result = await sendMessage.mutateAsync({ sessionId, content, isUserQuestion });
      await refetchMessages();
      await refetchSession();
      if (result.isTopicComplete) toast.success("토픽 학습 완료!", { duration: 3000 });
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
      await completeSession.mutateAsync({ sessionId });
      try {
        await completeModule.mutateAsync({ sessionId, moduleTitle: session?.startTopicTitle ?? undefined });
        toast.success("학습 세션 완료! QLOOP Profile이 업데이트되었습니다.", { duration: 4000 });
      } catch (moduleErr: unknown) {
        const errMsg = moduleErr instanceof Error ? moduleErr.message : "";
        if (errMsg.includes("평가할 답변이 없습니다")) {
          toast.success("학습 세션이 완료되었습니다.");
        } else {
          toast.success("학습 세션이 완료되었습니다.");
          toast.error("QLOOP Profile 업데이트에 실패했습니다.", { duration: 5000 });
        }
      }
      await refetchSession();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "세션 종료 실패");
    } finally {
      setCompleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const completedTopics = Array.isArray(session?.completedTopics) ? session.completedTopics : [];
  const MIN_QUESTIONS = 24;
  const progress = Math.min(Math.round(((session?.answeredQuestions ?? 0) / MIN_QUESTIONS) * 100), 100);
  const isCompleted = session?.status === "completed";

  const modelConfig = {
    core: { label: "Core QLoop", color: "#0F0F0F", borderClass: "border-[#0F0F0F]" },
    curated: { label: "Curated QLoop", color: "var(--pm-indigo)", borderClass: "" },
    open: { label: "Open QLoop", color: "#2563EB", borderClass: "border-blue-500" },
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-[#EDECEA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "var(--pm-indigo)" }} />
          <span className="pm-label">세션 로딩 중</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EDECEA] flex flex-col">
      <PageHeader
        title={session.startTopicTitle ?? ""}
        backTo={(session as any).groupId ? `/groups/${(session as any).groupId}` : `/documents/${session.documentId}`}
        backLabel={(session as any).groupId ? "그룹으로 돌아가기" : "문서로 돌아가기"}
      />

      {/* Session control bar */}
      <div className="sticky top-14 z-40 bg-white border-b border-[#E5E5E3]">
        <div className="max-w-7xl mx-auto px-6 h-10 flex items-center justify-between gap-4">
          {/* Progress */}
          <div className="flex items-center gap-2.5">
            <span className="pm-label">진도</span>
            <div className="w-24 bg-[#E5E5E3] h-1 rounded-full overflow-hidden">
              <div
                className="h-1 rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, backgroundColor: "var(--pm-indigo)" }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums" style={{ color: "var(--pm-indigo)" }}>{progress}%</span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {isCompleted && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "var(--pm-indigo-light)", color: "var(--pm-indigo)" }}>
                세션 완료
              </span>
            )}
            {/* QLoop 모델 선택 */}
            {!isCompleted && (
              <div className="relative">
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[#E5E5E3] bg-white hover:border-[#D4D4D2] transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: modelConfig[currentModel].color }} />
                  <span>{modelConfig[currentModel].label}</span>
                  <ChevronDown size={11} className="opacity-50" />
                </button>
                {showModelPicker && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl border border-[#E5E5E3] shadow-lg z-50 overflow-hidden">
                    {(["core", "curated", "open"] as const).map((model) => {
                      const descs: Record<string, string> = {
                        core: "학습자료만 참조",
                        curated: "자료 + Knowledge Library",
                        open: "자료 + Library + 인터넷",
                      };
                      return (
                        <button
                          key={model}
                          onClick={async () => {
                            setCurrentModel(model);
                            setShowModelPicker(false);
                            try {
                              await updateModel.mutateAsync({ sessionId, qloopModel: model });
                              toast.success(`${modelConfig[model].label}로 변경되었습니다.`, { duration: 3000 });
                              refetchSession();
                            } catch { toast.error("모델 변경 실패"); }
                          }}
                          className={`w-full px-4 py-2.5 text-left hover:bg-[#F8F7F5] transition-colors border-b border-[#F0EFED] last:border-b-0 ${currentModel === model ? "bg-[#F0EFED]" : ""}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: modelConfig[model].color }} />
                            <div>
                              <div className="text-xs font-semibold">{modelConfig[model].label}</div>
                              <div className="text-[10px] text-[#A3A3A3] mt-0.5">{descs[model]}</div>
                            </div>
                            {currentModel === model && <span className="ml-auto text-[10px] font-bold" style={{ color: "var(--pm-indigo)" }}>현재</span>}
                          </div>
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
                className="px-3 py-1 text-xs font-semibold rounded-lg border border-[#E5E5E3] bg-white hover:bg-[#F8F7F5] transition-colors disabled:opacity-50"
              >
                {completing ? "처리 중..." : "세션 종료"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Sidebar */}
        <div className="w-60 flex-shrink-0 bg-white border-r border-[#E5E5E3] p-5 sticky top-[96px] h-[calc(100vh-96px)] overflow-y-auto">
          <p className="pm-label mb-4">학습 진행 상황</p>

          <div className="space-y-2.5 mb-5">
            {[
              { label: "총 질문", value: session.totalQuestions ?? 0 },
              { label: "답변 완료", value: session.answeredQuestions ?? 0 },
              { label: "완료 토픽", value: completedTopics.length, accent: true },
            ].map(({ label, value, accent }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-xs text-[#737373]">{label}</span>
                <span className="text-xs font-bold" style={accent ? { color: "var(--pm-indigo)" } : {}}>{value}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-[#E5E5E3] mb-5" />

          {/* Current topic */}
          <div className="mb-5">
            <p className="pm-label mb-2">현재 토픽</p>
            <div className="bg-[#F8F7F5] rounded-xl p-3 border-l-3" style={{ borderLeft: "3px solid var(--pm-indigo)" }}>
              <p className="text-xs font-semibold">{session.startTopicTitle}</p>
              <p className="text-[10px] text-[#A3A3A3] mt-1">{isCompleted ? "완료" : "학습 중"}</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isCompleted ? "" : "bg-amber-400"}`}
              style={isCompleted ? { backgroundColor: "var(--pm-indigo)" } : {}} />
            <span className="pm-label">{isCompleted ? "완료" : "진행 중"}</span>
          </div>

          {/* Summary */}
          {isCompleted && session.summary && (
            <>
              <div className="h-px bg-[#E5E5E3] my-4" />
              <div>
                <p className="pm-label mb-2">학습 요약</p>
                <div className="text-xs text-[#525252] leading-relaxed max-h-72 overflow-y-auto">
                  <Streamdown>{session.summary}</Streamdown>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-8 py-7">
            {!messages || messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <BookOpen size={32} className="text-[#D4D4D2]" />
                <p className="text-sm text-[#A3A3A3]">메시지를 불러오는 중...</p>
              </div>
            ) : (
              <>
                {numberedMessages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} questionNumber={msg._questionNumber} />
                ))}
                {sending && (
                  <div className="flex justify-start mb-5">
                    <div className="bg-white border border-[#E5E5E3] rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ backgroundColor: "var(--pm-indigo)", animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                      <span className="pm-label">Tutor 생각중...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          {!isCompleted ? (
            <div className="bg-white border-t border-[#E5E5E3] px-7 py-5">
              {/* Mode toggle - pill segment */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center bg-[#F0EFED] rounded-lg p-1 gap-0.5">
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      !isUserQuestion ? "bg-white shadow-sm text-[#0F0F0F]" : "text-[#737373] hover:text-[#0F0F0F]"
                    }`}
                    onClick={() => setIsUserQuestion(false)}
                  >
                    <MessageSquare size={11} /> 답변하기
                  </button>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      isUserQuestion ? "bg-white shadow-sm" : "text-[#737373] hover:text-[#0F0F0F]"
                    }`}
                    style={isUserQuestion ? { color: "var(--pm-indigo)" } : {}}
                    onClick={() => setIsUserQuestion(true)}
                  >
                    <HelpCircle size={11} /> 역질문하기
                  </button>
                </div>
                <span className="text-xs text-[#A3A3A3]">
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
                  placeholder={isUserQuestion ? "AI에게 질문을 입력하세요..." : "답변을 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"}
                  className="flex-1 border border-[#E5E5E3] rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors min-h-[80px] max-h-[160px] bg-[#F8F7F5]"
                  style={isUserQuestion ? { borderColor: "var(--pm-indigo)", boxShadow: "0 0 0 3px rgba(91,91,214,0.1)" } : { borderColor: "#E5E5E3" }}
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="flex-shrink-0 w-11 h-11 mt-auto flex items-center justify-center rounded-xl text-white transition-all disabled:opacity-30 hover:opacity-90"
                  style={{ backgroundColor: isUserQuestion ? "var(--pm-indigo)" : "#0F0F0F" }}
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border-t border-[#E5E5E3] px-7 py-5">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--pm-indigo-light)" }}>
                  <CheckCircle size={18} style={{ color: "var(--pm-indigo)" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold">학습 세션이 완료되었습니다.</p>
                  <p className="text-xs text-[#A3A3A3]">왼쪽 패널에서 학습 요약을 확인하세요.</p>
                </div>
                <button
                  onClick={() => navigate((session as any).groupId ? `/groups/${(session as any).groupId}` : `/documents/${session.documentId}`)}
                  className="ml-auto px-5 py-2.5 text-xs font-semibold rounded-lg text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: "var(--pm-indigo)" }}
                >
                  {(session as any).groupId ? "그룹으로 돌아가기" : "다른 토픽 학습하기"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
