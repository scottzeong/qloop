import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [loading, isAuthenticated, navigate]);

  return (
    <div className="bg-white flex flex-col" style={{ minHeight: "864px" }}>
      {/* Header */}
      <header className="border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-2xl font-black tracking-tight">QLOOP</span>
          </div>
          <nav className="flex items-center gap-8">
            {!loading && !isAuthenticated && (
              <a
                href={getLoginUrl()}
                className="bg-black text-white px-5 py-2 text-sm font-bold tracking-wide hover:bg-[var(--swiss-red)] transition-colors"
              >
                Log in
              </a>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-8 pt-24 pb-20 grid grid-cols-12 gap-0">
          {/* Left column — large number */}
          <div className="col-span-2 flex flex-col justify-start pt-2">
            <div className="swiss-rule-red mb-4" style={{ width: "2rem" }} />
            <span className="text-[6rem] font-black leading-none text-black opacity-10 select-none">Q</span>
          </div>

          {/* Center column — headline */}
          <div className="col-span-10 pr-16">
            <div className="swiss-label mb-6">NEURAL TUTORING SYSTEM</div>
            <h1 className="text-4xl font-black leading-[1.1] tracking-tight mb-8">
              학습자료를 올리면<br />
              <span style={{ color: "var(--swiss-red)" }}>Neural Tutor가 질문합니다</span>
            </h1>
            <div className="swiss-rule mb-8" />
            <p className="text-lg text-gray-600 leading-relaxed max-w-xl mb-12">
              학습자료를 업로드하면 내용을 분석하여 다양한 구조를 보여줍니다. 학습자는 원하는 형태의 구조를 선택하여 문답으로 깊이 있고 효과적인 학습을 할 수 있습니다.
            </p>
            <div className="flex items-center gap-6">
              <a
                href={getLoginUrl()}
                className="bg-black text-white px-8 py-4 text-sm font-bold tracking-widest uppercase hover:bg-[var(--swiss-red)] transition-colors"
              >
                학습 시작
              </a>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 swiss-red-bg" />
                <span className="text-sm text-gray-500">무료로 사용 가능</span>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom rule */}
        <div className="max-w-7xl mx-auto px-8">
          <div className="swiss-rule" />
        </div>

        {/* Process section */}
        <section className="max-w-7xl mx-auto px-8 py-8">
          <div className="grid grid-cols-4 gap-0">
            {[
              { step: "01", title: "자료 업로드", desc: "학습할 자료를 드래그 앤 드롭으로 업로드합니다." },
              { step: "02", title: "구조 탐색", desc: "AI가 분석한 계층적 목차를 확인하고 시작 토픽을 선택합니다." },
              { step: "03", title: "문답 학습", desc: "AI의 질문에 답하며 토픽을 완전히 이해해 나갑니다." },
              { step: "04", title: "진도 리포트", desc: "학습 완료 후 요약과 진도 리포트를 확인합니다." },
            ].map((p, i) => (
              <div key={p.step} className={`p-5 ${i < 3 ? "border-r border-black" : ""}`}>
                <div className="text-3xl font-black text-gray-100 mb-2">{p.step}</div>
                <div className="swiss-rule-red mb-3" style={{ width: "1.5rem" }} />
                <h3 className="text-sm font-bold mb-1">{p.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-black">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-xl font-black tracking-tight">QLOOP</span>
          </div>
          <span className="swiss-label">Neural Campus</span>
        </div>
      </footer>
    </div>
  );
}
