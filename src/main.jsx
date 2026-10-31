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
// 版本自更新：
//   · 启动时 / 页面重新可见 / 每 60 秒 都检查一次 version.json（no-store）
//   · 在连接页（/）直接自动刷新
//   · 在配置页弹一条可点提示条（避免打断正在改的配置）
const RELOADED_KEY = 'yywl-reloaded-for';
const NOTICE_ID = 'yywl-new-build-notice';

function yywlBasePath() {
  return location.pathname.replace(/[^/]*$/, '');
}

function showNewBuildNotice(buildId) {
  if (document.getElementById(NOTICE_ID)) return;
  const bar = document.createElement('div');
  bar.id = NOTICE_ID;
  bar.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483000',
    'background:#4f46e5', 'color:#fff', 'padding:10px 14px', 'border-radius:12px',
    'box-shadow:0 8px 24px rgba(0,0,0,.25)', 'font:600 13px/1.5 "Microsoft YaHei",system-ui,sans-serif',
    'display:flex', 'align-items:center', 'gap:10px', 'max-width:320px',
  ].join(';');
  bar.innerHTML = '<span>有新版本可用</span>';
  const btn = document.createElement('button');
  btn.textContent = '立即刷新';
  btn.style.cssText = 'background:#fff;color:#4f46e5;border:0;border-radius:8px;padding:5px 10px;font-weight:700;font-size:12px;cursor:pointer';
  btn.onclick = () => {
    sessionStorage.setItem(RELOADED_KEY, buildId);
    location.replace(`${yywlBasePath()}?v=${buildId}${location.hash || ''}`);
  };
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'background:transparent;border:0;color:#c7d2fe;font-size:16px;line-height:1;cursor:pointer';
  close.onclick = () => bar.remove();
  bar.appendChild(btn);
  bar.appendChild(close);
  document.body.appendChild(bar);
}

let checkingBuild = false;
function checkForNewBuild() {
  try {
    const meta = document.querySelector('meta[name="yywl-build-id"]');
    const mine = meta ? meta.getAttribute('content') : '';
    if (!mine || checkingBuild) return;
    checkingBuild = true;
    const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        checkingBuild = false;
        if (!v || !v.buildId || v.buildId === mine) return;
        if (sessionStorage.getItem(RELOADED_KEY) === v.buildId) return;
        console.warn('[YYWL] 发现新版本:', mine, '->', v.buildId);
        // 连接页没有正在编辑的内容 → 直接刷新；配置页先提示
        const onConnectPage = /^\/(index\.html)?$/.test(location.pathname) || location.pathname.endsWith('/');
        if (onConnectPage) {
          sessionStorage.setItem(RELOADED_KEY, v.buildId);
          location.replace(`${yywlBasePath()}?v=${v.buildId}${location.hash || ''}`);
        } else {
          showNewBuildNotice(v.buildId);
        }
      })
      .catch(() => { checkingBuild = false; });
  } catch { checkingBuild = false; }
}

// 定时 + 回到前台时检查（客户经常几天不关页面）
setInterval(checkForNewBuild, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForNewBuild();
});
window.addEventListener('focus', checkForNewBuild);

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
