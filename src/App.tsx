import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { Login } from "./pages/Login";
import { ProfileSetup } from "./pages/ProfileSetup";
import { Dashboard } from "./pages/Dashboard";
import { CourseView } from "./pages/CourseView";
import { TaskView } from "./pages/TaskView";
import { Sun, Moon } from "lucide-react";

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDark(document.documentElement.classList.contains('dark'));
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('app-theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('app-theme', 'dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="fixed bottom-4 right-4 z-50 p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-full shadow-lg border border-black/10 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      title="Cambiar tema (Claro / Oscuro)"
    >
      {isDark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
    </button>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center text-slate-500 dark:text-slate-400">Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <ThemeToggle />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<ProfileSetup />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/course/:courseId" element={
          <ProtectedRoute>
            <CourseView />
          </ProtectedRoute>
        } />
        <Route path="/course/:courseId/task/:taskId" element={
          <ProtectedRoute>
            <TaskView />
          </ProtectedRoute>
        } />
      </Routes>
    </>
  );
}
