import React, { useState, useEffect } from 'react';
import { authClient, adminApi } from '../api/index.js';
import type { UserProfile } from '@platform/auth-client';
import { TaxonomyManagementSection } from './TaxonomyManagementSection.js';
import { QuestionManagementSection } from './QuestionManagementSection.js';
import { AssessmentManagementSection } from './AssessmentManagementSection.js';
import { ExamManagementSection } from './ExamManagementSection.js';

interface AdminDashboardViewProps {
  user: UserProfile;
  onLogout: () => void;
  onRefreshUser: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  user,
  onLogout,
  onRefreshUser,
}) => {
  const [activeTab, setActiveTab] = useState<'questions' | 'assessments' | 'exams' | 'taxonomies' | 'system'>('questions');
  const [apiTestStatus, setApiTestStatus] = useState<string | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // User management state for ADMIN
  const [userList, setUserList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isAdmin = user.roles?.includes('ADMIN');
  const isInstructor = user.roles?.includes('INSTRUCTOR');

  const fetchUsers = async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const list = await adminApi.listUsers();
      setUserList(list);
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    authClient.getAccessToken().then(setToken);
    if (isAdmin) {
      fetchUsers();
    }
  }, [user, isAdmin]);

  const handleToggleUserStatus = async (targetUser: any) => {
    const nextStatus = !targetUser.isActive;
    setUpdatingUserId(targetUser.id);
    setStatusMessage(null);
    try {
      const res = await adminApi.updateUserStatus(targetUser.id, nextStatus);
      if (res.success) {
        setStatusMessage(
          `✅ Đã ${nextStatus ? 'mở khóa' : 'khóa'} tài khoản ${targetUser.email}. Tất cả token của phiên cũ đã bị thu hồi!`
        );
        await fetchUsers();
      } else {
        setStatusMessage(`❌ Lỗi: ${res.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi: ${err.message}`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleTestApi = async () => {
    setIsTestingApi(true);
    setApiTestStatus(null);
    try {
      const exams = await adminApi.listExams();
      setApiTestStatus(
        `✅ Kết nối Gateway (Port 3000) thành công! Microservices phản hồi 200 OK. Đã tìm thấy ${exams?.length || 0} kỳ thi.`
      );
    } catch (err: any) {
      setApiTestStatus(
        `⚠️ Kiểm tra API thất bại: ${err.message || 'Không thể kết nối đến Gateway (Port 3000)'}`
      );
    } finally {
      setIsTestingApi(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12 space-y-6">
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

      {/* Main Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
        <button
          type="button"
          onClick={() => setActiveTab('questions')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'questions'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          📝 Ngân Hàng Câu Hỏi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('assessments')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'assessments'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          📐 Ma Trận Đề & Đánh Giá
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('exams')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'exams'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          ⚡ Kỳ Thi & Bộ Mã Đề
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('taxonomies')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'taxonomies'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          🌳 Cây Tri Thức
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('system')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'system'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          ⚙️ Hệ Thống & User
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'questions' && <QuestionManagementSection />}

      {activeTab === 'assessments' && <AssessmentManagementSection />}

      {activeTab === 'exams' && <ExamManagementSection />}

      {activeTab === 'taxonomies' && <TaxonomyManagementSection />}

      {activeTab === 'system' && (
        <div className="space-y-6">
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
              admin-web đã kết nối với Auth Service, quản lý phiên và điều phối phân quyền hệ thống.
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
                : 'Tài khoản này chỉ có quyền làm bài thi ở web, không có quyền quản trị.'}
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
              Định danh cá nhân. Quiz Service dùng làm tác giả (`ownerId`) khi tạo đề thi.
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
                Gửi request kèm <code className="text-indigo-300">Authorization: Bearer &lt;token&gt;</code>
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

      {/* User Management & Account Lockout Card (Admin Only) */}
      {isAdmin && (
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-lg">🛡️</span>
                <h3 className="text-lg font-bold text-slate-100">
                  Quản Trị Tài Khoản & Khóa / Vô Hiệu Hóa (Account Lockout)
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Khóa tài khoản sẽ ngay lập tức vô hiệu hóa phiên làm việc, thu hồi toàn bộ Refresh Tokens và chặn các Access Token cũ.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchUsers}
              disabled={loadingUsers}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              {loadingUsers ? 'Đang tải...' : '🔄 Làm mới'}
            </button>
          </div>

          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
                statusMessage.startsWith('✅')
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {statusMessage}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Họ tên & Email</th>
                  <th className="py-2.5 px-3">Vai trò (Roles)</th>
                  <th className="py-2.5 px-3">Trạng thái</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {userList.map((u) => {
                  const isCurrent = u.id === user.id;
                  const isBusy = updatingUserId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-200">{u.name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {(u.roles || []).map((r: string) => (
                            <span
                              key={r}
                              className="px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 font-mono text-[10px]"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {u.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            🟢 Đang hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            🔴 Đã khóa
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isCurrent ? (
                          <span className="text-[11px] text-slate-500 italic">Tài khoản hiện tại</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(u)}
                            disabled={isBusy}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                              u.isActive
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {isBusy ? 'Đang xử lý...' : u.isActive ? '🔒 Khóa tài khoản' : '🔓 Mở khóa'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>
      )}

      {/* Footer Info */}
      <div className="text-center text-xs text-slate-500">
        Admin Portal • Single-Tenant Clean Architecture
      </div>
    </div>
  );
};
