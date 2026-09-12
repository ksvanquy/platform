import React from 'react';
import type { UserProfile } from '@platform/auth-client';
import { UserIcon, ShieldCheckIcon, XIcon, AwardIcon } from '../common/Icons.js';

interface StudentProfileModalProps {
  user: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onLogout,
}) => {
  if (!isOpen || !user) return null;

  const initials = user.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <div
      id="profile-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="profile-modal-card"
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7 space-y-6 text-slate-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <UserIcon size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Hồ Sơ Học Viên</h2>
              <p className="text-xs text-slate-400">Thông tin tài khoản & định danh khảo thí</p>
            </div>
          </div>
          <button
            id="btn-close-profile"
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Đóng"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* User Card */}
        <div className="flex items-center space-x-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/60">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-lg ring-2 ring-sky-500/30 shrink-0">
            {initials}
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-base font-bold text-slate-100 truncate">
                {user.name || user.email}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wide shrink-0">
                {user.roles?.includes('STUDENT') || !user.roles?.length ? 'STUDENT' : user.roles.join(', ')}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span className="text-slate-500 block font-medium">Mã học viên (Principal ID)</span>
            <span className="font-mono text-sky-400 text-[11px] break-all select-all font-semibold">
              {user.id}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span className="text-slate-500 block font-medium">Trạng thái định danh</span>
            <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold">
              <ShieldCheckIcon size={14} />
              <span>Đã xác thực (Hợp lệ)</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span className="text-slate-500 block font-medium">Quyền hạn hệ thống</span>
            <span className="text-slate-300 font-semibold">
              Khảo thí, Làm bài thi trực tuyến
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span className="text-slate-500 block font-medium">Cơ chế giám sát</span>
            <span className="text-indigo-300 font-semibold">
              Đồng bộ thời gian thực RFC/Server
            </span>
          </div>
        </div>

        {/* System Notice */}
        <div className="p-3.5 rounded-xl bg-sky-950/30 border border-sky-500/20 text-xs text-sky-300/90 flex items-start space-x-3">
          <div className="mt-0.5 shrink-0 text-sky-400">
            <AwardIcon size={16} />
          </div>
          <div className="space-y-0.5">
            <span className="font-semibold text-sky-200">Lưu ý trong kỳ thi:</span>
            <p className="text-[11px] leading-relaxed text-slate-300">
              Kết quả làm bài và thời gian thi được ghi nhận tự động theo ID thí sinh. Không chia sẻ tài khoản hoặc mở đồng thời bài thi trên thiết bị khác.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            id="btn-profile-logout"
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
          >
            Đăng xuất
          </button>
          <button
            id="btn-profile-close"
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-900 bg-sky-400 hover:bg-sky-300 transition-colors shadow-md shadow-sky-500/10"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
