import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { ArrowRight, Upload, Layers, MessageSquare, BarChart2 } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [loading, isAuthenticated, navigate]);

  return (
    <div className="min-h-screen bg-[#F8F7F5] flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-[#E5E5E3] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <img src="/logo.png" alt="QLoop" className="h-7 w-auto" />
          {!loading && !isAuthenticated && (
            <a
              href={getLoginUrl()}
              className="flex items-center gap-1.5 text-sm font-semibold bg-[#0F0F0F] text-white px-4 py-2 rounded-lg hover:bg-[#262626] transition-colors"
            >
              로그인
            </a>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-[#E8E8FD] text-[#4343B0] text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-[#5B5BD6] rounded-full" />
            Neural Tutoring System
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-[#0F0F0F] leading-[1.1] mb-6 max-w-3xl mx-auto">
            학습자료를 올리면
            <br />
            <span className="text-[#5B5BD6]">AI가 질문합니다</span>
          </h1>

          <p className="text-lg text-[#737373] max-w-xl mx-auto mb-10 leading-relaxed">
            자료를 업로드하면 AI가 구조를 분석합니다. 원하는 형태를 선택하고 문답으로 깊이 있는 학습을 시작하세요.
          </p>

          <div className="flex items-center justify-center gap-4">
            <a
              href={getLoginUrl()}
              className="flex items-center gap-2 bg-[#0F0F0F] text-white px-6 py-3 rounded-lg font-semibold text-sm hover:bg-[#262626] transition-colors"
            >
              무료로 시작하기
              <ArrowRight size={15} />
            </a>
            <span className="text-xs text-[#A3A3A3] font-medium">신용카드 불필요</span>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-6">
          <div className="h-px bg-[#E5E5E3]" />
        </div>

        {/* 프로세스 */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <p className="text-center pm-label mb-12">학습 프로세스</p>
          <div className="grid grid-cols-4 gap-6">
            {[
              {
                icon: <Upload size={20} />,
                step: "01",
                title: "자료 업로드",
                desc: "PDF, Word, PPT 등 학습 자료를 드래그 앤 드롭으로 업로드합니다.",
              },
              {
                icon: <Layers size={20} />,
                step: "02",
                title: "구조 탐색",
                desc: "AI가 분석한 계층적 목차를 확인하고 시작 토픽을 선택합니다.",
              },
              {
                icon: <MessageSquare size={20} />,
                step: "03",
                title: "문답 학습",
                desc: "AI의 질문에 답하며 토픽을 완전히 이해해 나갑니다.",
              },
              {
                icon: <BarChart2 size={20} />,
                step: "04",
                title: "진도 리포트",
                desc: "학습 완료 후 요약과 진도 리포트를 확인합니다.",
              },
            ].map((p) => (
              <div
                key={p.step}
                className="bg-white border border-[#E5E5E3] rounded-xl p-6 hover:shadow-md hover:border-[#D4D4D2] transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-[#F0EFED] rounded-lg flex items-center justify-center text-[#525252]">
                    {p.icon}
                  </div>
                  <span className="text-2xl font-bold text-[#E5E5E3]">{p.step}</span>
                </div>
                <h3 className="text-sm font-semibold text-[#0F0F0F] mb-2">{p.title}</h3>
                <p className="text-xs text-[#737373] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E5E3] bg-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <img src="/logo.png" alt="QLoop" className="h-5 w-auto opacity-60" />
          <span className="text-xs text-[#A3A3A3]">Neural Campus</span>
        </div>
      </footer>
    </div>
  );
}
