import React, { useState, useRef, useEffect } from 'react';
import type { UserProfile } from '@platform/auth-client';
import {
  AcademicCapIcon,
  ChevronDownIcon,
  UserIcon,
  LogOutIcon,
} from '../common/Icons.js';

interface TopBarProps {
  user: UserProfile | null;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ user, onOpenProfile, onLogout }) => {
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const studentName = user?.name || user?.email?.split('@')[0] || 'Học viên';
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (user?.email ? user.email[0].toUpperCase() : 'S');

  return (
    <header
      id="top-bar-header"
      className="h-16 w-full bg-slate-900/90 border-b border-slate-800/90 px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 select-none backdrop-blur-md"
    >
      {/* Bên trái: Logo + Tên hệ thống ("Hệ Thống Thi Trắc Nghiệm") */}
      <div id="top-bar-left" className="flex items-center space-x-3">
        <div
          id="system-logo"
          className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 p-0.5 flex items-center justify-center shadow-lg shadow-sky-500/10 shrink-0"
        >
          <div className="w-full h-full bg-slate-950/40 rounded-[10px] flex items-center justify-center text-white">
            <AcademicCapIcon size={22} className="text-sky-300" />
          </div>
        </div>

        <div className="flex flex-col">
          <span
            id="system-title"
            className="text-base sm:text-lg font-black tracking-tight text-slate-100 flex items-center gap-2"
          >
            Hệ Thống Thi Trắc Nghiệm
          </span>
          <span className="hidden sm:inline-block text-[11px] text-slate-400 font-medium">
            Cổng Khảo Thí & Phân Loại Đề Theo Cây Tri Thức
          </span>
        </div>
      </div>

      {/* Bên phải: Avatar nhỏ + Tên học viên + Badge STUDENT + Dropdown menu */}
      <div id="top-bar-right" className="flex items-center space-x-3" ref={dropdownRef}>
        <div className="relative">
          <button
            id="user-menu-button"
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
            className="flex items-center space-x-2.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 transition-all text-left group focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            {/* Avatar nhỏ */}
            <div
              id="student-avatar-small"
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white text-xs font-black flex items-center justify-center shadow-sm shrink-0"
            >
              {initials}
            </div>

            {/* Tên học viên & Badge */}
            <div className="hidden md:flex flex-col">
              <span id="student-name" className="text-xs font-bold text-slate-100 leading-tight truncate max-w-[140px]">
                {studentName}
              </span>
              <span className="text-[10px] text-slate-400 font-mono leading-tight truncate max-w-[140px]">
                {user?.email || 'student@platform.local'}
              </span>
            </div>

            {/* Badge STUDENT */}
            <span
              id="student-badge"
              className="text-[10px] font-black tracking-wider px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 uppercase shrink-0"
            >
              STUDENT
            </span>

            {/* Dropdown indicator */}
            <ChevronDownIcon
              size={14}
              className={`text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${
                dropdownOpen ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div
              id="user-dropdown-menu"
              className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150"
              role="menu"
              aria-orientation="vertical"
            >
              <div className="px-3 py-2.5 border-b border-slate-800/80 mb-1">
                <div className="text-[11px] text-slate-400 font-medium">Đang đăng nhập với tư cách:</div>
                <div className="font-bold text-slate-200 truncate mt-0.5">{studentName}</div>
                <div className="text-[10px] text-slate-500 font-mono truncate">{user?.id}</div>
              </div>

              {/* Menu Item: Hồ sơ */}
              <button
                id="menu-item-profile"
                type="button"
                role="menuitem"
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenProfile();
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-slate-100 hover:bg-slate-800/80 transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                  <UserIcon size={14} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-200">Hồ sơ</div>
                  <div className="text-[10px] text-slate-400">Xem thông tin cá nhân & định danh</div>
                </div>
              </button>

              <div className="my-1 border-t border-slate-800/80" />

              {/* Menu Item: Đăng xuất */}
              <button
                id="menu-item-logout"
                type="button"
                role="menuitem"
                onClick={() => {
                  setDropdownOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                  <LogOutIcon size={14} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Đăng xuất</div>
                  <div className="text-[10px] text-rose-400/80">Thoát phiên đăng nhập</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
