// src/components/DownloadBadge.jsx
// 「软件下载」入口 → 跳转到平台自适应下载页 (/download.html)
// 下载页读取 /download/manifest.json 自动识别系统并推荐对应平台包,
// 所以这里不用关心版本号与文件名 —— 发版只改 manifest 和包文件本身。
//
// 显示规则: 只在「没有顶栏下载入口」的页面显示 (连接页 / 按键测试页)。
// 配置页 (/customize、/bt) 顶栏已经有「⬇ 软件下载」按钮, 这里不重复显示,
// 否则会像之前那样和左上角的型号徽章挤在一起。
//
// 桌面版自身 (UA 带 YYWLDesktop) 不显示。

import React from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';

const DOWNLOAD_PAGE = 'download.html';
// 这些路由的顶栏自带下载按钮
const ROUTES_WITH_INLINE_ENTRY = ['/customize', '/bt'];

export default function DownloadBadge() {
  const { t } = useLang();
  const { pathname } = useLocation();

  // 已经在桌面版里了 → 不需要再下载一次
  if (typeof navigator !== 'undefined' && /YYWLDesktop/i.test(navigator.userAgent || '')) {
    return null;
  }
  // 配置页顶栏已有入口 → 不重复显示
  if (ROUTES_WITH_INLINE_ENTRY.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const href = `${import.meta.env.BASE_URL}${DOWNLOAD_PAGE}`;

  return (
    <a
      href={href}
      className="fixed top-4 left-4 z-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 text-sm font-semibold text-gray-700 hover:text-indigo-600 transition-all active:scale-[0.98]"
      title={t('Windows / macOS / Linux 桌面版 · 离线可用，适合内网环境')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {t('软件下载')}
    </a>
  );
}
