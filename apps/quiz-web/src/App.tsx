import React, { useState, useEffect } from 'react';
import { useQuizSession } from './hooks/useQuizSession.js';
import { QuizStartView } from './views/QuizStartView.js';
import { QuizActiveView } from './views/QuizActiveView.js';
import { QuizResultView } from './views/QuizResultView.js';
import { LoginView } from './views/LoginView.js';
import { authClient } from './api/client.js';
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
  } = useQuizSession(user?.id || 'candidate_guest');

  /**
   * Bắt đầu ca thi:
   * - Nếu chưa đăng nhập: Ghi nhớ pendingQuizId, mở màn hình đăng nhập
   * - Nếu đã đăng nhập: Gọi start(quizId) và vào thẳng phòng thi
   */
  const handleStart = async (quizId: string) => {
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
   * - Nếu có pendingQuizId (người dùng bấm thi trước đó), tự động kích hoạt ca thi ngay
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
    await authClient.logout();
    setIsAuthenticated(false);
    setUser(null);
    setShowLoginView(false);
    setPendingQuizId(null);
  };

  const handleRestart = () => {
    window.location.reload();
  };

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
            ? 'Vui lòng đăng nhập để bắt đầu ca thi bạn đã chọn'
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
    />
  );
};

export default App;
