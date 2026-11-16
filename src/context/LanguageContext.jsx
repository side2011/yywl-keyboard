// src/context/LanguageContext.jsx
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { translate } from '../i18n';

const LanguageContext = createContext(null);

// 桌面版：托盘菜单与顶部菜单是**原生菜单**，网页改不了它们 → 通知主进程一起切
// 主进程提供 /__lang/set?lang=xx（见 desktop-main.cjs）
function notifyDesktopLang(lang) {
  try {
    if (typeof navigator !== 'undefined' && /YYWLDesktop/i.test(navigator.userAgent || '')) {
      const base = (import.meta && import.meta.env && import.meta.env.BASE_URL) || '/';
      fetch(base + '__lang/set?lang=' + lang, { cache: 'no-store' }).catch(() => {});
    }
  } catch { /* 忽略 */ }
}

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

  // 首次加载把当前语言同步给主进程（旧版本升级后原生菜单也是对的）
  useState(() => { notifyDesktopLang(lang); return null; });

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next = prev === 'zh' ? 'en' : 'zh';
      try { localStorage.setItem('yywl-lang', next); } catch { /* noop */ }
      notifyDesktopLang(next);
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
