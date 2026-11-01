import React, { useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';

// 「强制更新页面」按钮
// 背景：客户电脑的 Ctrl+F5 常被厂商热键占用（亮度/性能切换等），客户不会/不能强刷，
//       导致一直跑缓存里的旧 JS（"改了没效果"的常见原因）。
// 做法：清 Cache Storage → 用新的 buildId + 时间戳重新加载当前页面，绕过 HTTP 缓存。
export default function ForceUpdateButton({ className = '', compact = false }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    let buildId = '';
    try {
      const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const v = await res.json();
        buildId = v?.buildId || '';
      }
    } catch { /* 网络异常就用时间戳 */ }

    // 清掉浏览器可能缓存的静态资源（我们没注册 SW，但有些环境会有旧 cache）
    try {
      if (window.caches?.keys) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
    } catch { /* 忽略 */ }

    const base = location.pathname.replace(/[^/]*$/, '');
    const qs = `v=${encodeURIComponent(buildId || Date.now().toString(36))}&t=${Date.now()}`;
    const hash = location.hash || '';
    // replace：不在历史里留一堆刷新记录
    location.replace(`${base}?${qs}${hash}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={t('清除缓存并重新加载最新版本（等同于强制刷新）')}
      className={
        compact
          ? `px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60 ${className}`
          : `px-3 py-1.5 text-sm font-semibold rounded-lg border-2 border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer bg-white disabled:opacity-60 ${className}`
      }
    >
      {busy ? t('正在更新…') : `🔄 ${t('强制更新')}`}
    </button>
  );
}
