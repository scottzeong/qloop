import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  BarChart2,
  Library,
  Cpu,
  Brain,
  Settings,
  LogOut,
  KeyRound,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { trpc } from "@/_core/trpc";
import { toast } from "sonner";

interface PageHeaderProps {
  title?: string;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  sticky?: boolean;
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const changePw = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("비밀번호가 변경되었습니다.");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (next.length < 8) {
      toast.error("새 비밀번호는 최소 8자 이상이어야 합니다.");
      return;
    }
    changePw.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#F0EFED]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--pm-indigo-light)" }}>
              <KeyRound size={15} style={{ color: "var(--pm-indigo)" }} />
            </div>
            <h2 className="text-sm font-semibold text-[#0F0F0F]">비밀번호 변경</h2>
          </div>
          <button onClick={onClose} className="text-[#A3A3A3] hover:text-[#0F0F0F] transition-colors p-1 rounded-md hover:bg-[#F8F7F5]">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Current Password */}
          <div className="flex flex-col gap-1.5">
            <label className="pm-label">현재 비밀번호</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="pm-input pr-9 w-full"
                placeholder="현재 비밀번호 입력"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-[#525252]"
              >
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="flex flex-col gap-1.5">
            <label className="pm-label">새 비밀번호</label>
            <div className="relative">
              <input
                type={showNext ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="pm-input pr-9 w-full"
                placeholder="8자 이상 입력"
                required
              />
              <button
                type="button"
                onClick={() => setShowNext((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-[#525252]"
              >
                {showNext ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col gap-1.5">
            <label className="pm-label">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="pm-input w-full"
              placeholder="동일한 비밀번호 재입력"
              required
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-[#E5E5E3] text-sm font-medium text-[#525252] hover:bg-[#F8F7F5] transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={changePw.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ backgroundColor: "var(--pm-indigo)" }}
            >
              {changePw.isPending ? "변경 중…" : "변경"}
            </button>
          </div>
   
        </form>
      </div>
    </div>
  );
}

export default function PageHeader({
  title,
  backTo = "/dashboard",
  backLabel = "대시보드",
  actions,
  sticky = true,
}: PageHeaderProps) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const [showPwModal, setShowPwModal] = useState(false);

  const navItems = [
    { path: "/history", icon: <BarChart2 size={13} />, label: "히스토리" },
    { path: "/library", icon: <Library size={13} />, label: "라이브러리" },
    { path: "/ai-connection", icon: <Cpu size={13} />, label: "AI 연결" },
    { path: "/profile/socratic", icon: <Brain size={13} />, label: "프로필" },
  ];

  const adminNavItem = {
    path: "/admin/socratic",
    icon: <Settings size={13} />,
    label: "시스템 설정",
  };

  const isActive = (path: string) =>
    location === path || location.startsWith(path + "/");

  const isDashboard = location === "/dashboard";
  const isAdminOrAbove =
    user?.role === "admin" || user?.role === "superadmin";
  // 대시보드만 nav 탭 표시; 나머지 모든 페이지는 breadcrumb 모드
  const isSubPage = !isDashboard;

  return (
    <>
      <header
        className={`bg-white/90 backdrop-blur-sm border-b border-[#E5E5E3] z-50 ${
          sticky ? "sticky top-0" : ""
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center cursor-pointer flex-shrink-0"
              onClick={() => navigate("/dashboard")}
            >
              <img src="/logo.png" alt="QLoop" className="h-7 w-auto" />
            </div>

            {isSubPage && title && (
              <>
                <span className="text-[#D4D4D2] text-sm">/</span>
                <button
                  onClick={() => navigate(backTo)}
                  className="flex items-center gap-1 text-xs text-[#A3A3A3] hover:text-[#0F0F0F] transition-colors font-medium"
                >
                  <ArrowLeft size={11} />
                  {backLabel === "대시보드" ? "대시보드" : backLabel}
                </button>
                <span className="text-[#D4D4D2] text-sm">/</span>
                <span className="text-sm font-semibold text-[#0F0F0F] truncate max-w-xs">
                  {title}
                </span>
              </>
            )}

          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* 메인/대시보드 페이지: 전체 nav 탭 표시 */}
            {!isSubPage && (
              <nav className="flex items-center">
                {navItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive(item.path)
                        ? "bg-[#F0EFED] text-[#0F0F0F]"
                        : "text-[#737373] hover:text-[#0F0F0F] hover:bg-[#F8F7F5]"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
                {isAdminOrAbove && (
                  <button
                    onClick={() => navigate(adminNavItem.path)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive(adminNavItem.path)
                        ? "bg-[#F0EFED] text-[#0F0F0F]"
                        : "text-[#737373] hover:text-[#0F0F0F] hover:bg-[#F8F7F5]"
                    }`}
                  >
                    {adminNavItem.icon}
                    {adminNavItem.label}
                  </button>
                )}
              </nav>
            )}

            {/* 세부 페이지: page-specific actions만 표시 */}
            {actions && (
              <>
                {!isSubPage && <div className="w-px h-4 bg-[#E5E5E3] mx-1" />}
                {actions}
              </>
            )}

            <div className="flex items-center gap-2 pl-3 ml-1 border-l border-[#E5E5E3]">
              <span className="text-xs font-semibold text-[#525252]">
                {user?.name}
              </span>
              <button
                onClick={() => setShowPwModal(true)}
                title="비밀번호 변경"
                className="flex items-center gap-1 text-xs text-[#A3A3A3] hover:text-[#0F0F0F] transition-colors px-2 py-1 rounded-md hover:bg-[#F8F7F5]"
              >
                <KeyRound size={11} />
              </button>
              <button
                onClick={async () => {
                  await logout();
                  window.location.href = "https://www.qloop.kr";
                }}
                className="flex items-center gap-1 text-xs text-[#A3A3A3] hover:text-[#0F0F0F] transition-colors px-2 py-1 rounded-md hover:bg-[#F8F7F5]"
              >
                <LogOut size={11} />
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </>
  );
}
