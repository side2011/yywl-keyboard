// src/context/LanguageContext.jsx
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { translate } from '../i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem('yywl-lang');
      if (saved) return saved;
    } catch { /* noop */ }
    // 自动检测系统语言：中文系统默认中文，其他默认英文
    const sysLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return sysLang.startsWith('zh') ? 'zh' : 'en';
  });

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next = prev === 'zh' ? 'en' : 'zh';
      try { localStorage.setItem('yywl-lang', next); } catch { /* noop */ }
      return next;
    });
  }, []);

  const t = useCallback((key, params) => translate(key, lang, params), [lang]);

  const value = useMemo(() => ({ lang, t, toggleLang }), [lang, t, toggleLang]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
