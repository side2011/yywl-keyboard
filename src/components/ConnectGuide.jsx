// 连接前的引导弹窗：把"浏览器会弹出设备列表 → 要点设备 → 再点连接"讲清楚。
// 客户最容易卡住的一步就是：点了「连接键盘」，弹框出来后不知道要选设备，
// 于是停在"连接中"以为程序坏了。
import { useEffect, useState, useRef } from 'react';

const TEXT = {
  zh: {
    title: '接下来会弹出「选择设备」窗口',
    sub: '这是浏览器的安全授权，完成这步才能读取键盘配置',
    steps: [
      ['1', '在列表里点一下', '你的键盘（名称可能是 USB Keyboard / YYWL 等）'],
      ['2', '再点右下角的', '【连接】'],
      ['3', '没看到设备？', '拔插 USB 线后重试'],
    ],
    note: '点【取消】会停在当前页，不会进入配置页',
    ok: '我知道了，开始选择',
  auto: '秒后自动继续（不用点按钮）',
    cancel: '取消',
    hide: '不再提示',
    noPicker: '如果没有任何弹窗出现，请改用 Chrome / Edge 浏览器打开',
  },
  en: {
    title: 'A "Select a device" window will pop up',
    sub: 'That is the browser permission — you must finish it before reading the keypad',
    steps: [
      ['1', 'Click your keypad in the list', '(the name may be "USB Keyboard", "YYWL", etc.)'],
      ['2', 'Then click', '"Connect"'],
      ['3', 'No device listed?', 'Unplug and re-plug the USB cable'],
    ],
    note: 'Clicking "Cancel" keeps you on this page',
    ok: 'Got it, open the picker',
  auto: 's — continuing automatically',
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
          <text x="34" y="49" fontSize="11" fill="#1d4ed8" fontWeight="600">你的键盘 · 已配对</text>
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

  // 倒计时自动继续：客户经常停在提示页不动，6 秒后自动进入设备选择
  const AUTO_SECONDS = 6;
  const [left, setLeft] = useState(AUTO_SECONDS);
  const [expired, setExpired] = useState(false);
  const timerRef = useRef(null);
  const confirmedRef = useRef(false);
  useEffect(() => {
    if (!open) return undefined;
    setLeft(AUTO_SECONDS);
    setExpired(false);
    confirmedRef.current = false;
    timerRef.current = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(timerRef.current);
          // requestDevice 需要"用户手势"：定时器里直接调用会抛 NotAllowedError（客户看到红色报错），
          // 所以倒计时结束只进入"等你点一下"的状态，点页面任何地方都能继续
          setExpired(true);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [open, onConfirm]);

  // 倒计时结束后：点页面任何地方 / 按任意键都能继续（这样满足"用户手势"要求）
  useEffect(() => {
    if (!open || !expired) return undefined;
    const fire = () => {
      if (confirmedRef.current) return;
      confirmedRef.current = true;
      onConfirm();
    };
    window.addEventListener('pointerdown', fire, { once: true, capture: true });
    window.addEventListener('keydown', fire, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', fire, true);
      window.removeEventListener('keydown', fire, true);
    };
  }, [open, expired, onConfirm]);

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

            {/* 倒计时提示：客户经常停在这里不动，明确告诉他们不用点也会继续 */}
            {(left > 0) ? (
              <div className="yy-guide-auto">
                <span className="yy-guide-auto-text">{lang === 'en' ? `Continuing automatically in ${left}s — you can also tap the button` : `${left} 秒后自动继续，不用点按钮`}</span>
                <span className="yy-guide-auto-bar"><i style={{ width: `${((AUTO_SECONDS - left) / AUTO_SECONDS) * 100}%` }} /></span>
              </div>
          ) : (
            <div className="yy-guide-auto">
              <span className="yy-guide-auto-text yy-guide-auto-ready">{lang === 'en' ? 'Tap anywhere on this page to open the device picker' : '👉 点一下页面任意位置，立即打开设备选择'}</span>
            </div>
          )}
        <div className="yy-guide-actions">
          <label className="yy-guide-hide">
            <input type="checkbox" onChange={(e) => { if (e.target.checked && onHideForever) onHideForever(); }} />
            {s.hide}
          </label>
          <div className="yy-guide-btns">
            <button type="button" className="yy-guide-btn" onClick={onCancel}>{s.cancel}</button>
            <button type="button" className="yy-guide-btn yy-guide-btn-primary"
              onClick={() => { confirmedRef.current = true; onConfirm(); }}>
              {left > 0 ? `${s.ok}（${left}）` : (lang === 'en' ? 'Tap here to continue' : '点这里继续')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
