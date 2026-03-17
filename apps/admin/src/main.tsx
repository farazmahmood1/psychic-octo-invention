import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './lib/auth-context';
import { ToastProvider } from './components/toast';
import { RealtimeProvider } from './lib/realtime-context';
import { ThemeProvider } from './lib/theme-context';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <RealtimeProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </RealtimeProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
