// src/components/KeyTestPage.jsx — 独立按键测试页面（无需连接设备）
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';

const MAIN_ROWS = [
  [
    { c: 'F13', l: 'F13' }, { c: 'F14', l: 'F14' }, { c: 'F15', l: 'F15' }, { c: 'F16', l: 'F16' },
    { c: 'F17', l: 'F17' }, { c: 'F18', l: 'F18' }, { c: 'F19', l: 'F19' }, { c: 'F20', l: 'F20' },
    { c: 'F21', l: 'F21' }, { c: 'F22', l: 'F22' }, { c: 'F23', l: 'F23' }, { c: 'F24', l: 'F24' },
  ],
  [
    { c: 'Escape', l: 'Esc' },
    { c: 'F1', l: 'F1' }, { c: 'F2', l: 'F2' }, { c: 'F3', l: 'F3' }, { c: 'F4', l: 'F4' },
    { c: 'F5', l: 'F5' }, { c: 'F6', l: 'F6' }, { c: 'F7', l: 'F7' }, { c: 'F8', l: 'F8' },
    { c: 'F9', l: 'F9' }, { c: 'F10', l: 'F10' }, { c: 'F11', l: 'F11' }, { c: 'F12', l: 'F12' },
  ],
  [
    { c: 'Backquote', l: '`' }, { c: 'Digit1', l: '1' }, { c: 'Digit2', l: '2' },
    { c: 'Digit3', l: '3' }, { c: 'Digit4', l: '4' }, { c: 'Digit5', l: '5' },
    { c: 'Digit6', l: '6' }, { c: 'Digit7', l: '7' }, { c: 'Digit8', l: '8' },
    { c: 'Digit9', l: '9' }, { c: 'Digit0', l: '0' },
    { c: 'Minus', l: '-' }, { c: 'Equal', l: '=' },
    { c: 'Backspace', l: '⌫ Back', w: 2 },
  ],
  [
    { c: 'Tab', l: 'Tab', w: 1.5 },
    { c: 'KeyQ', l: 'Q' }, { c: 'KeyW', l: 'W' }, { c: 'KeyE', l: 'E' }, { c: 'KeyR', l: 'R' },
    { c: 'KeyT', l: 'T' }, { c: 'KeyY', l: 'Y' }, { c: 'KeyU', l: 'U' }, { c: 'KeyI', l: 'I' },
    { c: 'KeyO', l: 'O' }, { c: 'KeyP', l: 'P' },
    { c: 'BracketLeft', l: '[' }, { c: 'BracketRight', l: ']' },
    { c: 'Backslash', l: '\\', w: 1.5 },
  ],
  [
    { c: 'CapsLock', l: 'Caps', w: 1.75 },
    { c: 'KeyA', l: 'A' }, { c: 'KeyS', l: 'S' }, { c: 'KeyD', l: 'D' }, { c: 'KeyF', l: 'F' },
    { c: 'KeyG', l: 'G' }, { c: 'KeyH', l: 'H' }, { c: 'KeyJ', l: 'J' }, { c: 'KeyK', l: 'K' },
    { c: 'KeyL', l: 'L' },
    { c: 'Semicolon', l: ';' }, { c: 'Quote', l: "'" },
    { c: 'Enter', l: 'Enter ↵', w: 2.25 },
  ],
  [
    { c: 'ShiftLeft', l: 'Shift', w: 2.25 },
    { c: 'KeyZ', l: 'Z' }, { c: 'KeyX', l: 'X' }, { c: 'KeyC', l: 'C' }, { c: 'KeyV', l: 'V' },
    { c: 'KeyB', l: 'B' }, { c: 'KeyN', l: 'N' }, { c: 'KeyM', l: 'M' },
    { c: 'Comma', l: ',' }, { c: 'Period', l: '.' }, { c: 'Slash', l: '/' },
    { c: 'ShiftRight', l: 'Shift', w: 2.75 },
  ],
  [
    { c: 'ControlLeft', l: 'Ctrl', w: 1.25 },
    { c: 'MetaLeft', l: 'Win', w: 1.25 },
    { c: 'AltLeft', l: 'Alt', w: 1.25 },
    { c: 'Space', l: 'Space', w: 6.25 },
    { c: 'AltRight', l: 'Alt', w: 1.25 },
    { c: 'MetaRight', l: 'Win', w: 1.25 },
    { c: 'ContextMenu', l: 'Menu', w: 1.25 },
    { c: 'ControlRight', l: 'Ctrl', w: 1.25 },
  ],
];

// 导航键区 — 独立于主键盘的 3 列区域（顶行对齐功能行，其余对齐数字/Tab行）
const NAV_ROWS = [
  [
    { c: 'PrintScreen', l: 'PrtSc' }, { c: 'ScrollLock', l: 'ScrLk' }, { c: 'Pause', l: 'Pause' },
  ],
  [
    { c: 'Insert', l: 'Ins' }, { c: 'Home', l: 'Home' }, { c: 'PageUp', l: 'PgUp' },
  ],
  [
    { c: 'Delete', l: 'Del' }, { c: 'End', l: 'End' }, { c: 'PageDown', l: 'PgDn' },
  ],
];

// 小键盘 — 行号从2开始（行1是68px空白占位，对齐主键盘F13+F1行）
const NUMPAD_KEYS = [
  { c: 'NumLock', l: 'NumLock', gr: 2, gc: 1 },
  { c: 'NumpadDivide', l: '/', gr: 2, gc: 2 },
  { c: 'NumpadMultiply', l: '*', gr: 2, gc: 3 },
  { c: 'NumpadSubtract', l: '-', gr: 2, gc: 4 },
  { c: 'Numpad7', l: '7', gr: 3, gc: 1 },
  { c: 'Numpad8', l: '8', gr: 3, gc: 2 },
  { c: 'Numpad9', l: '9', gr: 3, gc: 3 },
  { c: 'NumpadAdd', l: '+', gr: 3, gc: 4, grs: 2 },
  { c: 'Numpad4', l: '4', gr: 4, gc: 1 },
  { c: 'Numpad5', l: '5', gr: 4, gc: 2 },
  { c: 'Numpad6', l: '6', gr: 4, gc: 3 },
  { c: 'Numpad1', l: '1', gr: 5, gc: 1 },
  { c: 'Numpad2', l: '2', gr: 5, gc: 2 },
  { c: 'Numpad3', l: '3', gr: 5, gc: 3 },
  { c: 'NumpadEnter', l: 'Enter', gr: 5, gc: 4, grs: 2 },
  { c: 'Numpad0', l: '0', gr: 6, gc: 1, gcs: 2 },
  { c: 'NumpadDecimal', l: '.', gr: 6, gc: 3 },
];

// 可选按键音效（均为 Mixkit 免版权可商用素材，存放于 public/sounds/）
const SOUND_OPTIONS = [
  { id: '1', file: 'sound1.mp3', zh: '声音1 · 打字机（硬）', en: 'Sound 1 · Typewriter Hard' },
  { id: '2', file: 'sound2.mp3', zh: '声音2 · 打字机（软）', en: 'Sound 2 · Typewriter Soft' },
  { id: '3', file: 'sound3.mp3', zh: '声音3 · 笔记本（硬单击）', en: 'Sound 3 · Laptop Hard Click' },
  { id: '4', file: 'sound4.mp3', zh: '声音4 · 笔记本（单击）', en: 'Sound 4 · Laptop Click' },
  { id: '5', file: 'sound5.mp3', zh: '声音5 · 塑料脆响', en: 'Sound 5 · Plastic Snap' },
];

// 按键三态样式：正按下(深靛蓝) / 已测过(中黄) / 未测(白)
function keyClass(isPressed, tested) {
  if (isPressed) return 'bg-indigo-500 border-indigo-600 text-white shadow-lg shadow-indigo-200 scale-[0.96]';
  if (tested) return 'bg-amber-100 border-amber-300 text-amber-800 shadow-sm';
  return 'bg-white border-gray-300 text-gray-700 shadow-sm hover:bg-gray-50';
}
function countClass(isPressed, tested) {
  if (isPressed) return 'text-indigo-200';
  if (tested) return 'text-amber-600';
  return 'text-gray-400';
}

function KeyTestPage() {
  const { t, lang, toggleLang } = useLang();
  const navigate = useNavigate();

  const [pressed, setPressed] = useState(() => new Set());
  const [counts, setCounts] = useState({});
  const [history, setHistory] = useState([]);
  const timestampsRef = useRef([]);
  const [kpm, setKpm] = useState(0);
  const [capsOn, setCapsOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const [selectedSound, setSelectedSound] = useState('1');
  const selectedSoundRef = useRef('1');
  const audioCtxRef = useRef(null);
  const noiseBufferRef = useRef(null);
  const soundCacheRef = useRef({}); // id -> AudioBuffer | 'loading'
  const preloadedRef = useRef(false);
  const [keyLog, setKeyLog] = useState([]);
  const pressTimeRef = useRef({});

  // CSS缩放适配
  const kbInnerRef = useRef(null);
  const containerRef = useRef(null);
  const [kbScale, setKbScale] = useState(1);
  const [kbHeight, setKbHeight] = useState(0);

  // 懒创建/恢复 AudioContext
  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }, []);

  // 加载并解码指定音效到缓存（每个只解码一次）
  const loadSound = useCallback((id) => {
    try {
      if (soundCacheRef.current[id]) return;
      const opt = SOUND_OPTIONS.find(o => o.id === id) || SOUND_OPTIONS[0];
      soundCacheRef.current[id] = 'loading';
      const ctx = getCtx();
      fetch(`${import.meta.env.BASE_URL}sounds/${opt.file}`)
        .then(r => r.arrayBuffer())
        .then(ab => ctx.decodeAudioData(ab))
        .then(buf => { soundCacheRef.current[id] = buf; })
        .catch(() => { delete soundCacheRef.current[id]; });
    } catch (_) {}
  }, [getCtx]);

  // 首次播放时后台预载全部音效，之后切换即时生效
  const preloadAll = useCallback(() => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    SOUND_OPTIONS.forEach(o => loadSound(o.id));
  }, [loadSound]);

  // 合成"咔"兜底声 — 仅用于音频文件尚未解码完成的第一次按键，避免静音
  const playSynthFallback = (ctx) => {
    try {
      if (!noiseBufferRef.current) {
        const len = Math.floor(ctx.sampleRate * 0.04);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        noiseBufferRef.current = buf;
      }
      const t = ctx.currentTime;
      const click = ctx.createBufferSource();
      click.buffer = noiseBufferRef.current;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.1;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(1.0, t + 0.001);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
      click.connect(bp); bp.connect(cg); cg.connect(ctx.destination);
      click.start(t); click.stop(t + 0.03);
    } catch (_) {}
  };

  // 按键声 — 播放当前选中音效，限幅防连按破音
  const playBeep = useCallback(() => {
    try {
      const ctx = getCtx();
      preloadAll();
      const id = selectedSoundRef.current;
      const cached = soundCacheRef.current[id];
      if (!cached || cached === 'loading') { loadSound(id); playSynthFallback(ctx); return; }

      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = cached;
      const g = ctx.createGain();
      g.gain.value = 3.0; // 提升响度
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      comp.attack.value = 0.001;
      comp.release.value = 0.08;
      src.connect(g); g.connect(comp); comp.connect(ctx.destination);
      src.start(t);
    } catch (_) {}
  }, [getCtx, preloadAll, loadSound]);

  const totalPresses = useMemo(() => Object.values(counts).reduce((s, c) => s + c, 0), [counts]);
  const uniqueKeys = useMemo(() => Object.keys(counts).length, [counts]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      timestampsRef.current = timestampsRef.current.filter(ts => now - ts < 60000);
      setKpm(timestampsRef.current.length);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { selectedSoundRef.current = selectedSound; }, [selectedSound]);

  // 切换音效：更新选择 + 立即预载该音效
  const selectSound = useCallback((id) => {
    setSelectedSound(id);
    selectedSoundRef.current = id;
    loadSound(id);
  }, [loadSound]);

  // ResizeObserver: 测量容器宽度 → 计算缩放比
  useEffect(() => {
    const innerEl = kbInnerRef.current;
    const containerEl = containerRef.current;
    if (!innerEl || !containerEl) return;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === containerEl) {
          const availWidth = entry.contentRect.width;
          const naturalWidth = innerEl.scrollWidth;
          const naturalHeight = innerEl.offsetHeight;
          if (naturalWidth > 0) {
            const scale = Math.max(0.6, Math.min(1.6, availWidth / naturalWidth));
            setKbScale(scale);
            setKbHeight(naturalHeight * scale);
          }
        }
      }
    });
    ro.observe(containerEl);
    ro.observe(innerEl);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      // 阻止所有浏览器默认行为（Space滚动/点击、Enter提交/点击、Tab切焦点、F5刷新等）
      e.preventDefault();
      // 忽略浏览器自动重复（按住不放时持续触发的keydown），只计一次按下→松开
      if (e.repeat) return;
      const now = Date.now();
      setPressed(prev => {
        if (prev.has(e.code)) return prev;
        const next = new Set(prev);
        next.add(e.code);
        return next;
      });
      setCounts(prev => ({ ...prev, [e.code]: (prev[e.code] || 0) + 1 }));
      const keyLabel = e.key === ' ' ? 'Space' : (e.key || e.code);
      setHistory(prev => [{ code: e.code, label: keyLabel, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 15));
      timestampsRef.current.push(now);
      pressTimeRef.current[e.code] = now;
      setKeyLog(prev => [{ type: 'down', code: e.code, label: keyLabel, time: new Date().toLocaleTimeString(), duration: null }, ...prev].slice(0, 20));
      if (soundEnabledRef.current) playBeep();
      if (e.code === 'CapsLock') setCapsOn(prev => !prev);
    };
    const onKeyUp = (e) => {
      setPressed(prev => { const n = new Set(prev); n.delete(e.code); return n; });
      const pressTime = pressTimeRef.current[e.code];
      const now = Date.now();
      const duration = pressTime ? (now - pressTime) : null;
      const keyLabel = e.key === ' ' ? 'Space' : (e.key || e.code);
      setKeyLog(prev => [{ type: 'up', code: e.code, label: keyLabel, time: new Date().toLocaleTimeString(), duration }, ...prev].slice(0, 20));
      delete pressTimeRef.current[e.code];
    };
    const onBlur = () => setPressed(new Set());
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [playBeep]);

  const handleReset = useCallback(() => {
    setPressed(new Set()); setCounts({}); setHistory([]);
    timestampsRef.current = []; setKpm(0);
    setKeyLog([]); pressTimeRef.current = {};
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button className="text-base text-gray-400 hover:text-indigo-600 transition-colors cursor-pointer font-medium" onClick={() => navigate('/')}>{t('← 返回')}</button>
          <span className="text-lg font-bold text-gray-800">{t('按键测试')}</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold">{lang === 'en' ? 'No Device Needed' : '无需设备'}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium">{lang === 'en' ? 'Sound' : '音效'}</span>
            <select
              value={selectedSound}
              onChange={(e) => selectSound(e.target.value)}
              className="px-3 py-1.5 text-sm font-semibold border-2 border-gray-300 rounded-lg text-gray-600 bg-white hover:border-indigo-400 focus:border-indigo-500 focus:outline-none transition-colors cursor-pointer"
            >
              {SOUND_OPTIONS.map(o => (
                <option key={o.id} value={o.id}>{lang === 'en' ? o.en : o.zh}</option>
              ))}
            </select>
          </div>
          <button onClick={() => setSoundEnabled(v => !v)} className={`px-4 py-1.5 text-sm font-semibold border-2 rounded-lg transition-colors cursor-pointer ${soundEnabled ? 'border-emerald-300 text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'border-gray-300 text-gray-400 bg-gray-50 hover:bg-gray-100'}`}>
            {soundEnabled ? '🔊 声音开' : '🔕 声音关'}
          </button>
          <button onClick={toggleLang} className="px-4 py-1.5 text-sm font-semibold border-2 border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer bg-white">
            {lang === 'zh' ? 'English' : '中文'}
          </button>
        </div>
      </div>

      <div className="max-w-[96vw] mx-auto px-4 py-4 space-y-3">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 text-sm text-indigo-700 font-medium text-center">
          {lang === 'en' ? 'Press any key on your keyboard to test it. No device connection required.' : '按下键盘上的任意按键即可测试，无需连接任何设备。'}
        </div>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <StatBox label={lang === 'en' ? 'Total' : '总计'} value={totalPresses} unit={lang === 'en' ? 'presses' : '次'} color="indigo" />
          <StatBox label="KPM" value={kpm} color="violet" />
          <StatBox label={lang === 'en' ? 'Unique' : '不同按键'} value={uniqueKeys} color="emerald" />
          {capsOn && <div className="bg-amber-50 rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-bold text-amber-700 shadow-sm animate-pulse">CAPS LOCK</div>}
          <button onClick={handleReset} className="bg-white rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-500 hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer shadow-sm">
            {lang === 'en' ? '🔄 Reset' : '🔄 重置'}
          </button>
        </div>

        {history.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-xs text-gray-400 font-medium mr-1">{lang === 'en' ? 'Recent:' : '最近:'}</span>
            {history.slice(0, 10).map((h, i) => (
              <span key={`${h.time}-${i}`} className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold border ${i === 0 ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>{h.label}</span>
            ))}
          </div>
        )}

        {/* 键盘主体 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 overflow-hidden" ref={containerRef}>
          <div style={{ height: kbHeight ? `${kbHeight}px` : undefined }}>
          <div style={{
            transform: `scale(${kbScale})`,
            transformOrigin: 'left top',
            width: `${100 / kbScale}%`,
          }}>
            <div ref={kbInnerRef} style={{ display: 'flex', gap: '20px', minWidth: 'fit-content' }}>
              {/* 主键盘区 */}
              <div style={{ flex: '0 0 960px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {MAIN_ROWS.map((row, ri) => {
                  const isFnRow = ri <= 1;
                  return (
                    <React.Fragment key={ri}>
                      {ri === 2 && <div style={{ height: '4px' }} />}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(60, 1fr)', gap: '9px' }}>
                        {row.map(key => (
                          <KeyCell key={key.c} code={key.c} label={key.l} span={Math.round((key.w || 1) * 4)} h={isFnRow ? 40 : 54} pressed={pressed} counts={counts} />
                        ))}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* 导航键区 + 方向键 — 逐行对齐主键盘 */}
              <div style={{ flex: '0 0 184px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* 对齐 F13 行：空白 */}
                <div style={{ height: '40px' }} />
                {/* 对齐功能行：PrtSc / ScrLk / Pause */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  {NAV_ROWS[0].map(k => <KeyCell key={k.c} code={k.c} label={k.l} span={1} h={40} pressed={pressed} counts={counts} />)}
                </div>
                {/* 对齐主键盘数字行前的间隔 */}
                <div style={{ height: '4px' }} />
                {/* 对齐数字行：Ins / Home / PgUp */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  {NAV_ROWS[1].map(k => <KeyCell key={k.c} code={k.c} label={k.l} span={1} h={54} pressed={pressed} counts={counts} />)}
                </div>
                {/* 对齐 Tab 行：Del / End / PgDn */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  {NAV_ROWS[2].map(k => <KeyCell key={k.c} code={k.c} label={k.l} span={1} h={54} pressed={pressed} counts={counts} />)}
                </div>
                {/* 对齐 Caps 行：空白 */}
                <div style={{ height: '54px' }} />
                {/* 对齐 Shift 行：↑（贴底半高） */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', height: '54px', alignItems: 'end' }}>
                  <div />
                  <KeyCell code="ArrowUp" label="↑" span={1} h={26} pressed={pressed} counts={counts} />
                  <div />
                </div>
                {/* 对齐底行：← ↓ →（贴顶半高，紧贴 ↑） */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', height: '54px', alignItems: 'start' }}>
                  <KeyCell code="ArrowLeft" label="←" span={1} h={26} pressed={pressed} counts={counts} />
                  <KeyCell code="ArrowDown" label="↓" span={1} h={26} pressed={pressed} counts={counts} />
                  <KeyCell code="ArrowRight" label="→" span={1} h={26} pressed={pressed} counts={counts} />
                </div>
              </div>

              {/* 小键盘区 — 6行grid: 行1=88px空白(对齐F13+F1), 行2-6=54px按键行 */}
              {/* minmax(0,1fr) 强制四列严格均分，避免NumLock长单词撑开首列 */}
              <div style={{
                flex: '0 0 252px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gridTemplateRows: '88px repeat(5, 54px)',
                gap: '4px',
              }}>
                {NUMPAD_KEYS.map(k => (
                  <NumpadCell key={k.c} code={k.c} label={k.l} gr={k.gr} gc={k.gc} grs={k.grs} gcs={k.gcs} pressed={pressed} counts={counts} />
                ))}
              </div>
            </div>
          </div>
          </div>
        </div>

        {keyLog.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">{lang === 'en' ? ' Key Log' : ' 按键日志'}</span>
              <button onClick={() => setKeyLog([])} className="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer">{lang === 'en' ? 'Clear' : '清空'}</button>
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-gray-400">
                    <th className="px-4 py-2 text-left font-medium w-20">{lang === 'en' ? 'Event' : '事件'}</th>
                    <th className="px-4 py-2 text-left font-medium w-28">{lang === 'en' ? 'Key' : '按键'}</th>
                    <th className="px-4 py-2 text-left font-medium">Code</th>
                    <th className="px-4 py-2 text-left font-medium w-24">{lang === 'en' ? 'Time' : '时间'}</th>
                    <th className="px-4 py-2 text-right font-medium w-24">{lang === 'en' ? 'Duration' : '持续时间'}</th>
                  </tr>
                </thead>
                <tbody>
                  {keyLog.map((entry, i) => (
                    <tr key={i} className={`border-t border-gray-50 ${entry.type === 'down' ? 'bg-emerald-50/40' : 'bg-blue-50/40'}`}>
                      <td className="px-4 py-1.5"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${entry.type === 'down' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{entry.type === 'down' ? (lang === 'en' ? 'DOWN' : '按下') : (lang === 'en' ? 'UP' : '松开')}</span></td>
                      <td className="px-4 py-1.5 font-semibold text-gray-700">{entry.label}</td>
                      <td className="px-4 py-1.5 font-mono text-gray-500">{entry.code}</td>
                      <td className="px-4 py-1.5 text-gray-500">{entry.time}</td>
                      <td className="px-4 py-1.5 text-right font-mono tabular-nums">{entry.duration !== null ? <span className={entry.duration > 500 ? 'text-amber-600 font-bold' : 'text-gray-600'}>{entry.duration} ms</span> : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 space-y-1 pb-4">
          <p>{lang === 'en' ? 'Key codes are based on physical key positions (US QWERTY layout).' : '按键码基于物理按键位置（US QWERTY 布局）。'}</p>
          <p>{lang === 'en' ? 'Works with any USB/Bluetooth keyboard — no WebHID connection needed.' : '支持任意 USB/蓝牙键盘 — 无需 WebHID 连接。'}</p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, unit, color }) {
  const colorMap = { indigo: 'text-indigo-600', violet: 'text-violet-600', emerald: 'text-emerald-600' };
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-2.5 flex items-center gap-2 shadow-sm">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <span className={`text-xl font-extrabold tabular-nums ${colorMap[color] || 'text-gray-700'}`}>{value}</span>
      {unit && <span className="text-xs text-gray-400">{unit}</span>}
    </div>
  );
}

const KeyCell = React.memo(function KeyCell({ code, label, span, flexW, h, pressed, counts }) {
  const isPressed = pressed.has(code);
  const count = counts[code] || 0;
  const widthStyle = flexW != null
    ? { flex: `${flexW} 1 0%` }
    : { gridColumn: `span ${span || 1}` };
  return (
    <div style={{
      ...widthStyle, height: `${h}px`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      borderRadius: '8px', cursor: 'default', userSelect: 'none',
      position: 'relative', transition: 'all 0.08s ease-out', minWidth: 0, overflow: 'hidden',
      fontSize: h <= 42 ? '15px' : '16px', padding: '0 2px',
    }} className={`border-2 ${keyClass(isPressed, count > 0)}`}>
      <span className="font-bold leading-none truncate" style={{ fontSize: h <= 42 ? '14px' : '16px' }}>{label}</span>
      {count > 0 && <span className={`text-[12px] leading-none mt-0.5 font-bold ${countClass(isPressed, count > 0)}`}>{count}</span>}
    </div>
  );
}, (prev, next) => {
  // 只比较影响渲染的值: 该键的按下状态和计数
  return prev.code === next.code
    && prev.label === next.label
    && prev.span === next.span
    && prev.h === next.h
    && prev.pressed.has(prev.code) === next.pressed.has(next.code)
    && (prev.counts[prev.code] || 0) === (next.counts[next.code] || 0);
});

const NumpadCell = React.memo(function NumpadCell({ code, label, gr, gc, grs, gcs, pressed, counts }) {
  const isPressed = pressed.has(code);
  const count = counts[code] || 0;
  return (
    <div style={{
      gridRow: `${gr} / span ${grs || 1}`,
      gridColumn: `${gc} / span ${gcs || 1}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      borderRadius: '8px', cursor: 'default', userSelect: 'none',
      position: 'relative', transition: 'all 0.08s ease-out', minWidth: 0, overflow: 'hidden',
    }} className={`border-2 ${keyClass(isPressed, count > 0)}`}>
      <span className="font-bold leading-none whitespace-nowrap" style={{ fontSize: label.length > 6 ? '11px' : (label.length === 1 ? '21px' : '16px') }}>{label}</span>
      {count > 0 && <span className={`text-[12px] leading-none mt-0.5 font-bold ${countClass(isPressed, count > 0)}`}>{count}</span>}
    </div>
  );
}, (prev, next) => {
  return prev.code === next.code
    && prev.label === next.label
    && prev.gr === next.gr && prev.gc === next.gc
    && prev.grs === next.grs && prev.gcs === next.gcs
    && prev.pressed.has(prev.code) === next.pressed.has(next.code)
    && (prev.counts[prev.code] || 0) === (next.counts[next.code] || 0);
});

export default KeyTestPage;
