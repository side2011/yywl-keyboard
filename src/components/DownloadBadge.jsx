// src/components/DownloadBadge.jsx
// 左上角的「软件下载」入口: 引导客户下载把整个网页打包进去的桌面版
// (内网/离线环境只能用桌面版, 因为 WebHID 需要系统浏览器的安全上下文)
//
// 注意: 桌面版自身运行时不显示这个入口 (UA 带 YYWLDesktop 标记)

import React from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import pkg from '../../package.json';

// 发布到 nginx /ws/download/ 下; 用 BASE_URL 拼接以便 dev/生产自动适配
// 文件名跟随 package.json 的 version 自动变化, 发版时只需改 version 并重新打包上传
const DESKTOP_PACKAGE = `download/yywlkey-config-${pkg.version}-win-x64.zip`;

export default function DownloadBadge() {
  const { t } = useLang();

  // 已经在桌面版里了 → 不需要再下载一次
  if (typeof navigator !== 'undefined' && /YYWLDesktop/i.test(navigator.userAgent || '')) {
    return null;
  }

  const href = `${import.meta.env.BASE_URL}${DESKTOP_PACKAGE}`;

  return (
    <a
      href={href}
      download
      className="fixed top-4 left-4 z-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 text-sm font-semibold text-gray-700 hover:text-indigo-600 transition-all active:scale-[0.98]"
      title={t('Windows 桌面版 · 离线可用，适合内网环境')}
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
