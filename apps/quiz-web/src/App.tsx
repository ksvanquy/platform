import React, { useState, useEffect } from 'react';
import { useQuizSession } from './hooks/useQuizSession.js';
import { QuizStartView } from './views/QuizStartView.js';
import { QuizActiveView } from './views/QuizActiveView.js';
import { QuizResultView } from './views/QuizResultView.js';
import { LoginView } from './views/LoginView.js';
import { authClient } from './api/client.js';
import type { UserProfile } from '@platform/auth-client';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(() => authClient.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => authClient.isAuthenticated());
  const [defaultQuizId] = useState<string>('quiz_demo');
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
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleRestart = () => {
    window.location.reload();
  };

  // 1. Chưa đăng nhập: Hiển thị màn hình Login
  if (!isAuthenticated) {
    return (
      <LoginView
        onLoginSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          setIsAuthenticated(true);
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
