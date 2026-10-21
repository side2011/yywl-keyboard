// 连接前的引导弹窗：把"浏览器会弹出设备列表 → 要点设备 → 再点连接"讲清楚。
// 客户最容易卡住的一步就是：点了「连接键盘」，弹框出来后不知道要选设备，
// 于是停在"连接中"以为程序坏了。
import { useEffect } from 'react';

const TEXT = {
  zh: {
    title: '接下来会弹出「选择设备」窗口',
    sub: '这是浏览器的安全授权，完成这步才能读取键盘配置',
    steps: [
      ['1', '在列表里点一下', '「USB Keyboard」'],
      ['2', '再点右下角的', '【连接】'],
      ['3', '没看到设备？', '拔插 USB 线后重试'],
    ],
    note: '点【取消】会停在当前页，不会进入配置页',
    ok: '我知道了，开始选择',
    cancel: '取消',
    hide: '不再提示',
    noPicker: '如果没有任何弹窗出现，请改用 Chrome / Edge 浏览器打开',
  },
  en: {
    title: 'A "Select a device" window will pop up',
    sub: 'That is the browser permission — you must finish it before reading the keypad',
    steps: [
      ['1', 'Click the row', '"USB Keyboard"'],
      ['2', 'Then click', '"Connect"'],
      ['3', 'No device listed?', 'Unplug and re-plug the USB cable'],
    ],
    note: 'Clicking "Cancel" keeps you on this page',
    ok: 'Got it, open the picker',
    cancel: 'Cancel',
    hide: "Don't show again",
    noPicker: 'If no window appears at all, please open this page in Chrome / Edge',
  },
};

// 4 段循环动画（纯 CSS，无图片/无 JS 定时器）：
// 插线 → 点连接 → 选中设备 → 进入配置
function GuideAnimation() {
  return (
    <div className="yy-guide-anim" aria-hidden="true">
      <svg viewBox="0 0 320 120" role="presentation">
        {/* 第 1 段：插上 USB 线 */}
        <g className="yy-phase yy-p1">
          <rect x="18" y="46" width="96" height="50" rx="8" fill="#eef2ff" stroke="#c7d2fe" />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <rect key={`${r}-${c}`} x={26 + c * 28} y={54 + r * 14} width="20" height="9" rx="2" fill="#c7d2fe" />
            )),
          )}
          <path d="M114 71 H150" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
          <rect x="150" y="62" width="18" height="18" rx="4" fill="#6366f1" />
          <text x="196" y="76" fontSize="12" fill="#4338ca">插上 USB 线</text>
        </g>

        {/* 第 2 段：点「连接键盘」 */}
        <g className="yy-phase yy-p2">
          <rect x="18" y="48" width="180" height="40" rx="10" fill="#6366f1" />
          <text x="72" y="73" fontSize="13" fill="#ffffff" fontWeight="600">连接键盘</text>
          <g className="yy-cursor yy-c2">
            <path d="M196 88 l0 18 l5 -5 l4 8 l5 -3 l-4 -8 l7 -1 z" fill="#1e293b" />
          </g>
          <text x="228" y="78" fontSize="12" fill="#4338ca">点击按钮</text>
        </g>

        {/* 第 3 段：在选择框里选中设备并点连接 */}
        <g className="yy-phase yy-p3">
          <rect x="18" y="26" width="180" height="72" rx="8" fill="#ffffff" stroke="#cbd5e1" />
          <rect x="26" y="34" width="164" height="22" rx="4" fill="#dbeafe" stroke="#3b82f6" />
          <text x="34" y="49" fontSize="11" fill="#1d4ed8" fontWeight="600">USB Keyboard - 已配对</text>
          <g className="yy-cursor yy-c3">
            <path d="M206 84 l0 18 l5 -5 l4 8 l5 -3 l-4 -8 l7 -1 z" fill="#1e293b" />
          </g>
          <rect x="222" y="86" width="52" height="22" rx="11" fill="#2563eb" />
          <text x="236" y="101" fontSize="11" fill="#ffffff" fontWeight="600">连接</text>
        </g>

        {/* 第 4 段：进入配置页 */}
        <g className="yy-phase yy-p4">
          <circle cx="60" cy="72" r="22" fill="#dcfce7" />
          <path d="M50 72 l7 7 l14 -15" stroke="#16a34a" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="98" y="77" fontSize="13" fill="#15803d" fontWeight="600">进入配置页面</text>
        </g>
      </svg>
    </div>
  );
}

export default function ConnectGuideModal({ open, lang = 'zh', onConfirm, onCancel, onHideForever }) {
  const s = TEXT[lang === 'en' ? 'en' : 'zh'];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="yy-guide-mask" role="dialog" aria-modal="true" aria-label={s.title}>
      <div className="yy-guide-box">
        <div className="yy-guide-title">{s.title}</div>
        <div className="yy-guide-sub">{s.sub}</div>

        <GuideAnimation />

        <ul className="yy-guide-steps">
          {s.steps.map(([num, a, b]) => (
            <li key={num}>
              <span className="yy-guide-num">{num}</span>
              <span>{a} <b>{b}</b></span>
            </li>
          ))}
        </ul>

        <div className="yy-guide-note">⚠ {s.note}</div>
        <div className="yy-guide-note yy-guide-note-2">💡 {s.noPicker}</div>

        <div className="yy-guide-actions">
          <label className="yy-guide-hide">
            <input type="checkbox" onChange={(e) => { if (e.target.checked && onHideForever) onHideForever(); }} />
            {s.hide}
          </label>
          <div className="yy-guide-btns">
            <button type="button" className="yy-guide-btn" onClick={onCancel}>{s.cancel}</button>
            <button type="button" className="yy-guide-btn yy-guide-btn-primary" onClick={onConfirm}>{s.ok}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
