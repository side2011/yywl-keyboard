// 旧浏览器兼容提示横幅
// 背景：个别客户机器上按钮/配色显示异常（渐变不渲染、daisyUI 的 oklch 变量不支持），
// 排查成本很高。这里在检测到内核过旧时直接在页面顶部提示，让客户先升级浏览器。
import React from 'react';
import { useLang } from '../context/LanguageContext';

function detectOldBrowser() {
  try {
    const css = window.CSS;
    if (!css || typeof css.supports !== 'function') return true;   // 太老，连 CSS.supports 都没有
    // oklch() 需要 Chrome/Edge 111+、Safari 15.4+；不支持时部分配色会变成空白
    const hasOklch = css.supports('color', 'oklch(0 0 0)');
    // @layer 需要 Chrome 99+
    const hasLayer = css.supports('at-rule', '@layer') || css.supports('(background: red) and (color: red)');
    // 渐变（老内核 / 高对比度模式下可能不渲染）
    const hasGradient = css.supports('background-image', 'linear-gradient(to right, #000, #fff)');
    return !hasOklch || !hasLayer || !hasGradient;
  } catch {
    return false;
  }
}

export default function BrowserCompatBanner() {
  const { t } = useLang();
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem('yywl-compat-dismissed') === '1'; } catch { return false; }
  });
  const [old, setOld] = React.useState(false);

  React.useEffect(() => {
    setOld(detectOldBrowser());
  }, []);

  if (!old || dismissed) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-[13px] text-amber-900 flex items-start gap-2">
      <span className="flex-shrink-0">⚠️</span>
      <div className="flex-1 leading-snug">
        {t('检测到浏览器版本较旧，部分按钮/配色可能显示异常。建议升级到 Chrome / Edge 111 以上（或最新版），显示与保存功能会更稳。')}
      </div>
      <button
        className="flex-shrink-0 text-amber-700 hover:text-amber-900 underline cursor-pointer"
        onClick={() => {
          setDismissed(true);
          try { localStorage.setItem('yywl-compat-dismissed', '1'); } catch { /* 忽略 */ }
        }}
      >
        {t('知道了')}
      </button>
    </div>
  );
}
