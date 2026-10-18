// src/services/env.js
// 运行环境判断：桌面版会在 UA 里带 YYWLDesktop/<版本> 标记（见 desktop-main.cjs）

export function isDesktopApp() {
  return typeof navigator !== 'undefined' && /YYWLDesktop/i.test(navigator.userAgent || '');
}

// 桌面版里点「配置扩展动作」时，让主进程把扩展动作窗口打开。
// 用本地服务的特殊路径实现，避免为此再给主窗口加 preload。
export async function openActionsWindow() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}__actions/open`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}
