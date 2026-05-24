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
} from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  /** 현재 페이지 제목 (로고 우측 브레드크럼에 표시) */
  title?: string;
  /** 뒤로가기 경로 (기본값: /dashboard) */
  backTo?: string;
  /** 뒤로가기 레이블 (기본값: 대시보드) */
  backLabel?: string;
  /** 헤더 우측에 추가할 커스텀 액션 영역 */
  actions?: ReactNode;
  /** sticky 여부 (기본값: true) */
  sticky?: boolean;
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

  const navItems = [
    { path: "/history", icon: <BarChart2 size={12} />, label: "LEARNING HISTORY" },
    { path: "/library", icon: <Library size={12} />, label: "KNOWLEDGE LIBRARY" },
    { path: "/ai-connection", icon: <Cpu size={12} />, label: "AI CONNECTION" },
    { path: "/profile/socratic", icon: <Brain size={12} />, label: "QLOOP PROFILE" },
  ];

  const adminNavItem = { path: "/admin/socratic", icon: <Settings size={12} />, label: "NEURAL SYSTEM SET" };

  const isActive = (path: string) => location === path || location.startsWith(path + "/");

  // 세부 페이지 여부: 대시보드가 아닌 네비게이션 메뉴 페이지 또는 title이 있는 페이지
  const isDashboard = location === "/dashboard";
  const isNavPage = navItems.some((item) => isActive(item.path)) || (user?.role === "admin" && isActive(adminNavItem.path));
  const isSubPage = !isDashboard && !isNavPage; // 세부 페이지 (title 있는 페이지)

  return (
    <header
      className={`border-b-2 border-black bg-white z-50 ${sticky ? "sticky top-0" : ""}`}
    >
      <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
        {/* 좌측: 로고 + 브레드크럼 */}
        <div className="flex items-center gap-4">
          {/* 로고 */}
          <div
            className="flex items-center cursor-pointer flex-shrink-0"
            onClick={() => navigate("/dashboard")}
          >
            <img
              src="/manus-storage/QLoop_n_14e252ea.png"
              alt="QLoop"
              className="h-16 w-auto"
            />
          </div>

          {/* 세부 페이지: DASHBOARD 뒤로가기 + 페이지명 */}
          {isSubPage && title && (
            <>
              <div className="w-px h-4 bg-black/20" />
              <button
                onClick={() => navigate(backTo)}
                className="flex items-center gap-1.5 swiss-label text-black/50 hover:text-black transition-colors"
              >
                <ArrowLeft size={11} />
                {backLabel === "대시보드" ? "DASHBOARD" : backLabel.toUpperCase()}
              </button>
              <div className="w-px h-4 bg-black/20" />
              <span className="text-sm font-bold truncate max-w-xs">{title}</span>
            </>
          )}

          {/* 네비게이션 메뉴 페이지: DASHBOARD 뒤로가기만 */}
          {isNavPage && (
            <>
              <div className="w-px h-4 bg-black/20" />
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-1.5 swiss-label text-black/50 hover:text-black transition-colors"
              >
                <ArrowLeft size={11} />
                DASHBOARD
              </button>
            </>
          )}
        </div>

        {/* 우측: 메뉴 + 사용자 정보 */}
        <div className="flex items-center gap-1">
          {/* 메인 네비게이션 메뉴 - 항상 표시 */}
          <nav className="flex items-center">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`swiss-label flex items-center gap-1.5 px-3 py-2 transition-colors relative ${
                  isActive(item.path)
                    ? "text-black after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-black"
                    : "text-black/50 hover:text-black"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            {user?.role === "admin" && (
              <button
                onClick={() => navigate(adminNavItem.path)}
                className={`swiss-label flex items-center gap-1.5 px-3 py-2 transition-colors relative ${
                  isActive(adminNavItem.path)
                    ? "text-red-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-red-600"
                    : "text-red-400 hover:text-red-600"
                }`}
              >
                {adminNavItem.icon}
                {adminNavItem.label}
              </button>
            )}
          </nav>

          {/* 커스텀 액션 영역 */}
          {actions && (
            <>
              <div className="w-px h-4 bg-black/20 mx-2" />
              {actions}
            </>
          )}

          {/* 사용자 정보 + 로그아웃 */}
          <div className="flex items-center gap-3 pl-4 ml-2 border-l border-black/20">
            <span className="text-xs font-bold text-black/70">{user?.name}</span>
            <button
              onClick={() => logout()}
              className="swiss-label text-black/40 hover:text-black transition-colors flex items-center gap-1"
            >
              <LogOut size={11} />
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
