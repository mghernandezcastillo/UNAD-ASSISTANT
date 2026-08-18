import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './contexts/AuthContext';
import App from './App.tsx';
import './index.css';
import firebaseConfig from '../firebase-applet-config.json';

// Detección automática de Windows 8.1 (Windows NT 6.3) para modo claro
const isWin81 = navigator.userAgent.includes('Windows NT 6.3');
const savedTheme = localStorage.getItem('app-theme');

if (savedTheme === 'light') {
  document.documentElement.classList.remove('dark');
} else if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else if (isWin81) {
  // En Windows 8.1 forzamos modo claro por problemas de renderizado ClearType
  document.documentElement.classList.remove('dark');
} else {
  // Por defecto mantenemos el modo oscuro original
  document.documentElement.classList.add('dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={firebaseConfig.oAuthClientId}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  </StrictMode>,
);
