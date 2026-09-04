import React, { useState, useEffect } from 'react';
import { authClient } from './api/client.js';
import { AdminLoginView } from './views/AdminLoginView.js';
import { AdminDashboardView } from './views/AdminDashboardView.js';
import type { UserProfile } from '@platform/auth-client';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(() => authClient.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => authClient.isAuthenticated());

  useEffect(() => {
    // Lắng nghe thay đổi trạng thái xác thực từ authClient
    const unsubscribe = authClient.onAuthStateChange((isAuthed) => {
      setIsAuthenticated(isAuthed);
      setUser(authClient.getUser());
    });

    // Nếu đã có token lưu trong session nhưng chưa có thông tin profile, gọi /me
    if (authClient.isAuthenticated() && !user) {
      authClient
        .me()
        .then((profile) => {
          setUser(profile);
        })
        .catch(() => {
          setIsAuthenticated(false);
          setUser(null);
        });
    }

    return () => unsubscribe();
  }, []);

  const handleRefreshUser = async () => {
    try {
      const profile = await authClient.me();
      setUser(profile);
    } catch {
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const handleLogout = async () => {
    await authClient.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  if (!isAuthenticated || !user) {
    return (
      <AdminLoginView
        onLoginSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          setIsAuthenticated(true);
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
