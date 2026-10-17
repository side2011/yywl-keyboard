// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DeviceProvider } from './context/DeviceContext';
import { LanguageProvider } from './context/LanguageContext';
import KeyboardConnector from './components/KeyboardConnector';
import KeyboardConfigurator from './components/KeyboardConfigurator';
import BtConfigurator from './components/BtConfigurator';
import KeyTestPage from './components/KeyTestPage';
import MicGuidePage from './components/MicGuidePage';
import DownloadBadge from './components/DownloadBadge';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <BrowserRouter basename="/" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider>
        <DeviceProvider>
          <div className="min-h-screen">
            <DownloadBadge />
            <Routes>
              <Route path="/" element={<KeyboardConnector />} />
              <Route path="/customize" element={<KeyboardConfigurator />} />
              <Route path="/bt" element={<BtConfigurator />} />
              <Route path="/keytest" element={<KeyTestPage />} />
              <Route path="/mic" element={<MicGuidePage />} />
            </Routes>
            <Toaster
              position="top-center"
              toastOptions={{
                duration: 3000,
                style: {
                  fontSize: '16px',
                  fontWeight: '600',
                  padding: '14px 24px',
                  borderRadius: '12px',
                  maxWidth: '500px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                },
                success: {
                  style: {
                    background: '#f0fdf4',
                    color: '#166534',
                    border: '1px solid #86efac',
                  },
                  iconTheme: { primary: '#22c55e', secondary: '#f0fdf4' },
                },
                error: {
                  style: {
                    background: '#fef2f2',
                    color: '#991b1b',
                    border: '1px solid #fca5a5',
                  },
                  iconTheme: { primary: '#ef4444', secondary: '#fef2f2' },
                  duration: 4000,
                },
                loading: {
                  style: {
                    background: '#eff6ff',
                    color: '#1e40af',
                    border: '1px solid #93c5fd',
                  },
                  iconTheme: { primary: '#3b82f6', secondary: '#eff6ff' },
                },
              }}
            />
          </div>
        </DeviceProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
