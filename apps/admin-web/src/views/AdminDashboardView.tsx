import React, { useState, useEffect } from 'react';
import { authClient, adminApi } from '../api/index.js';
import { getActiveWorkspaceId, setActiveWorkspaceId } from '../api/client.js';
import type { UserProfile } from '@platform/auth-client';

interface AdminDashboardViewProps {
  user: UserProfile;
  onLogout: () => void;
  onRefreshUser: () => void;
}

const AVAILABLE_WORKSPACES = [
  { id: 'tenant_core', name: 'Đại Học Công Nghệ (Khoa CNTT)', tag: 'Mặc định' },
  { id: 'tenant_foreign', name: 'Đại Học Quốc Tế (Khoa Ngoại Ngữ)', tag: 'Cross-Tenant' },
  { id: 'tenant_polytechnic', name: 'Viện Bách Khoa Đào Tạo Mở', tag: 'Đào tạo' },
];

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  user,
  onLogout,
  onRefreshUser,
}) => {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>(() => getActiveWorkspaceId());
  const [apiTestStatus, setApiTestStatus] = useState<string | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    authClient.getAccessToken().then(setToken);
  }, [user]);

  const handleWorkspaceChange = (newWorkspaceId: string) => {
    setActiveWorkspaceId(newWorkspaceId);
    setCurrentWorkspaceId(newWorkspaceId);
    setApiTestStatus(null);
  };

  const isAdmin = user.roles?.includes('ADMIN');
  const isInstructor = user.roles?.includes('INSTRUCTOR');

  const handleTestApi = async () => {
    setIsTestingApi(true);
    setApiTestStatus(null);
    try {
      // Test gọi API đề thi quiz_demo qua adminApi (đính kèm Bearer token + X-Tenant-ID tự động)
      const quiz = await adminApi.getQuiz('quiz_demo');
      setApiTestStatus(
        `✅ Gọi API thành công với Header [X-Tenant-ID: ${currentWorkspaceId}]! Quiz: "${quiz?.title || 'quiz_demo'}" (${quiz?.questions?.length || 0} câu hỏi). Server phản hồi 200 OK.`
      );
    } catch (err: any) {
      setApiTestStatus(
        `⚠️ Kiểm tra API thất bại [Tenant: ${currentWorkspaceId}]: ${err.message || 'Không thể kết nối đến Quiz Core Service (Port 3000)'}`
      );
    } finally {
      setIsTestingApi(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 space-y-8">
      {/* Top Navbar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-black flex items-center justify-center text-lg shadow-lg shadow-indigo-500/20">
            {user.name ? user.name.charAt(0).toUpperCase() : 'A'}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-100">{user.name || user.email}</h2>
              {user.roles?.map((r) => (
                <span
                  key={r}
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                    r === 'ADMIN'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : r === 'INSTRUCTOR'
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600'
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onRefreshUser}
            className="text-xs font-medium px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            🔄 Đồng bộ Profile
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="text-xs font-medium px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {/* Workspace Selector (Domain-Driven Tenancy) */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-indigo-500/30 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base">🏛️</span>
            <div>
              <h3 className="text-sm font-bold text-slate-200">Không Gian Làm Việc / Tổ Chức (Active Workspace)</h3>
              <p className="text-xs text-slate-400">
                Lựa chọn ngữ cảnh tổ chức để quản lý đề thi và ca thi (Header <code className="text-indigo-300 font-mono">X-Tenant-ID</code>)
              </p>
            </div>
          </div>
          <span className="text-xs font-mono px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
            X-Tenant-ID: {currentWorkspaceId}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {AVAILABLE_WORKSPACES.map((ws) => {
            const isActive = currentWorkspaceId === ws.id;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => handleWorkspaceChange(ws.id)}
                className={`p-3.5 rounded-2xl text-left border transition-all ${
                  isActive
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-600/10'
                    : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold truncate">{ws.name}</div>
                <div className="flex items-center justify-between text-[11px] font-mono mt-1 text-slate-400">
                  <span>{ws.id}</span>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">{ws.tag}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Status & Auth Verification Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h3 className="text-lg font-bold text-slate-100">
                Xác thực Định Danh Thành Công (Generic Identity)
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              admin-web đã kết nối với Auth Service, quản lý phiên và điều phối ngữ cảnh tổ chức độc lập.
            </p>
          </div>

          <span className="text-xs font-mono px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Auth: Active
          </span>
        </div>

        {/* Roles & Permissions Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Vai trò & Thẩm quyền (Global Roles)
            </span>
            <div className="text-sm font-semibold text-slate-200">
              {isAdmin
                ? 'Toàn quyền Quản trị (Super Admin)'
                : isInstructor
                ? 'Giảng viên ra đề (Instructor)'
                : 'Thí sinh (Chưa có quyền quản trị)'}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isAdmin
                ? 'Được phép tạo, sửa, xóa đề thi, quản lý người dùng và giám sát kết quả thi.'
                : isInstructor
                ? 'Được phép tạo bài thi, ngân hàng câu hỏi và xem điểm số của các bài thi đã giao.'
                : 'Tài khoản này chỉ có quyền làm bài thi ở quiz-web, không có quyền quản trị.'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Định danh Người dùng (User ID / Principal)
            </span>
            <div className="text-sm font-mono text-indigo-300 break-all">
              {user.id}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Định danh cá nhân độc lập không phụ thuộc tenant. Quiz Service dùng làm tác giả (`creatorId`) khi tạo đề.
            </p>
          </div>
        </div>

        {/* Token Verification & Inspection */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-2">
              <span>🔑 JSON Web Token (Bearer Access Token)</span>
            </span>
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
            >
              {showToken ? 'Ẩn token' : 'Hiển thị chi tiết token'}
            </button>
          </div>

          {showToken ? (
            <pre className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
              {token || 'Chưa tìm thấy Access Token trong Auth Client'}
            </pre>
          ) : (
            <div className="text-xs font-mono text-slate-500 truncate">
              {token ? `${token.substring(0, 32)}...[Đã ẩn ${token.length - 32} ký tự]` : 'Không có token'}
            </div>
          )}
        </div>

        {/* Core API Connectivity Test */}
        <div className="pt-2 border-t border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-200">
                Kiểm tra liên thông với Quiz Core Service
              </h4>
              <p className="text-xs text-slate-400">
                Gửi request kèm <code className="text-indigo-300">Authorization: Bearer &lt;token&gt;</code> và <code className="text-indigo-300">X-Tenant-ID: {currentWorkspaceId}</code>
              </p>
            </div>
            <button
              type="button"
              onClick={handleTestApi}
              disabled={isTestingApi}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              {isTestingApi ? 'Đang gửi request...' : '⚡ Test API Đề Thi'}
            </button>
          </div>

          {apiTestStatus && (
            <div
              className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
                apiTestStatus.startsWith('✅')
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              {apiTestStatus}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-slate-500">
        Admin Portal • Clean-Cut Tenancy Architecture (Header-based Tenancy & Generic Auth)
      </div>
    </div>
  );
};
