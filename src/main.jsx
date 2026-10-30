import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// MiSans 小米字体 — 免费商用授权, unicode-range 切片 woff2 (浏览器只下载用到的切片)
// 字重覆盖: 400(Regular) 500(Medium) 600(Demibold) 700(Bold), 与 UI 的 font-medium/semibold/bold 对应
import 'misans/lib/Normal/MiSans-Regular.min.css'
import 'misans/lib/Normal/MiSans-Medium.min.css'
import 'misans/lib/Normal/MiSans-Demibold.min.css'
import 'misans/lib/Normal/MiSans-Bold.min.css'
import App from './App.jsx'
import { installLogCapture } from './services/log-buffer'

// 把协议/动作相关日志留一份在内存里，出错时能一键导出给技术支持
// 客户经常长期不关页面 → 一直跑旧 JS（改完的东西看不到）。
// 启动时拉一次 version.json（no-store），buildId 不一致就强制重载一次。
function checkForNewBuild() {
  try {
    const meta = document.querySelector('meta[name="yywl-build-id"]');
    const mine = meta ? meta.getAttribute('content') : '';
    if (!mine) return;
    const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!v || !v.buildId || v.buildId === mine) return;
        if (sessionStorage.getItem('yywl-reloaded-for') === v.buildId) return;
        sessionStorage.setItem('yywl-reloaded-for', v.buildId);
        console.warn('[YYWL] 发现新版本，自动刷新:', mine, '->', v.buildId);
        const base = location.pathname.replace(/[^/]*$/, '');
        location.replace(`${base}?v=${v.buildId}${location.hash || ''}`);
      })
      .catch(() => { /* 离线/网络异常就算了 */ });
  } catch { /* 忽略 */ }
}

installLogCapture();

// 老浏览器检测：daisyUI 5 的样式依赖 oklch()/color-mix()（Chrome 111+）。
// 老引擎会把颜色和边框全丢掉，界面看起来"没有轮廓线"，客户会以为程序坏了。
// 这里检测到就直接挂一条醒目的提示，并给出升级/用桌面版的建议。
;(function warnLegacyBrowser() {
  try {
    const ok = window.CSS && CSS.supports && CSS.supports('color', 'oklch(0% 0 0)');
    if (ok) return;
    const ua = navigator.userAgent;
    const m = ua.match(/(Chrome|Edg|Firefox|Version)\/(\d+)/);
    const label = m ? `${m[1]} ${m[2]}` : '当前浏览器';
    const tip = document.createElement('div');
    tip.className = 'legacy-browser-tip';
    tip.innerHTML =
      `⚠ 检测到 <b>${label}</b> 版本过低，界面样式无法正常显示（缺少边框/底色）。` +
      `请升级到 <b>Chrome / Edge 111 及以上</b>，或直接使用桌面版客户端。` +
      `<a href="https://key.itytsoft.com/download.html" target="_blank" rel="noreferrer">去下载桌面版</a>`;
    document.body.appendChild(tip);
    document.body.style.paddingTop = '42px';
  } catch { /* 忽略 */ }
})();

checkForNewBuild();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
