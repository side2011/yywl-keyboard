// src/components/BtConfigurator.jsx
// 蓝牙无线款配置页 — QT KEY_PRO 协议 (0xFB读信息/0xFA读配置/0xFD写键/0xFE 0xB0写灯光)
// 支持 V10 (版本>=10) 与旧协议两种记录格式 (由 BtProtocolHandler 内部处理)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { isDesktopApp } from '../services/env';
import { fetchActionSummary, toSlotMap } from '../services/action-slots';
import { useNavigate } from 'react-router-dom';
import { useDevice } from '../context/DeviceContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import {
  BT_MOD_TOKENS, BT_MEDIA_KEYS, BT_MOUSE_ACTIONS, BT_LED_MODES, BT_LED_COLORS,
  BT_KEYCODE_LABELS,
} from '../services/bt-protocol';
import BtVirtualKeyboard from './BtVirtualKeyboard';
import ConfigListPanel from './ConfigListPanel';
import toast from 'react-hot-toast';

// 模式: 0=未设置 1=键盘 2=多媒体 3=鼠标 5=延时
const MODE = { NONE: 0, KEY: 1, MEDIA: 2, MOUSE: 3, DELAY: 5 };

function createDefaultConfig() {
  return { mode: 0, modifierMask: 0, keyCode: 0, mediaCode: 0, mouse: null, delay: 0 };
}

// ---- 媒体功能图标 (内联 SVG, 对照 QT 软件媒体页样式) ----
const MEDIA_ICON_BY_LABEL = {
  '播放/暂停': 'play', '停止播放': 'stop', '上一首': 'prev', '下一首': 'next',
  '我的电脑': 'monitor', '屏幕亮度+': 'bright-plus', '屏幕亮度-': 'bright-minus',
  '打开媒体': 'camera', '系统静音': 'mute', '音量+': 'vol-up', '音量-': 'vol-down',
  '打开计算器': 'calc', '打开浏览器': 'globe', '打开邮件': 'mail',
  '低音+': 'bass-up', '低音-': 'bass-down', '高音+': 'treble-up', '高音-': 'treble-down',
  '网页刷新': 'refresh', '网页前进': 'forward', '网页后退': 'back',
};

function MediaIcon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const f = { fill: 'currentColor', stroke: 'none' };
  switch (name) {
    case 'play': return <svg {...common}><path d="M8 5.5v13l11-6.5z" {...f} /></svg>;
    case 'stop': return <svg {...common}><rect x="7" y="7" width="10" height="10" rx="1.5" {...f} /></svg>;
    case 'prev': return <svg {...common}><path d="M6.5 6v12" /><path d="M17.5 6l-8.5 6 8.5 6z" {...f} /></svg>;
    case 'next': return <svg {...common}><path d="M17.5 6v12" /><path d="M6.5 6l8.5 6-8.5 6z" {...f} /></svg>;
    case 'monitor': return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>;
    case 'bright-plus': return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M19.5 16.5h3M18 18v-3" />
      </svg>
    );
    case 'bright-minus': return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M19.5 16.5h3" />
      </svg>
    );
    case 'camera': return <svg {...common}><rect x="3" y="7" width="13" height="11" rx="2" /><path d="M16 10.5l5-3v9l-5-3z" /></svg>;
    case 'mute': return <svg {...common}><path d="M11 5L6.5 9H3v6h3.5L11 19z" {...f} /><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" /></svg>;
    case 'vol-up': return <svg {...common}><path d="M11 5L6.5 9H3v6h3.5L11 19z" {...f} /><path d="M15 8.5a5 5 0 010 7M17.5 6a9 9 0 010 12" /></svg>;
    case 'vol-down': return <svg {...common}><path d="M11 5L6.5 9H3v6h3.5L11 19z" {...f} /><path d="M15 9a3.5 3.5 0 010 6" /></svg>;
    case 'calc': return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7.5h6" /><path d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" strokeWidth="2.6" /></svg>;
    case 'globe': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18" /></svg>;
    case 'mail': return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7.5l9 6 9-6" /></svg>;
    case 'bass-up': return <svg {...common}><path d="M11 7L7 10.5H4v3h3l4 3.5z" {...f} /><path d="M17.5 14.5v-5M15.5 12l2-2 2 2" /></svg>;
    case 'bass-down': return <svg {...common}><path d="M11 7L7 10.5H4v3h3l4 3.5z" {...f} /><path d="M17.5 9.5v5M15.5 12l2 2 2-2" /></svg>;
    case 'treble-up': return <svg {...common}><path d="M11 7L7 10.5H4v3h3l4 3.5z" {...f} /><path d="M15 11a3.5 3.5 0 010 5M17.5 14.5v-5M15.5 12l2-2 2 2" /></svg>;
    case 'treble-down': return <svg {...common}><path d="M11 7L7 10.5H4v3h3l4 3.5z" {...f} /><path d="M15 13a3.5 3.5 0 010-5M17.5 9.5v5M15.5 12l2 2 2-2" /></svg>;
    case 'refresh': return <svg {...common}><path d="M20.5 12a8.5 8.5 0 11-2.5-5.98" /><path d="M21 3.5V8h-4.5" /></svg>;
    case 'forward': return <svg {...common}><path d="M5 5v14" /><path d="M13.5 5.5L19.5 12l-6 6.5z" {...f} /></svg>;
    case 'back': return <svg {...common}><path d="M19 5v14" /><path d="M10.5 5.5L4.5 12l6 6.5z" {...f} /></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

export default function BtConfigurator() {
  const { t, lang, toggleLang } = useLang();
  const navigate = useNavigate();
  const { device, modelId, modelName, disconnectDevice, deviceInfo, getNewHandler } = useDevice();

  const isV10 = deviceInfo?.isV10 ?? true;
  const keyCount = Math.min(Math.max(deviceInfo?.keyCount || 1, 1), 24);
  const knobCount = Math.min(deviceInfo?.knobCount || 0, 3);
  const totalSlots = keyCount + knobCount * 3; // 每个旋钮占 3 个槽位 (左/中/右)
  // 层数: V10 新协议=3层; 旧协议(版本<10)=1层 (2键/3键/4键/5键/4+1 等旧固件只有一层)
  const btLayerCount = isV10 ? 3 : 1;

  const [currentLayer, setCurrentLayer] = useState(0); // 0..2
  const [keyConfigs, setKeyConfigs] = useState(() => Array.from({ length: totalSlots }, createDefaultConfig));
  const [selectedKey, setSelectedKey] = useState(0);
  // 桌面版里已配置的扩展动作（网页版拿不到 → 空对象）
  const [actionNames, setActionNames] = useState({});
  useEffect(() => { fetchActionSummary().then((s) => setActionNames(toSlotMap(s))); }, []);
  const [activeTab, setActiveTab] = useState(1); // 1=键盘 2=多媒体 3=鼠标 5=延时
  const [loading, setLoading] = useState(false);
  const [ledMode, setLedMode] = useState(0);
  const [ledColors, setLedColors] = useState(() => Array.from({ length: 16 }, () => ({ r: 255, g: 255, b: 255 })));
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);
  const readingRef = useRef(false);

  // 层缓存: 每层独立配置
  const layerConfigsRef = useRef(Array.from({ length: btLayerCount }, () => Array.from({ length: totalSlots }, createDefaultConfig)));
  const [ledCache, setLedCache] = useState(Array.from({ length: btLayerCount }, () => ({ mode: 0, colors: null })));
  const ledCacheRef = useRef(ledCache);

  // 槽位标签: 按键 K1..KN + 旋钮1左/旋钮1中/旋钮1右 ...
  const slotLabel = (i) => {
    if (i < keyCount) return `K${i + 1}`;
    const kn = Math.floor((i - keyCount) / 3) + 1;
    const pos = ['左', '中', '右'][(i - keyCount) % 3];
    return `旋钮${kn}${pos}`;
  };

  const currentConfig = keyConfigs[selectedKey] || createDefaultConfig();

  // 页面刷新后设备状态丢失 → 自动返回首页重新连接 (避免卡在配置页)
  useEffect(() => {
    if (!device) {
      navigate('/', { replace: true });
    }
  }, [device, navigate]);

  // ---- 按键捕获 (大键盘按键 → HID keycode) ----
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!capturingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const codeMap = {
        KeyA: 0x04, KeyB: 0x05, KeyC: 0x06, KeyD: 0x07, KeyE: 0x08, KeyF: 0x09, KeyG: 0x0A, KeyH: 0x0B,
        KeyI: 0x0C, KeyJ: 0x0D, KeyK: 0x0E, KeyL: 0x0F, KeyM: 0x10, KeyN: 0x11, KeyO: 0x12, KeyP: 0x13,
        KeyQ: 0x14, KeyR: 0x15, KeyS: 0x16, KeyT: 0x17, KeyU: 0x18, KeyV: 0x19, KeyW: 0x1A, KeyX: 0x1B,
        KeyY: 0x1C, KeyZ: 0x1D,
        Digit1: 0x1E, Digit2: 0x1F, Digit3: 0x20, Digit4: 0x21, Digit5: 0x22, Digit6: 0x23, Digit7: 0x24,
        Digit8: 0x25, Digit9: 0x26, Digit0: 0x27,
        Enter: 0x28, Escape: 0x29, Backspace: 0x2A, Tab: 0x2B, Space: 0x2C,
        Minus: 0x2D, Equal: 0x2E, BracketLeft: 0x2F, BracketRight: 0x30, Backslash: 0x31,
        Semicolon: 0x33, Quote: 0x34, Backquote: 0x35, Comma: 0x36, Period: 0x37, Slash: 0x38,
        CapsLock: 0x39,
        F1: 0x3A, F2: 0x3B, F3: 0x3C, F4: 0x3D, F5: 0x3E, F6: 0x3F, F7: 0x40, F8: 0x41, F9: 0x42,
        F10: 0x43, F11: 0x44, F12: 0x45,
        ArrowRight: 0x4F, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52,
      };
      if (e.code === 'Escape') { setCapturing(false); capturingRef.current = false; return; }
      const hid = codeMap[e.code];
      if (hid !== undefined) {
        updateConfig({ mode: MODE.KEY, keyCode: hid });
        setCapturing(false);
        capturingRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const updateConfig = useCallback((partial) => {
    setKeyConfigs(prev => {
      const n = [...prev];
      n[selectedKey] = { ...n[selectedKey], ...partial };
      const cached = [...layerConfigsRef.current];
      cached[currentLayer] = n;
      layerConfigsRef.current = cached;
      return n;
    });
  }, [selectedKey, currentLayer]);

  // 切换层: 保存当前层编辑到缓存, 加载目标层
  const handleLayerChange = (l) => {
    if (l === currentLayer) return;
    const cached = [...layerConfigsRef.current];
    cached[currentLayer] = keyConfigs;
    layerConfigsRef.current = cached;
    setCurrentLayer(l);
    setKeyConfigs(cached[l] || Array.from({ length: totalSlots }, createDefaultConfig));
    setSelectedKey(0);
    // 灯光随层切换显示
    const lc = ledCacheRef.current[l];
    if (lc) { setLedMode(lc.mode); if (lc.colors) setLedColors(lc.colors); }
  };

  // 切换按键
  const handleSelectKey = (i) => {
    setSelectedKey(i);
    // 自动切到该键当前模式对应的 tab
    const m = keyConfigs[i]?.mode;
    if (m === MODE.KEY || m === MODE.MEDIA || m === MODE.MOUSE || m === MODE.DELAY) setActiveTab(m);
    else setActiveTab(MODE.KEY);
  };

  const toggleModifier = (bit) => {
    const mask = (currentConfig.modifierMask || 0) ^ bit;
    updateConfig({ mode: MODE.KEY, modifierMask: mask });
  };

  // ---- 读取配置 ----
  const handleReadConfig = async () => {
    if (readingRef.current) return;
    readingRef.current = true;
    setLoading(true);
    toast.loading(t('正在读取键盘配置...'), { id: 'bt-read' });
    try {
      const handler = getNewHandler();
      if (!handler) throw new Error('Protocol handler not available');
      const allLayers = [];
      for (let l = 0; l < btLayerCount; l++) {
        const configs = await handler.readLayer(l, totalSlots);
        // 补齐到 totalSlots 长度
        const padded = Array.from({ length: totalSlots }, (_, i) => configs[i] || createDefaultConfig());
        allLayers.push(padded);
      }
      layerConfigsRef.current = allLayers;
      setKeyConfigs(allLayers[0]);
      setCurrentLayer(0);
      setSelectedKey(0);
      // 读灯光 (V10 支持回读)
      const ledAll = [];
      for (let l = 0; l < btLayerCount; l++) {
        const led = await handler.readLedLayer(l);
        ledAll.push(led);
      }
      ledCacheRef.current = ledAll;
      setLedCache(ledAll);
      setLedMode(ledAll[0]?.mode || 0);
      if (ledAll[0]?.colors) setLedColors(ledAll[0].colors);
      toast.success(t('配置读取成功！'), { id: 'bt-read' });
    } catch (e) {
      console.error('[BtConfigurator] 读取失败:', e);
      toast.error(t('读取配置失败: {msg}', { msg: e.message }), { id: 'bt-read' });
    } finally {
      readingRef.current = false;
      setLoading(false);
    }
  };

  // ---- 连接后自动读取配置 ----
  // 注意: React StrictMode 会双挂载 — cleanup 时必须重置 autoReadRef, 否则第二次挂载会跳过自动读取
  const autoReadRef = useRef(false);
  useEffect(() => {
    if (device && deviceInfo && !autoReadRef.current && getNewHandler()) {
      autoReadRef.current = true;
      const timer = setTimeout(() => { handleReadConfig(); }, 400);
      return () => { clearTimeout(timer); autoReadRef.current = false; };
    }
    if (!device) autoReadRef.current = false;
  }, [device, deviceInfo]);

  // ---- 保存到键盘 ----
  const handleSaveToDevice = async () => {
    if (!device) { toast.error(t('设备未连接')); return; }
    setLoading(true);
    toast.loading(t('正在保存配置到键盘...'), { id: 'bt-save' });
    try {
      const handler = getNewHandler();
      if (!handler) throw new Error('Protocol handler not available');
      // 同步当前层编辑到缓存
      const cached = [...layerConfigsRef.current];
      cached[currentLayer] = keyConfigs;
      layerConfigsRef.current = cached;
      // 逐层写所有键
      for (let l = 0; l < btLayerCount; l++) {
        const cfgs = cached[l] || [];
        for (let i = 0; i < totalSlots; i++) {
          const cfg = cfgs[i];
          if (cfg && cfg.mode !== MODE.NONE) {
            await handler.writeKey(l, i, cfg);
          } else {
            await handler.clearKey(l, i);
          }
          await new Promise(r => setTimeout(r, 15));
        }
      }
      // 写Flash确认 (V10一次; 旧协议每层 — 处理器saveAll已封装, 这里直接调用flash)
      await handler._writeFlash();
      // 写灯光 (同步当前层灯光到缓存)
      const ledAll = [...ledCacheRef.current];
      ledAll[currentLayer] = { mode: ledMode, colors: ledColors };
      ledCacheRef.current = ledAll;
      for (let l = 0; l < btLayerCount; l++) {
        await handler.writeLedLayer(l, ledAll[l]?.mode ?? 0, ledAll[l]?.colors || ledColors);
      }
      toast.success(t('配置已成功保存到键盘！'), { id: 'bt-save' });
    } catch (e) {
      console.error('[BtConfigurator] 保存失败:', e);
      toast.error(t('保存到键盘失败: {msg}', { msg: e.message }), { id: 'bt-save' });
    } finally {
      setLoading(false);
    }
  };

  const handleClearKey = () => {
    updateConfig(createDefaultConfig());
    toast.success(t('已清除当前键'));
  };

  const handleClearAll = () => {
    const cleared = Array.from({ length: totalSlots }, createDefaultConfig);
    setKeyConfigs(cleared);
    const cached = [...layerConfigsRef.current];
    cached[currentLayer] = cleared;
    layerConfigsRef.current = cached;
    toast.success(t('已清除当前层全部按键'));
  };

  // ---- 配置列表加载 (保存/加载/导入/导出 面板回调) ----
  const handleLoadConfig = (loaded) => {
    const pad = (arr) => Array.from({ length: totalSlots }, (_, i) => arr?.[i] || createDefaultConfig());
    if (loaded.extra?.layers && Array.isArray(loaded.extra.layers)) {
      // 多层配置: 恢复所有层 (V10 3层)
      const layers = loaded.extra.layers.map(l => pad(l));
      while (layers.length < btLayerCount) layers.push(Array.from({ length: totalSlots }, createDefaultConfig));
      const trimmed = layers.slice(0, btLayerCount);
      layerConfigsRef.current = trimmed;
      setKeyConfigs(trimmed[0]);
      setCurrentLayer(0);
      setSelectedKey(0);
      // 灯光随配置恢复
      const led = loaded.extra.led;
      if (led) {
        const colors = led.colors || Array.from({ length: 16 }, () => ({ r: 255, g: 255, b: 255 }));
        setLedMode(led.mode ?? 0);
        setLedColors(colors);
        const ledAll = [...ledCacheRef.current];
        ledAll[0] = { mode: led.mode ?? 0, colors };
        ledCacheRef.current = ledAll;
        setLedCache(ledAll);
      }
      toast.success(t('配置已加载 ({layers}层)', { layers: trimmed.length }));
    } else if (loaded.keyConfigs && Array.isArray(loaded.keyConfigs)) {
      // 单层配置: 加载到当前层
      const padded = pad(loaded.keyConfigs);
      setKeyConfigs(padded);
      const cached = [...layerConfigsRef.current];
      cached[currentLayer] = padded;
      layerConfigsRef.current = cached;
      if (loaded.rgbMode !== undefined) setLedMode(loaded.rgbMode ?? 0);
      toast.success(t('配置已加载'));
    }
  };

  const handleGoBack = async () => {
    await disconnectDevice();
    navigate('/');
  };

  // ---- 显示文本 ----
  const keyCodeToLabel = (code) => BT_KEYCODE_LABELS[code] || (code ? `0x${code.toString(16)}` : t('无'));

  // 当前灯光颜色是否等于某预设色 (16 个灯珠全部相同且匹配时视为选中)
  const isColorSel = (rgb) => {
    const c0 = ledColors[0];
    if (!c0 || c0.r !== rgb[0] || c0.g !== rgb[1] || c0.b !== rgb[2]) return false;
    return ledColors.every(cl => cl.r === c0.r && cl.g === c0.g && cl.b === c0.b);
  };

  const getConfigDisplay = (cfg) => {
    if (!cfg || cfg.mode === 0) return t('未设置');
    switch (cfg.mode) {
      case MODE.KEY: {
        let label = '';
        if (cfg.modifierMask) {
          label = BT_MOD_TOKENS.filter(m => cfg.modifierMask & m.bit).map(m => t(m.label)).join('+') + '+';
        }
        return t('键盘: ') + label + keyCodeToLabel(cfg.keyCode);
      }
      case MODE.MEDIA: {
        const mk = BT_MEDIA_KEYS.find(m => m.code === cfg.mediaCode);
        return t('多媒体: ') + (mk ? mk.label : `0x${(cfg.mediaCode || 0).toString(16)}`);
      }
      case MODE.MOUSE: {
        const ma = BT_MOUSE_ACTIONS.find(a =>
          a.behavior === (cfg.mouse?.behavior || 0x01) && a.mod === cfg.mouse?.mod && a.btn === cfg.mouse?.btn && a.wheel === cfg.mouse?.wheel);
        return t('鼠标: ') + (ma ? ma.label : t('未知'));
      }
      case MODE.DELAY:
        return t('延时: ') + (cfg.delay || 0) + 'ms';
      default:
        return t('未设置');
    }
  };

  // 灯光作为右侧的一个"选项卡", 不再堆在左栏最底部(小屏会看不到)
  const LED_TAB = 'led';
  const EXT_TAB = 'ext';
  const tabs = [
    { label: t('键盘'), mode: MODE.KEY },
    { label: t('鼠标'), mode: MODE.MOUSE },
    { label: t('多媒体'), mode: MODE.MEDIA },
    { label: t('延时'), mode: MODE.DELAY },
    { label: t('扩展'), mode: EXT_TAB },
    { label: t('灯光'), mode: LED_TAB },
  ];

  const isConnected = !!device;

  return (
    <div className="min-h-screen p-4">
      {/* ---- 顶部状态栏 ---- */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20 rounded-xl shadow-sm mb-4">
        <div className="flex items-center gap-4">
          <button className="text-base text-gray-400 hover:text-indigo-600 transition-colors cursor-pointer" onClick={handleGoBack}>{t('← 返回')}</button>
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-base font-bold text-gray-800">{t('蓝牙无线款')}</span>
          <span className="text-sm px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
            {keyCount} {t('键')}{knobCount > 0 ? ` +${knobCount}${t('旋钮')}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a href={`${import.meta.env.BASE_URL}tutorial.html?type=bt`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1 text-sm font-semibold border-2 border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer bg-white">
            {lang === 'en' ? '📖 Config Guide' : '📖 配置说明'}
          </a>{!isDesktopApp() && (
          <a href={`${import.meta.env.BASE_URL}download.html`}
            className="px-3 py-1 text-sm font-semibold border-2 border-indigo-200 rounded-lg text-indigo-600 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer bg-white">
            {lang === 'en' ? '⬇ Download App' : '⬇ 软件下载'}
          </a>
          )}
          <button onClick={() => navigate('/keytest')}
            className="px-3 py-1 text-sm font-semibold border-2 border-emerald-200 rounded-lg text-emerald-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer bg-white">
            {lang === 'en' ? '🎯 Key Test' : '🎯 按键测试'}
          </button>
          <button onClick={toggleLang}
            className="px-3 py-1 text-sm font-semibold border-2 border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer bg-white">
            {lang === 'zh' ? 'English' : '中文'}
          </button>
        </div>
      </div>

      {/* ---- 层选择 (旧协议只有1层, 不显示层切换) ---- */}
      {btLayerCount > 1 && (
        <div className="flex items-center gap-3 mb-4 px-2">
          <span className="text-sm font-semibold text-gray-600">{t('层')}:</span>
          {Array.from({ length: btLayerCount }, (_, i) => (
            <button key={i} onClick={() => handleLayerChange(i)}
              className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all cursor-pointer ${
                currentLayer === i ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
              }`}>
              {t('层')}{i + 1}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 z-30 bg-white/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-full shadow-lg border border-gray-200">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-base font-semibold text-gray-700">{t('处理中，请稍候...')}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ==== 左栏 ==== */}
        <div className={`${knobCount > 0 ? 'lg:w-[420px] xl:w-[460px]' : 'lg:w-[320px]'} flex-shrink-0 space-y-4`}>
          {/* 按键列表 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-base font-bold text-gray-600 mb-4">{t('物理按键')}</h3>
            {(() => {
              const renderSlot = (i, extraCls = '') => {
                const isSel = selectedKey === i;
                const display = getConfigDisplay(keyConfigs[i]);
                return (
                  <button key={i} onClick={() => handleSelectKey(i)}
                    className={`p-2.5 rounded-xl border-2 transition-all text-left ${extraCls} ${
                      isSel ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-indigo-300'
                    }`}>
                    <div className={`text-sm font-bold px-2 py-0.5 rounded-full inline-block mb-1 ${isSel ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {slotLabel(i)}
                    </div>
                    <div className="text-xs text-gray-700 font-medium line-clamp-2 min-h-[2rem] break-all" title={display}>{display}</div>
                  </button>
                );
              };
              if (knobCount > 0) {
                // 对齐实物布局（用户照片）: 两个旋钮在上方, 下面两排按键 K1-K3 / K4-K6
                // 每个旋钮有 左转 / 按下 / 右转 三个可配置槽位
                return (
                  <div className="space-y-3">
                    {/* 旋钮在上 */}
                    <div className={`grid gap-2 ${knobCount > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {Array.from({ length: knobCount }, (_, n) => {
                        const base = keyCount + n * 3;
                        return (
                          <div key={n} className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-2">
                            <div className="text-[11px] font-bold text-indigo-500 mb-1.5 text-center tracking-wide">
                              {t('旋钮')} {n + 1}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {[t('左'), t('中'), t('右')].map((pos, k) => {
                                const idx = base + k;
                                const isSel = selectedKey === idx;
                                return (
                                  <button key={k} onClick={() => handleSelectKey(idx)}
                                    className={`rounded-lg border-2 px-1 py-1.5 transition-all cursor-pointer ${
                                      isSel
                                        ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300'
                                    }`}>
                                    <div className="text-[11px] font-bold leading-none mb-1">{pos}</div>
                                    <div className="text-[10px] leading-tight line-clamp-2 break-all opacity-80 min-h-[1.6rem]">
                                      {getConfigDisplay(keyConfigs[idx])}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 按键在下: 3 列, 第 1 排 K1-K3, 第 2 排 K4-K6 */}
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: keyCount }, (_, i) => renderSlot(i))}
                    </div>
                  </div>
                );
              }
              // 无旋钮款: 4 键是单排 4 个 (与实物一致), 其余每行 3 个
              if (totalSlots === 4) {
                return (
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: totalSlots }, (_, i) => renderSlot(i))}
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: totalSlots }, (_, i) => renderSlot(i))}
                </div>
              );
            })()}
          </div>

          {/* 操作 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleReadConfig}
                className="py-3 text-base font-bold border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                {t('读取键盘配置')}
              </button>
              <button onClick={handleClearKey}
                className="py-3 text-base font-bold border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                {t('清除当前键')}
              </button>
              <button onClick={handleClearAll}
                className="py-3 text-base font-bold border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                {t('全部清除')}
              </button>
              <button onClick={handleSaveToDevice}
                className="py-3 text-lg font-extrabold rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 transition-all cursor-pointer shadow-md">
                {t('保存到键盘')}
              </button>
            </div>
          </div>

          {/* 配置列表 (本地保存/读取/导入/导出) */}
          <ConfigListPanel
            modelId={`BT-${keyCount}+${knobCount}`}
            keyConfigs={keyConfigs}
            rgbMode={ledMode}
            customColor={ledColors[0] || { r: 255, g: 255, b: 255 }}
            delays={Array.from({ length: totalSlots }, () => 0)}
            extra={{ layers: layerConfigsRef.current, led: { mode: ledMode, colors: ledColors } }}
            onLoadConfig={handleLoadConfig}
          />
        </div>

        {/* ==== 右栏: 配置面板 ==== */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            {/* 当前选中键 */}
            <div className="mb-4">
              <span className="text-lg font-bold text-gray-800">{slotLabel(selectedKey)}</span>
              <span className="ml-3 text-base text-gray-600">{getConfigDisplay(currentConfig)}</span>
            </div>

            {/* Tab 切换 */}
            <div className="flex gap-2 mb-5">
              {tabs.map(tab => (
                <button key={tab.mode} onClick={() => { setActiveTab(tab.mode); if (tab.mode !== MODE.DELAY && tab.mode !== LED_TAB) updateConfig({ mode: tab.mode }); }}
                  className={`flex-1 py-2.5 text-base font-semibold text-center rounded-lg transition-colors cursor-pointer ${
                    activeTab === tab.mode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 键盘 */}
            {activeTab === MODE.KEY && (
              <div>
                <div className="mb-3">
                  <label className="text-base font-bold text-gray-700 block mb-2">{t('修饰键（可多选）')}</label>
                  <div className="flex flex-wrap gap-2">
                    {BT_MOD_TOKENS.map((m) => {
                      const active = (currentConfig.modifierMask || 0) & m.bit;
                      return (
                        <button key={m.token} onClick={() => toggleModifier(m.bit)}
                          className={`px-4 py-2 text-base rounded-lg border transition-colors cursor-pointer ${
                            active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                          }`}>
                          {t(m.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="flex items-center gap-4 mb-3">
                    <label className="text-base font-bold text-gray-700">
                      {t('按键:')} <span className="text-indigo-600 font-semibold">{currentConfig.keyCode ? keyCodeToLabel(currentConfig.keyCode) : t('未选择')}</span>
                    </label>
                    <button onClick={() => { setCapturing(true); capturingRef.current = true; }}
                      className={`px-4 py-2 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                        capturing ? 'bg-amber-100 text-amber-700 border-2 border-amber-400 animate-pulse'
                          : 'bg-indigo-50 text-indigo-700 border-2 border-indigo-200 hover:bg-indigo-100'
                      }`}>
                      {capturing ? '⏳ ' + t('请按下按键...') : '🎯 ' + t('捕获按键')}
                    </button>
                  </div>
                  {capturing && (
                    <div className="mb-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                      {t('现在请在大键盘上按下你想设置的按键。按 Esc 取消。')}
                    </div>
                  )}
                  <BtVirtualKeyboard selectedCode={currentConfig.keyCode} onSelect={(code) => updateConfig({ mode: MODE.KEY, keyCode: code })} t={t} />
                </div>
              </div>
            )}

            {/* 多媒体 */}
            {activeTab === MODE.MEDIA && (
              <div>
                <label className="text-base font-bold text-gray-700 mb-3 block">{t('选择多媒体功能')}</label>
                <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-2">
                  {BT_MEDIA_KEYS.map((mk) => {
                    const isSel = currentConfig.mediaCode === mk.code;
                    return (
                      <button key={mk.label} onClick={() => updateConfig({ mode: MODE.MEDIA, mediaCode: mk.code })}
                        className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-xl border-2 transition-colors cursor-pointer ${
                          isSel ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                        }`}>
                        <MediaIcon name={MEDIA_ICON_BY_LABEL[mk.label]} />
                        <span className="text-xs leading-tight text-center">{mk.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 鼠标 */}
            {activeTab === MODE.MOUSE && (
              <div>
                <label className="text-base font-bold text-gray-700 mb-3 block">{t('选择鼠标动作')}</label>
                <div className="grid grid-cols-4 gap-3">
                  {BT_MOUSE_ACTIONS.map((ma) => {
                    const isSel = currentConfig.mouse &&
                      currentConfig.mouse.behavior === ma.behavior &&
                      currentConfig.mouse.mod === ma.mod &&
                      currentConfig.mouse.btn === ma.btn &&
                      currentConfig.mouse.wheel === ma.wheel;
                    return (
                      <button key={ma.label} onClick={() => updateConfig({ mode: MODE.MOUSE, mouse: { behavior: ma.behavior, mod: ma.mod, btn: ma.btn, wheel: ma.wheel } })}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-all cursor-pointer text-center ${
                          isSel ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300'
                        }`}>
                        {ma.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 延时 */}
            {activeTab === MODE.DELAY && (
              <div>
                <label className="text-base font-bold text-gray-700 mb-3 block">{t('按键延时时间')}</label>
                <div className="flex items-center gap-3">
                  <input type="number" min={0} max={60000}
                    className="w-40 rounded-lg border border-gray-200 text-base px-3 py-2 outline-none focus:border-indigo-400"
                    value={currentConfig.delay || 0}
                    onChange={(e) => updateConfig({ mode: MODE.DELAY, delay: Math.max(0, Math.min(60000, Number(e.target.value) || 0)) })} />
                  <span className="text-base text-gray-600">ms</span>
                </div>
                <p className="text-sm text-gray-400 mt-3">{t('设置该按键按下后的延时时间 (0~60000ms)。')}</p>
              </div>
            )}

            {/* 扩展动作：把按键设成触发键（Ctrl+Alt+Shift+F1..F12） */}
            {activeTab === EXT_TAB && (
              <div>
                <p className="text-sm text-gray-500 mb-3">
                  {t('扩展动作由桌面版后台执行。这里只需把按键设成触发键，具体动作在桌面版的「文件 → 扩展动作」里配置。')}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 12 }, (_, i) => {
                    const code = 0x3a + i;
                    const isSel = currentConfig.mode === MODE.KEY && currentConfig.keyCode === code && (currentConfig.modifierMask || 0) === 0x07;
                    return (
                      <button key={i}
                        onClick={() => updateConfig({ mode: MODE.KEY, modifierMask: 0x07, keyCode: code })}
                        className={`py-3 rounded-xl border-2 transition-all cursor-pointer ${
                          isSel ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-indigo-300'
                        }`}>
                        <div className={`text-sm font-bold ${isSel ? 'text-indigo-700' : 'text-gray-700'}`}>{t('动作')} {i + 13}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Ctrl+Alt+Shift+F{i + 1}</div>
                        <div className="text-[10px] mt-1 truncate px-1">
                          {actionNames[i + 13]
                            ? <span className="text-emerald-600 font-semibold" title={actionNames[i + 13]}>⚡ {actionNames[i + 13]}</span>
                            : <span className="text-gray-300">{t('未配置')}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
                  ⚠️ {t('需要桌面版在后台运行才生效；否则按下只会发出 Ctrl+Alt+Shift+F1~F12 组合键。')}
                </div>
              </div>
            )}
            {/* 灯光（从左侧移到这里，避免在小屏上被挤到最底部看不到） */}
            {activeTab === LED_TAB && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-base font-bold text-gray-700">{t('灯光模式')}</label>
                  {btLayerCount > 1 && (
                    <span className="text-xs text-gray-400">{t('保存时应用到所有层')}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {BT_LED_MODES.map((m, i) => (
                    <button key={i} onClick={() => setLedMode(i)}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                        ledMode === i ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>

                <label className="text-base font-bold text-gray-700 block mb-2">{t('灯光颜色')}</label>
                <div className="flex flex-wrap gap-3">
                  {BT_LED_COLORS.map((c, i) => {
                    const isSel = isColorSel(c.rgb);
                    return (
                      <button key={i} onClick={() => setLedColors(prev => prev.map(() => ({ r: c.rgb[0], g: c.rgb[1], b: c.rgb[2] })))}
                        title={c.label}
                        className={`relative w-11 h-11 rounded-xl border-2 cursor-pointer transition-all hover:scale-105 ${
                          isSel ? 'border-indigo-600 ring-2 ring-indigo-300 scale-105' : 'border-gray-200'
                        }`}
                        style={{ backgroundColor: `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})` }}>
                        {isSel && (
                          <svg className="absolute inset-0 m-auto" width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6L9 17l-5-5" stroke="rgba(0,0,0,0.35)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-sm text-gray-400 mt-4">
                  {t('选好模式和颜色后，点左下角「保存到键盘」写入。')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
