import React, { useState, useEffect, useRef } from 'react';
import { useQuizSession, ACTIVE_SESSION_STORAGE_KEY } from './hooks/useQuizSession.js';
import { QuizStartView, ActiveAttemptBannerInfo } from './views/QuizStartView.js';
import { QuizActiveView } from './views/QuizActiveView.js';
import { QuizResultView } from './views/QuizResultView.js';
import { LoginView } from './views/LoginView.js';
import { authClient } from './api/client.js';
import { quizApi } from './api/quiz-api.js';
import type { UserProfile } from '@platform/auth-client';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(() => authClient.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => authClient.isAuthenticated());
  const [showLoginView, setShowLoginView] = useState<boolean>(false);
  const [pendingQuizId, setPendingQuizId] = useState<string | null>(null);
  const [defaultQuizId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('quizId') || params.get('examId') || '';
    }
    return '';
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRehydrating, setIsRehydrating] = useState<boolean>(false);
  const [activeAttempt, setActiveAttempt] = useState<ActiveAttemptBannerInfo | null>(null);
  const hasRehydratedRef = useRef<boolean>(false);

  useEffect(() => {
    const unsubscribe = authClient.onAuthStateChange((isAuthed) => {
      setIsAuthenticated(isAuthed);
      setUser(authClient.getUser());
    });
    return () => unsubscribe();
  }, []);

  const {
    session,
    questions,
    answers,
    saveStatus,
    isSubmitting,
    result,
    errorMessage,
    start,
    setAnswer,
    submit,
    clearActiveSessionCache,
  } = useQuizSession(user?.id || 'candidate_guest');

  /**
   * Giai đoạn 1: Tự động khôi phục ca thi đang dở dang (Session Auto-Rehydration)
   * Giúp thí sinh không bị mất ca thi khi vô tình tắt tab, ấn F5 hoặc ấn Backspace
   */
  useEffect(() => {
    if (hasRehydratedRef.current) return;
    hasRehydratedRef.current = true;

    try {
      const cachedStr = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (!cachedStr) return;

      const cached = JSON.parse(cachedStr);
      if (!cached || !cached.quizId) {
        clearActiveSessionCache();
        return;
      }

      const deadlineTime = cached.deadline ? new Date(cached.deadline).getTime() : 0;
      const isStillValid = deadlineTime > Date.now();

      if (isStillValid && cached.status === 'IN_PROGRESS') {
        const candidateId = user?.id || cached.userId || 'candidate_guest';
        setIsLoading(true);
        setIsRehydrating(true);

        start(cached.quizId, candidateId)
          .catch((err) => {
            console.warn('[Session Rehydration] Tự động khôi phục ca thi thất bại:', err);
            clearActiveSessionCache();
          })
          .finally(() => {
            setIsLoading(false);
            setIsRehydrating(false);
          });
      } else {
        clearActiveSessionCache();
      }
    } catch {
      clearActiveSessionCache();
    }
  }, [user?.id, start, clearActiveSessionCache]);

  /**
   * Giai đoạn 3: Phát hiện ca thi đang diễn ra từ Backend Server (Active Attempt Discovery)
   * Tự động hiển thị banner nhắc nhở thí sinh nếu có ca thi đang dở dang
   */
  useEffect(() => {
    if (session && session.status === 'IN_PROGRESS') {
      setActiveAttempt(null);
      return;
    }

    // 1. Kiểm tra từ cache local storage
    try {
      const cachedStr = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        const deadlineTime = cached.deadline ? new Date(cached.deadline).getTime() : 0;
        if (cached && cached.status === 'IN_PROGRESS' && deadlineTime > Date.now()) {
          const remainingMinutes = Math.max(1, Math.round((deadlineTime - Date.now()) / 60000));
          setActiveAttempt({
            id: cached.id,
            examId: cached.quizId,
            quizId: cached.quizId,
            title: cached.title || cached.quizId,
            deadline: cached.deadline,
            remainingMinutes,
          });
          return;
        }
      }
    } catch {
      // Ignored
    }

    // 2. Nếu thí sinh đã đăng nhập: truy vấn máy chủ GET /v1/attempts?status=IN_PROGRESS
    if (user?.id) {
      quizApi
        .getActiveAttempt(user.id)
        .then((serverAttempt) => {
          if (serverAttempt && serverAttempt.status === 'IN_PROGRESS') {
            const dl = serverAttempt.deadline ? new Date(serverAttempt.deadline).getTime() : 0;
            if (dl === 0 || dl > Date.now()) {
              const remainingMinutes = dl > 0 ? Math.max(1, Math.round((dl - Date.now()) / 60000)) : undefined;
              setActiveAttempt({
                id: serverAttempt.id,
                examId: serverAttempt.examId,
                quizId: serverAttempt.examId,
                title: serverAttempt.examTitle || serverAttempt.examId,
                deadline: serverAttempt.deadline,
                remainingMinutes,
              });
            }
          }
        })
        .catch(() => {
          // Ignored
        });
    }
  }, [user?.id, session]);

  /**
   * Bắt đầu bài thi:
   * - Nếu chưa đăng nhập: Ghi nhớ pendingQuizId, mở màn hình đăng nhập
   * - Nếu đã đăng nhập: Gọi start(quizId) và vào thẳng phòng thi
   */
  const handleStart = async (quizId: string) => {
    setActiveAttempt(null);
    if (!isAuthenticated || !user) {
      setPendingQuizId(quizId);
      setShowLoginView(true);
      return;
    }

    setIsLoading(true);
    try {
      if (authClient.isExpired()) {
        try {
          await authClient.refresh();
        } catch {
          if (!authClient.isAuthenticated()) {
            setPendingQuizId(quizId);
            setShowLoginView(true);
            return;
          }
        }
      }
      await start(quizId, user.id);
    } catch {
      // Error handled in hook
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Xử lý đăng nhập thành công:
   * - Cập nhật thông tin user và trạng thái authenticated
   * - Nếu có pendingQuizId (người dùng bấm thi trước đó), tự động kích hoạt bài thi ngay
   */
  const handleLoginSuccess = async (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setIsAuthenticated(true);
    setShowLoginView(false);

    if (pendingQuizId) {
      const targetQuizId = pendingQuizId;
      setPendingQuizId(null);
      setIsLoading(true);
      try {
        await start(targetQuizId, loggedInUser.id);
      } catch {
        // Error handled in hook
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleLogout = async () => {
    clearActiveSessionCache();
    await authClient.logout();
    setIsAuthenticated(false);
    setUser(null);
    setShowLoginView(false);
    setPendingQuizId(null);
  };

  const handleRestart = () => {
    clearActiveSessionCache();
    window.location.reload();
  };

  // 0. Màn hình thông báo đang tự động khôi phục ca thi dang dở
  if (isRehydrating) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col items-center space-y-4 max-w-sm text-center animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 text-2xl animate-pulse">
            🔄
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-200 text-base">Đang khôi phục ca thi</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Phát hiện ca thi đang dở dang. Hệ thống đang bảo toàn dữ liệu và đưa bạn trở lại phòng thi...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 1. Màn hình kết quả sau khi nộp
  if (result) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center">
        <QuizResultView
          result={result}
          questions={questions}
          onRestart={handleRestart}
        />
      </div>
    );
  }

  // 2. Màn hình làm bài trực tiếp trong phòng thi
  if (session && session.status === 'IN_PROGRESS' && questions.length > 0) {
    return (
      <QuizActiveView
        session={session}
        questions={questions}
        answers={answers}
        saveStatus={saveStatus}
        isSubmitting={isSubmitting}
        onAnswerChange={setAnswer}
        onSubmit={() => submit({ showDetails: true })}
      />
    );
  }

  // 3. Màn hình Đăng nhập (khi người dùng chủ động bấm Đăng nhập hoặc khi bấm Bắt đầu thi mà chưa login)
  if (showLoginView) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        onCancel={() => {
          setShowLoginView(false);
          setPendingQuizId(null);
        }}
        bannerMessage={
          pendingQuizId
            ? 'Vui lòng đăng nhập để bắt đầu bài thi bạn đã chọn'
            : null
        }
      />
    );
  }

  // 4. Màn hình Khám phá & Chọn đề thi (Mặc định cho cả Khách vãng lai và Học viên đã đăng nhập)
  return (
    <QuizStartView
      quizId={defaultQuizId}
      user={user}
      isLoading={isLoading}
      errorMessage={errorMessage}
      onStart={handleStart}
      onLogout={handleLogout}
      onLoginRequest={() => setShowLoginView(true)}
      activeAttempt={activeAttempt}
      onResumeActiveAttempt={(attempt) => {
        handleStart(attempt.examId || attempt.quizId || '');
      }}
      onDismissActiveAttempt={() => setActiveAttempt(null)}
    />
  );
};

export default App;
