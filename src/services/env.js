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

// 说明文档地址。
//
// 为什么桌面版要用线上绝对地址，而不是 /actions-guide.html：
//   桌面版的主窗口开启 target=_blank 时，主进程的 setWindowOpenHandler 会拦截。
//   早期版本（<=1.2.1）的逻辑是"本地地址直接拒绝、外部地址交给系统浏览器"，
//   所以本地相对链接点下去毫无反应。指到线上绝对地址后，新旧版本都能正常
//   在系统浏览器里打开。网页版则仍用站内相对路径，离线也能看。
export const GUIDE_ORIGIN = 'https://key.itytsoft.com';

export function guideUrl(lang) {
  const file = lang === 'en' ? 'actions-guide-en.html' : 'actions-guide.html';
  return isDesktopApp() ? `${GUIDE_ORIGIN}/${file}` : `/${file}`;
}

