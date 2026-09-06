import React, { useState } from 'react';
import { authClient } from '../api/client.js';
import type { UserProfile } from '@platform/auth-client';

interface AdminLoginViewProps {
  onLoginSuccess: (user: UserProfile) => void;
}

const DEMO_ADMIN_ACCOUNTS = [
  {
    role: 'ADMIN',
    title: 'Quản trị viên Hệ thống (ADMIN)',
    email: 'admin@quiz.local',
    password: 'admin123',
    name: 'Administrator',
    icon: '🛡️',
    badge: 'Toàn quyền',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  {
    role: 'INSTRUCTOR',
    title: 'Giảng viên ra đề (INSTRUCTOR)',
    email: 'instructor@quiz.local',
    password: 'teacher123',
    name: 'Tran Thi Giảng Viên',
    icon: '👨‍🏫',
    badge: 'Quản lý đề',
    badgeColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  {
    role: 'STUDENT',
    title: 'Thử nghiệm Thí sinh (STUDENT)',
    email: 'student@quiz.local',
    password: 'student123',
    name: 'Nguyen Van Học Viên',
    icon: '🎓',
    badge: 'Hạn chế',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
];

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('admin@quiz.local');
  const [password, setPassword] = useState('admin123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent, customEmail?: string, customPassword?: string) => {
    if (e) e.preventDefault();
    const targetEmail = customEmail || email;
    const targetPassword = customPassword || password;

    if (!targetEmail.trim() || !targetPassword.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ Email và Mật khẩu');
      return;
    }

    if (mode === 'register' && !name.trim()) {
      setErrorMessage('Vui lòng nhập họ và tên của bạn');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (mode === 'register') {
        const response = await authClient.register({
          name: name.trim(),
          email: targetEmail.trim(),
          password: targetPassword.trim(),
        });
        onLoginSuccess(response.user);
      } else {
        const response = await authClient.login({
          email: targetEmail.trim(),
          password: targetPassword.trim(),
        });
        onLoginSuccess(response.user);
      }
    } catch (err: any) {
      setErrorMessage(
        err.message ||
          (mode === 'register' ? 'Đăng ký thất bại. Vui lòng thử lại.' : 'Đăng nhập thất bại. Vui lòng đảm bảo Auth Service đang chạy.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDemo = (acc: typeof DEMO_ADMIN_ACCOUNTS[0]) => {
    setMode('login');
    setEmail(acc.email);
    setPassword(acc.password);
    handleSubmit(undefined, acc.email, acc.password);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto text-2xl font-bold shadow-lg shadow-indigo-500/10">
            ⚡
          </div>
          <div className="inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-1">
            Admin & Instructor Portal
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            {mode === 'login' ? 'Cổng Quản Trị Hệ Thống' : 'Đăng Ký Tài Khoản Quản Trị'}
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            {mode === 'login'
              ? 'Xác thực tài khoản cán bộ qua Auth Service (Generic Identity)'
              : 'Đăng ký định danh cá nhân độc lập không ràng buộc tổ chức'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Đăng Nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'register'
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Đăng Ký Mới
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs leading-relaxed">
            <span className="font-semibold block mb-0.5">⚠️ Thông báo</span>
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Họ và tên
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ví dụ: Trần Thị Bình"
                required
                className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Tài khoản Quản trị / Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@quiz.local"
              required
              className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          {mode === 'register' && (
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-[11px] text-slate-400 leading-relaxed">
              ℹ️ <span className="font-semibold text-slate-300">Quản trị hệ thống:</span> Tài khoản định danh trực tiếp theo kiến trúc Single-Tenant với phân quyền RBAC minh bạch.
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? mode === 'register'
                ? 'Đang đăng ký tài khoản...'
                : 'Đang xác thực thông tin...'
              : mode === 'register'
              ? 'Tạo Tài Khoản Quản Trị Mới'
              : 'Đăng Nhập Quản Trị'}
          </button>
        </form>

        {/* Demo Accounts Quick-Click (Login mode only) */}
        {mode === 'login' && (
          <div className="pt-2 border-t border-slate-800 space-y-2.5">
            <p className="text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Tài khoản kiểm tra nhanh (1-Click):</span>
              <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">Click để vào</span>
            </p>
            <div className="grid grid-cols-1 gap-2">
              {DEMO_ADMIN_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleSelectDemo(acc)}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500/50 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="text-base">{acc.icon}</span>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">
                        {acc.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {acc.email} <span className="text-slate-600">•</span> pass: <code className="text-slate-300 font-mono">{acc.password}</code>
                      </div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${acc.badgeColor}`}>
                    {acc.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
