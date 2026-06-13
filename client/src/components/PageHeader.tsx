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
  title?: string;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
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
  const isNavPage =
    navItems.some((item) => isActive(item.path)) ||
    (isAdminOrAbove && isActive(adminNavItem.path));
  const isSubPage = !isDashboard && !isNavPage;

  return (
    <header
      className={`bg-white/90 backdrop-blur-sm border-b border-[#E5E5E3] z-50 ${
        sticky ? "sticky top-0" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* 좌측: 로고 + 브레드크럼 */}
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

          {isNavPage && (
            <>
              <span className="text-[#D4D4D2] text-sm">/</span>
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-1 text-xs text-[#A3A3A3] hover:text-[#0F0F0F] transition-colors font-medium"
              >
                <ArrowLeft size={11} />
                대시보드
              </button>
            </>
          )}
        </div>

        {/* 우측: 네비게이션 + 사용자 */}
        <div className="flex items-center gap-1 flex-shrink-0">
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

          {actions && (
            <>
              <div className="w-px h-4 bg-[#E5E5E3] mx-1" />
              {actions}
            </>
          )}

          <div className="flex items-center gap-2 pl-3 ml-1 border-l border-[#E5E5E3]">
            <span className="text-xs font-semibold text-[#525252]">
              {user?.name}
            </span>
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
  );
}
