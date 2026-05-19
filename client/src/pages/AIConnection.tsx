import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Cpu,
  Plus,
  Trash2,
  Star,
  StarOff,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  Zap,
  Shield,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const PROVIDER_INFO: Record<
  string,
  { name: string; color: string; bg: string; border: string; description: string; keyHint: string }
> = {
  openai: {
    name: "OpenAI",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    description: "GPT-5.5, GPT-5.4-mini 등 OpenAI의 최신 모델을 사용합니다.",
    keyHint: "sk-... 형태의 API Key",
  },
  gemini: {
    name: "Google Gemini",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    description: "Gemini 2.5 Pro, Flash 등 Google의 최신 모델을 사용합니다.",
    keyHint: "AIza... 형태의 API Key",
  },
  claude: {
    name: "Anthropic Claude",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    description: "Claude Opus 4.7, Sonnet 4.6 등 Anthropic의 최신 모델을 사용합니다.",
    keyHint: "sk-ant-... 형태의 API Key",
  },
};

export default function AIConnection() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // 폼 상태
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "gemini" | "claude">("openai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // tRPC
  const { data: connections = [], refetch } = trpc.aiConnection.list.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: providerModels = {} } = trpc.aiConnection.getProviderModels.useQuery(undefined, {
    enabled: !!user,
  });

  const saveMutation = trpc.aiConnection.save.useMutation({
    onSuccess: () => {
      toast.success("AI Connection이 저장되었습니다.");
      setApiKey("");
      setSelectedModel("");
      setSetAsDefault(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.aiConnection.delete.useMutation({
    onSuccess: () => {
      toast.success("AI Connection이 삭제되었습니다.");
      setDeleteTarget(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const setDefaultMutation = trpc.aiConnection.setDefault.useMutation({
    onSuccess: () => {
      toast.success("기본 AI Provider가 변경되었습니다.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const testMutation = trpc.aiConnection.test.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("연결 테스트 성공!");
      } else {
        toast.error(`연결 테스트 실패: ${data.errorMessage ?? "알 수 없는 오류"}`);
      }
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-bold mb-4">로그인이 필요합니다</p>
          <a href={getLoginUrl()} className="text-xs underline">
            로그인
          </a>
        </div>
      </div>
    );
  }

  const models = (providerModels as Record<string, string[]>)[selectedProvider] ?? [];

  const handleSave = () => {
    if (!apiKey.trim()) return toast.error("API Key를 입력해주세요.");
    if (!selectedModel) return toast.error("모델을 선택해주세요.");
    saveMutation.mutate({ providerName: selectedProvider, apiKey: apiKey.trim(), selectedModel, setAsDefault });
  };

  const providerInfo = PROVIDER_INFO[selectedProvider];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b-2 border-black bg-white z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-1 text-xs font-bold hover:text-black transition-colors"
            >
              <ArrowLeft size={14} />
              DASHBOARD
            </button>
            <div className="w-px h-4 bg-gray-300" />
            <div className="flex items-center gap-2">
              <Cpu size={16} />
              <span className="text-xs font-bold tracking-widest">AI CONNECTION</span>
            </div>
          </div>
          <span className="text-xs text-gray-500">{user.name}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-12">
        {/* 페이지 설명 */}
        <div className="mb-10">
          <h1 className="text-2xl font-black tracking-tight mb-2">AI Provider 연결</h1>
          <p className="text-sm text-gray-600 max-w-2xl">
            개인 AI Provider API Key를 등록하면 QLoop의 모든 학습 기능에서 해당 모델이 사용됩니다.
            API Key를 등록하지 않으면 QLoop 기본 AI가 사용됩니다.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Shield size={12} />
            <span>API Key는 암호화되어 안전하게 저장됩니다.</span>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-10">
          {/* Left: 등록 폼 */}
          <div className="col-span-5">
            <div className="border-2 border-black p-6">
              <div className="text-xs font-bold tracking-widest mb-6 flex items-center gap-2">
                <Plus size={12} />
                NEW CONNECTION
              </div>

              {/* Provider 선택 */}
              <div className="mb-5">
                <Label className="text-xs font-bold tracking-wider mb-2 block">AI PROVIDER</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["openai", "gemini", "claude"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setSelectedProvider(p);
                        setSelectedModel("");
                      }}
                      className={`border-2 p-2 text-xs font-bold transition-all ${
                        selectedProvider === p
                          ? "border-black bg-black text-white"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {PROVIDER_INFO[p].name.split(" ")[0]}
                    </button>
                  ))}
                </div>
                <p className={`mt-2 text-xs ${providerInfo.color}`}>{providerInfo.description}</p>
              </div>

              {/* 모델 선택 */}
              <div className="mb-5">
                <Label className="text-xs font-bold tracking-wider mb-2 block">MODEL</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="border-2 border-black rounded-none text-xs h-9">
                    <SelectValue placeholder="모델 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* API Key 입력 */}
              <div className="mb-5">
                <Label className="text-xs font-bold tracking-wider mb-2 block">API KEY</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={providerInfo.keyHint}
                    className="border-2 border-black rounded-none text-xs h-9 pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* 기본 Provider 설정 */}
              <div className="mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setAsDefault}
                    onChange={(e) => setSetAsDefault(e.target.checked)}
                    className="w-3 h-3"
                  />
                  <span className="text-xs font-bold">기본 AI Provider로 설정</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-5">
                  기본 Provider가 모든 학습 기능에 우선 적용됩니다.
                </p>
              </div>

              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="w-full bg-black text-white rounded-none text-xs font-bold h-9 hover:bg-gray-800"
              >
                {saveMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin mr-2" />
                ) : (
                  <Zap size={14} className="mr-2" />
                )}
                저장
              </Button>
            </div>
          </div>

          {/* Right: 등록된 Connection 목록 */}
          <div className="col-span-7">
            <div className="text-xs font-bold tracking-widest mb-4 flex items-center gap-2">
              <Cpu size={12} />
              REGISTERED CONNECTIONS
            </div>

            {connections.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 p-10 text-center">
                <Cpu size={24} className="mx-auto mb-3 text-gray-300" />
                <p className="text-xs text-gray-400 font-bold">등록된 AI Connection이 없습니다</p>
                <p className="text-xs text-gray-400 mt-1">
                  좌측 폼에서 API Key를 등록하면 QLoop 기본 AI 대신 사용됩니다.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map((conn) => {
                  const info = PROVIDER_INFO[conn.providerName] ?? PROVIDER_INFO.openai;
                  return (
                    <div
                      key={conn.id}
                      className={`border-2 p-4 ${conn.isDefault ? "border-black" : "border-gray-200"}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-black ${info.color}`}>{info.name}</span>
                            {conn.isDefault && (
                              <span className="text-xs font-bold bg-black text-white px-2 py-0.5">
                                DEFAULT
                              </span>
                            )}
                            {conn.connectionStatus === "connected" && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
                                <CheckCircle size={10} /> 연결됨
                              </span>
                            )}
                            {conn.connectionStatus === "failed" && (
                              <span className="flex items-center gap-1 text-xs text-red-600 font-bold">
                                <XCircle size={10} /> 오류
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 font-mono">{conn.apiKeyMasked}</p>
                          <p className="text-xs text-gray-600 mt-1">
                            모델: <span className="font-bold">{conn.selectedModel}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-3">
                          {/* 테스트 */}
                          <button
                            onClick={() => testMutation.mutate({ connectionId: conn.id })}
                            disabled={testMutation.isPending}
                            className="text-xs font-bold border border-gray-200 px-2 py-1 hover:border-black transition-colors"
                            title="연결 테스트"
                          >
                            {testMutation.isPending ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              "TEST"
                            )}
                          </button>
                          {/* 기본 설정 */}
                          {!conn.isDefault && (
                            <button
                              onClick={() => setDefaultMutation.mutate({ connectionId: conn.id })}
                              disabled={setDefaultMutation.isPending}
                              className="text-xs font-bold border border-gray-200 px-2 py-1 hover:border-black transition-colors"
                              title="기본 Provider로 설정"
                            >
                              <Star size={10} />
                            </button>
                          )}
                          {/* 삭제 */}
                          <button
                            onClick={() => setDeleteTarget(conn.id)}
                            className="text-xs font-bold border border-red-200 px-2 py-1 hover:border-red-500 text-red-500 transition-colors"
                            title="삭제"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 안내 */}
            <div className="mt-6 border border-gray-100 p-4 bg-gray-50">
              <p className="text-xs font-bold mb-2">AI Provider 우선순위</p>
              <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                <li>기본(DEFAULT)으로 설정된 개인 AI Provider</li>
                <li>등록된 다른 AI Provider (연결 상태 정상인 것)</li>
                <li>QLoop 기본 AI (API Key 미등록 시 자동 사용)</li>
              </ol>
            </div>
          </div>
        </div>
      </main>

      {/* 삭제 확인 AlertDialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AI Connection 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 AI Connection을 삭제하시겠습니까? 삭제 후에는 해당 Provider를 사용할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget !== null && deleteMutation.mutate({ connectionId: deleteTarget })}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
