import React, { useState, useEffect } from 'react';
import type { UserProfile } from '@platform/auth-client';
import { quizApi } from '../api/quiz-api.js';
import { getActiveWorkspaceId, setActiveWorkspaceId } from '../api/client.js';

interface QuizStartViewProps {
  quizId: string;
  user: UserProfile | null;
  isLoading: boolean;
  errorMessage: string | null;
  onStart: (quizId: string) => void;
  onLogout: () => void;
}

const AVAILABLE_WORKSPACES = [
  { id: 'tenant_core', name: 'Đại Học Công Nghệ (Khoa CNTT)', tag: 'Mặc định' },
  { id: 'tenant_foreign', name: 'Đại Học Quốc Tế (Khoa Ngoại Ngữ)', tag: 'Cross-Tenant' },
  { id: 'tenant_polytechnic', name: 'Viện Bách Khoa Đào Tạo Mở', tag: 'Đào tạo' },
];

export const QuizStartView: React.FC<QuizStartViewProps> = ({
  quizId,
  user,
  isLoading,
  errorMessage,
  onStart,
  onLogout,
}) => {
  const [selectedQuizId, setSelectedQuizId] = useState(quizId);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>(() => getActiveWorkspaceId());
  const [availableQuizzes, setAvailableQuizzes] = useState<any[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState<boolean>(false);
  const [showProfileDetails, setShowProfileDetails] = useState(false);

  const fetchQuizzes = async (workspaceId: string) => {
    setLoadingQuizzes(true);
    try {
      setActiveWorkspaceId(workspaceId);
      const quizzes = await quizApi.listQuizzes();
      setAvailableQuizzes(quizzes);
      if (quizzes.length > 0) {
        setSelectedQuizId(quizzes[0].id);
      } else {
        setSelectedQuizId('');
      }
    } catch {
      // Fallback
    } finally {
      setLoadingQuizzes(false);
    }
  };

  useEffect(() => {
    fetchQuizzes(currentWorkspaceId);
  }, [currentWorkspaceId]);

  const handleWorkspaceChange = (newWorkspaceId: string) => {
    setCurrentWorkspaceId(newWorkspaceId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuizId.trim()) return;
    onStart(selectedQuizId.trim());
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6">
        {/* User Profile Bar (Auth Status - Generic Identity) */}
        {user && (
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-500 text-white font-bold flex items-center justify-center text-sm shadow-md">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-slate-100">{user.name || user.email}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                      {user.roles?.join(', ') || 'STUDENT'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{user.email}</div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowProfileDetails(!showProfileDetails)}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                >
                  {showProfileDetails ? 'Ẩn hồ sơ' : 'Hồ sơ cá nhân'}
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 transition-colors"
                >
                  Đăng xuất
                </button>
              </div>
            </div>

            {/* Pure Generic Identity Details */}
            {showProfileDetails && (
              <div className="pt-3 border-t border-slate-700/60 text-xs space-y-2 text-slate-300">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">User ID (Principal):</span>
                  <span className="font-mono text-indigo-300 text-[11px]">{user.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Trạng thái định danh:</span>
                  <span className="text-emerald-400 font-semibold">Tài khoản cá nhân thuần túy (Generic)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
                  💡 Tài khoản của bạn không bị gắn cứng vào bất kỳ trường/khoa nào. Bạn có thể tự do chuyển đổi tổ chức (Workspace) bên dưới để làm bài thi được giao.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Workspace / Organization Switcher (Domain-Driven Tenancy) */}
        <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm">🏛️</span>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                Tổ chức đang làm việc (Workspace)
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              X-Tenant-ID: {currentWorkspaceId}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {AVAILABLE_WORKSPACES.map((ws) => {
              const isActive = currentWorkspaceId === ws.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleWorkspaceChange(ws.id)}
                  className={`p-2.5 rounded-xl text-left border text-xs transition-all ${
                    isActive
                      ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 font-bold shadow-sm'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="truncate font-semibold text-[11px]">{ws.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex justify-between">
                    <span>{ws.id}</span>
                    <span>{ws.tag}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center mx-auto text-xl font-bold">
            ⚡
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-100">
            Hệ Thống Thi Trắc Nghiệm
          </h1>
          <p className="text-slate-400 text-sm">
            Hệ thống chấm điểm tự động & đồng bộ thời gian thực theo chuẩn RESTful Delivery
          </p>
        </div>

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Đề thi khả dụng trong tổ chức</span>
              {loadingQuizzes && <span className="text-sky-400 font-normal lowercase animate-pulse">Đang cập nhật...</span>}
            </label>

            {availableQuizzes.length === 0 && !loadingQuizzes ? (
              <div className="p-4 rounded-2xl bg-slate-800/30 border border-dashed border-slate-700 text-center text-xs text-slate-400 space-y-1">
                <p>Không có đề thi nào trong tổ chức <strong>{currentWorkspaceId}</strong>.</p>
                <p className="text-[11px] text-slate-500">Hãy thử chuyển sang tổ chức <em>tenant_core</em> hoặc nhập mã đề thi công khai.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableQuizzes.map((quiz) => {
                  const isChosen = selectedQuizId === quiz.id;
                  return (
                    <div
                      key={quiz.id}
                      onClick={() => setSelectedQuizId(quiz.id)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        isChosen
                          ? 'bg-sky-500/10 border-sky-500/80 text-sky-200'
                          : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                          <span>{quiz.title}</span>
                          {quiz.isPublic ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Công khai
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              Nội bộ ({quiz.tenantId || currentWorkspaceId})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          Mã: <span className="font-mono text-slate-300">{quiz.code}</span> (ID: {quiz.id})
                        </div>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 text-sky-400 border border-slate-700">
                        {isChosen ? '✓ Đang chọn' : 'Chọn'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Mã đề thi (Quiz ID / Code)
            </label>
            <input
              type="text"
              value={selectedQuizId}
              onChange={(e) => setSelectedQuizId(e.target.value)}
              placeholder="ví dụ: quiz_demo hoặc mã đề thi"
              required
              className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
            />
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800 space-y-2 text-xs text-slate-400">
            <div className="font-semibold text-slate-300">Quy chế phòng thi (RESTful Delivery & Domain Tenancy):</div>
            <ul className="list-disc list-inside space-y-1">
              <li>Thí sinh mang Principal cá nhân; Quiz Service tự thẩm định ranh giới tổ chức theo header <code className="text-sky-300 font-mono">X-Tenant-ID</code>.</li>
              <li>Đề thi nội bộ chặn hoàn toàn các truy cập xuyên tổ chức trái phép.</li>
              <li>Tự động kích hoạt chống gian lận đa tab (Multi-tab defense).</li>
              <li>Lưu bài theo chuẩn idempotency và đối chiếu timestamp chống mạng trễ.</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={isLoading || !selectedQuizId.trim()}
            className="w-full py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Đang khởi tạo ca thi...' : '▶ Bắt đầu làm bài'}
          </button>
        </form>
      </div>
    </div>
  );
};
