import React, { useState, useEffect } from 'react';
import { authClient } from './api/client.js';
import { AdminLoginView } from './views/AdminLoginView.js';
import { AdminDashboardView } from './views/AdminDashboardView.js';
import type { UserProfile } from '@platform/auth-client';

type AuthState = 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

export const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>('INITIALIZING');
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let isCancelled = false;

    // 1. Lắng nghe thay đổi trạng thái xác thực từ authClient
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

    // 2. Lắng nghe sự kiện 401 Unauthorized toàn cục
    const handleUnauthorized = () => {
      if (isCancelled) return;
      authClient.logout();
      setUser(null);
      setAuthState('UNAUTHENTICATED');
    };
    window.addEventListener('platform:unauthorized', handleUnauthorized);

    // 3. Bootstrapping: Xác minh phiên đăng nhập TRƯỚC KHI mount dashboard
    const token = authClient.getAccessToken();
    if (!token) {
      setAuthState('UNAUTHENTICATED');
      return;
    }

    authClient
      .me()
      .then((profile) => {
        if (!isCancelled) {
          setUser(profile);
          setAuthState('AUTHENTICATED');
        }
      })
      .catch(() => {
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

  const handleRefreshUser = async () => {
    try {
      const profile = await authClient.me();
      setUser(profile);
    } catch {
      authClient.logout();
      setUser(null);
      setAuthState('UNAUTHENTICATED');
    }
  };

  const handleLogout = async () => {
    await authClient.logout();
    setUser(null);
    setAuthState('UNAUTHENTICATED');
  };

  if (authState === 'INITIALIZING') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-xs tracking-wider uppercase font-semibold">
            Đang xác thực quyền Quản trị...
          </p>
        </div>
      </div>
    );
  }

  if (authState === 'UNAUTHENTICATED' || !user) {
    return (
      <AdminLoginView
        onLoginSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          setAuthState('AUTHENTICATED');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center">
      <AdminDashboardView
        user={user}
        onLogout={handleLogout}
        onRefreshUser={handleRefreshUser}
      />
    </div>
  );
};

export default App;
