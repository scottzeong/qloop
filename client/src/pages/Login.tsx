import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";

type Mode = "login" | "register";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard");
  }, [loading, isAuthenticated, navigate]);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/dashboard");
    },
    onError: (e) => setError(e.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/dashboard");
    },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else {
      registerMutation.mutate({ email, password, name });
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen bg-[#F8F7F5] flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-[#E5E5E3]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <a href="/">
            <img src="/logo.png" alt="QLoop" className="h-7 w-auto" />
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-[#E5E5E3] rounded-2xl p-8 shadow-sm">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-[#0F0F0F] tracking-tight mb-1">
                {mode === "login" ? "다시 오신 것을 환영합니다" : "계정 만들기"}
              </h1>
              <p className="text-sm text-[#737373]">
                {mode === "login"
                  ? "이메일과 비밀번호로 로그인하세요"
                  : "무료로 시작하세요"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="block text-xs font-semibold text-[#525252] mb-1.5">
                    이름
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full border border-[#E5E5E3] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] bg-white outline-none focus:border-[#5B5BD6] focus:ring-2 focus:ring-[#5B5BD6]/10 transition-all placeholder:text-[#A3A3A3]"
                    placeholder="홍길동"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#525252] mb-1.5">
                  이메일
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-[#E5E5E3] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] bg-white outline-none focus:border-[#5B5BD6] focus:ring-2 focus:ring-[#5B5BD6]/10 transition-all placeholder:text-[#A3A3A3]"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#525252] mb-1.5">
                  비밀번호
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "register" ? 8 : 1}
                  className="w-full border border-[#E5E5E3] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] bg-white outline-none focus:border-[#5B5BD6] focus:ring-2 focus:ring-[#5B5BD6]/10 transition-all placeholder:text-[#A3A3A3]"
                  placeholder={mode === "register" ? "최소 8자" : "비밀번호"}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <p className="text-red-600 text-xs font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-[#0F0F0F] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#262626] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isPending
                  ? "처리 중..."
                  : mode === "login"
                  ? "로그인"
                  : "가입하기"}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-[#F0EFED] text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="text-xs text-[#737373] hover:text-[#0F0F0F] transition-colors"
              >
                {mode === "login"
                  ? "계정이 없으신가요? 회원가입"
                  : "이미 계정이 있으신가요? 로그인"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
