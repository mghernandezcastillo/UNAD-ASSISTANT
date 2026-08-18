import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Login() {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      await login();
      navigate('/');
    } catch (err: any) {
      setError('Error al iniciar sesión: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-200 dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-800">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-cyan-500/10 rounded-full">
            <GraduationCap className="w-12 h-12 text-cyan-600 dark:text-cyan-400" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">
          Asistente UNAD
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-center mb-8">
          Inicia sesión con tu cuenta de Google (preferiblemente la de la UNAD o una personal) para sincronizar tus trabajos y acceder a Google Docs y Drive.
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-slate-100 text-slate-900 font-semibold py-3 px-4 rounded-xl flex items-center justify-center space-x-2 hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogIn className="w-5 h-5" />
          <span>{loading ? 'Iniciando sesión...' : 'Continuar con Google'}</span>
        </button>
      </div>
    </div>
  );
}
