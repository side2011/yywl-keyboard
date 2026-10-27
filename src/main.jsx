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
installLogCapture()

// 老浏览器检测：daisyUI 5 的样式依赖 oklch()/color-mix()（Chrome 111+）。
// 老引擎会把颜色和边框全丢掉，界面看起来"没有轮廓线"，客户会以为程序坏了。
// 这里检测到就直接挂一条醒目的提示，并给出升级/用桌面版的建议。
(function warnLegacyBrowser() {
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
