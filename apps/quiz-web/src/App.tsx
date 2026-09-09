import React, { useState, useEffect } from 'react';
import { useQuizSession } from './hooks/useQuizSession.js';
import { QuizStartView } from './views/QuizStartView.js';
import { QuizActiveView } from './views/QuizActiveView.js';
import { QuizResultView } from './views/QuizResultView.js';
import { LoginView } from './views/LoginView.js';
import { authClient } from './api/client.js';
import type { UserProfile } from '@platform/auth-client';

type AuthState = 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

export const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>('INITIALIZING');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [defaultQuizId] = useState<string>('quiz_demo');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;

    // 1. Lắng nghe thay đổi trạng thái xác thực từ AuthClient
    const unsubscribe = authClient.onAuthStateChange((isAuthed) => {
      if (isCancelled) return;
      if (isAuthed) {
        setUser(authClient.getUser());
        setAuthState('AUTHENTICATED');
      } else {
        setUser(null);
        setAuthState('UNAUTHENTICATED');
      }
    });

    // 2. Lắng nghe sự kiện 401 Unauthorized toàn cục để ngắt mạch an toàn
    const handleUnauthorized = () => {
      if (isCancelled) return;
      authClient.logout();
      setUser(null);
      setAuthState('UNAUTHENTICATED');
    };
    window.addEventListener('platform:unauthorized', handleUnauthorized);

    // 3. Quy trình Bootstrapping cốt lõi:
    // Tuyệt đối không mount Dashboard trước khi xác minh phiên hợp lệ
    const token = authClient.getAccessToken();
    if (!token) {
      setAuthState('UNAUTHENTICATED');
      return;
    }

    // Chỉ gửi duy nhất 1 request xác thực với Auth Service
    authClient
      .me()
      .then((profile) => {
        if (!isCancelled) {
          setUser(profile);
          setAuthState('AUTHENTICATED');
        }
      })
      .catch(() => {
        // Token cũ/không hợp lệ -> thu hồi token trong im lặng và chuyển về màn hình đăng nhập
        authClient.logout();
        if (!isCancelled) {
          setUser(null);
          setAuthState('UNAUTHENTICATED');
        }
      });

    return () => {
      isCancelled = true;
      unsubscribe();
      window.removeEventListener('platform:unauthorized', handleUnauthorized);
    };
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
  } = useQuizSession(user?.id || 'candidate_01');

  const handleStart = async (quizId: string) => {
    setIsLoading(true);
    try {
      await start(quizId, user?.id);
    } catch {
      // Error handled in hook
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await authClient.logout();
    setUser(null);
    setAuthState('UNAUTHENTICATED');
  };

  const handleRestart = () => {
    window.location.reload();
  };

  // 1. Đang khởi tạo và xác minh phiên làm việc
  if (authState === 'INITIALIZING') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-xs tracking-wider uppercase font-semibold">
            Đang kiểm tra phiên làm việc...
          </p>
        </div>
      </div>
    );
  }

  // 2. Chưa đăng nhập: Hiển thị màn hình Login
  if (authState === 'UNAUTHENTICATED') {
    return (
      <LoginView
        onLoginSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          setAuthState('AUTHENTICATED');
        }}
      />
    );
  }

  // 2. Màn hình kết quả sau khi nộp
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

  // 3. Màn hình làm bài trực tiếp
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

  // 4. Màn hình khởi động / chọn bài thi sau khi đã đăng nhập
  return (
    <QuizStartView
      quizId={defaultQuizId}
      user={user}
      isLoading={isLoading}
      errorMessage={errorMessage}
      onStart={handleStart}
      onLogout={handleLogout}
    />
  );
};

export default App;
