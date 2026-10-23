// src/components/NewProtoConfigurator.jsx
// 新协议 (AC104/AC632N) 专用配置界面 — 支持宏录制、多层管理、丰富鼠标动作
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { isDesktopApp, openActionsWindow, guideUrl } from '../services/env';
import { fetchActionSummary, toSlotMap } from '../services/action-slots';
import { useNavigate } from 'react-router-dom';
import { useDevice } from '../context/DeviceContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import {
  KEY_MODE, KEYCODE_LABELS, MODIFIERS,
  BROWSER_CODE_TO_HID, BROWSER_MOD_TO_BIT, BROWSER_MACRO_KEY_TO_HID,
} from '../services/hid-constants';
import {
  NEW_MOUSE_ACTIONS, NEW_MEDIA_KEYS, MACRO_STEP, MACRO_STEP_LABELS,
  serializeMacro, deserializeMacro, getNewProtoRgbModes,
} from '../services/new-protocol.js';
import ConfigListPanel from './ConfigListPanel';
import toast from 'react-hot-toast';

// ---- 一键密码: 字符 → HID 按键映射 (标准美式键盘布局) ----
const CHAR_TO_KEY = {};
for (let c = 'a'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
  CHAR_TO_KEY[String.fromCharCode(c)] = { code: 0x04 + (c - 97), shift: false };
}
for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
  CHAR_TO_KEY[String.fromCharCode(c)] = { code: 0x04 + (c - 65), shift: true };
}
for (let i = 0; i <= 9; i++) CHAR_TO_KEY[String(i)] = { code: 0x1E + i, shift: false };
Object.assign(CHAR_TO_KEY, {
  '!': { code: 0x1E, shift: true }, '@': { code: 0x1F, shift: true }, '#': { code: 0x20, shift: true },
  '$': { code: 0x21, shift: true }, '%': { code: 0x22, shift: true }, '^': { code: 0x23, shift: true },
  '&': { code: 0x24, shift: true }, '*': { code: 0x25, shift: true }, '(': { code: 0x26, shift: true },
  ')': { code: 0x27, shift: true },
  '-': { code: 0x2D, shift: false }, '_': { code: 0x2D, shift: true },
  '=': { code: 0x2E, shift: false }, '+': { code: 0x2E, shift: true },
  '[': { code: 0x2F, shift: false }, '{': { code: 0x2F, shift: true },
  ']': { code: 0x30, shift: false }, '}': { code: 0x30, shift: true },
  '\\': { code: 0x31, shift: false }, '|': { code: 0x31, shift: true },
  ';': { code: 0x33, shift: false }, ':': { code: 0x33, shift: true },
  "'": { code: 0x34, shift: false }, '"': { code: 0x34, shift: true },
  '`': { code: 0x35, shift: false }, '~': { code: 0x35, shift: true },
  ',': { code: 0x36, shift: false }, '<': { code: 0x36, shift: true },
  '.': { code: 0x37, shift: false }, '>': { code: 0x37, shift: true },
  '/': { code: 0x38, shift: false }, '?': { code: 0x38, shift: true },
  ' ': { code: 0x2C, shift: false },
});
const SHIFT_LEFT = 0xE1; // 左Shift 修饰键 (宏步骤中作为独立按键)

// ---- 虚拟键盘布局 (与 KeyConfigPanel 相同) ----
const mainRows = [
  [{ label: '空', value: 0x00, wide: 1 }, ...Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 13}`, value: 0x68 + i, wide: 1 }))],
  [{ label: 'Esc', value: 0x29, wide: 1 }, ...Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, value: 0x3A + i, wide: 1 }))],
  [
    { label: '`~', value: 0x35, wide: 1 }, { label: '1!', value: 0x1E, wide: 1 }, { label: '2@', value: 0x1F, wide: 1 },
    { label: '3#', value: 0x20, wide: 1 }, { label: '4$', value: 0x21, wide: 1 }, { label: '5%', value: 0x22, wide: 1 },
    { label: '6^', value: 0x23, wide: 1 }, { label: '7&', value: 0x24, wide: 1 }, { label: '8*', value: 0x25, wide: 1 },
    { label: '9(', value: 0x26, wide: 1 }, { label: '0)', value: 0x27, wide: 1 }, { label: '-_', value: 0x2D, wide: 1 },
    { label: '=+', value: 0x2E, wide: 1 }, { label: 'Bksp', value: 0x2A, wide: 2 }
  ],
  [
    { label: 'Tab', value: 0x2B, wide: 1.5 }, { label: 'Q', value: 0x14, wide: 1 }, { label: 'W', value: 0x1A, wide: 1 },
    { label: 'E', value: 0x08, wide: 1 }, { label: 'R', value: 0x15, wide: 1 }, { label: 'T', value: 0x17, wide: 1 },
    { label: 'Y', value: 0x1C, wide: 1 }, { label: 'U', value: 0x18, wide: 1 }, { label: 'I', value: 0x0C, wide: 1 },
    { label: 'O', value: 0x12, wide: 1 }, { label: 'P', value: 0x13, wide: 1 }, { label: '[{', value: 0x2F, wide: 1 },
    { label: ']}', value: 0x30, wide: 1 }, { label: '\\|', value: 0x31, wide: 1.5 }
  ],
  [
    { label: 'Caps', value: 0x39, wide: 1.8 }, { label: 'A', value: 0x04, wide: 1 }, { label: 'S', value: 0x16, wide: 1 },
    { label: 'D', value: 0x07, wide: 1 }, { label: 'F', value: 0x09, wide: 1 }, { label: 'G', value: 0x0A, wide: 1 },
    { label: 'H', value: 0x0B, wide: 1 }, { label: 'J', value: 0x0D, wide: 1 }, { label: 'K', value: 0x0E, wide: 1 },
    { label: 'L', value: 0x0F, wide: 1 }, { label: ';:', value: 0x33, wide: 1 }, { label: "'\"", value: 0x34, wide: 1 },
    { label: 'Enter', value: 0x28, wide: 2.2 }
  ],
  [
    { label: 'Z', value: 0x1D, wide: 1 }, { label: 'X', value: 0x1B, wide: 1 },
    { label: 'C', value: 0x06, wide: 1 }, { label: 'V', value: 0x19, wide: 1 }, { label: 'B', value: 0x05, wide: 1 },
    { label: 'N', value: 0x11, wide: 1 }, { label: 'M', value: 0x10, wide: 1 }, { label: ',<', value: 0x36, wide: 1 },
    { label: '.>', value: 0x37, wide: 1 }, { label: '/?', value: 0x38, wide: 1 }
  ],
  [
    { label: 'Space', value: 0x2C, wide: 6 },
    { label: 'Menu', value: 0x65, wide: 1 }
  ]
];
const functionGrid = [
  { label: 'PrtSc', value: 0x46 }, { label: 'ScrLk', value: 0x47 }, { label: 'Pause', value: 0x48 },
  { label: 'Insert', value: 0x49 }, { label: 'Delete', value: 0x4C }, { label: 'Home', value: 0x4A },
  { label: 'End', value: 0x4D }, { label: 'PgUp', value: 0x4B }, { label: 'PgDn', value: 0x4E },
];
const numpadKeys = [
  { label: 'Num', value: 0x53, row: 0, col: 0 }, { label: '/', value: 0x54, row: 0, col: 1 },
  { label: '*', value: 0x55, row: 0, col: 2 }, { label: '-', value: 0x56, row: 0, col: 3 },
  { label: '7', value: 0x5F, row: 1, col: 0 }, { label: '8', value: 0x60, row: 1, col: 1 },
  { label: '9', value: 0x61, row: 1, col: 2 }, { label: '+', value: 0x57, row: 1, col: 3, rowspan: 2 },
  { label: '4', value: 0x5C, row: 2, col: 0 }, { label: '5', value: 0x5D, row: 2, col: 1 },
  { label: '6', value: 0x5E, row: 2, col: 2 },
  { label: '1', value: 0x59, row: 3, col: 0 }, { label: '2', value: 0x5A, row: 3, col: 1 },
  { label: '3', value: 0x5B, row: 3, col: 2 }, { label: 'Enter', value: 0x58, row: 3, col: 3, rowspan: 2 },
  { label: '0', value: 0x62, row: 4, col: 0, colspan: 2 }, { label: '.', value: 0x63, row: 4, col: 2 },
];

const getWidthClass = (wide) => {
  if (wide >= 6) return 'flex-1';
  if (wide >= 2.2) return 'w-28';
  if (wide >= 2) return 'w-24';
  if (wide >= 1.8) return 'w-20';
  if (wide >= 1.5) return 'w-16';
  return 'w-14';
};

const keyBase = 'h-11 px-1.5 text-sm border rounded-lg transition-all flex items-center justify-center cursor-pointer select-none font-medium';
const keyNormal = `${keyBase} bg-slate-100 text-slate-700 border-slate-200 hover:bg-indigo-100 hover:text-indigo-700 hover:border-indigo-300`;
const keyActive = `${keyBase} bg-indigo-500 text-white border-indigo-500 shadow`;
const chipBase = 'px-4 py-2 text-base rounded-lg border transition-colors cursor-pointer select-none font-medium';
const chipActive = `${chipBase} bg-indigo-600 text-white border-indigo-600`;
const chipNormal = `${chipBase} bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600`;
const tabActive = 'flex-1 px-4 py-2.5 text-base font-semibold text-center transition-colors cursor-pointer rounded-lg bg-indigo-600 text-white';
const tabNormal = 'flex-1 px-4 py-2.5 text-base font-semibold text-center transition-colors cursor-pointer rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100';

function createDefaultConfig(count) {
  return Array.from({ length: count }, () => ({
    mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0,
    mouseScroll: 0, mediaCode: null, multiKeys: [], macroSteps: [],
  }));
}

// ---- 虚拟键盘子组件 ----
export function VirtualKeyboard({ onSelect, selectedCode, t }) {
  const handleKeyClick = (label, value) => { if (value >= 0xE0 && value <= 0xE7) return; onSelect(value); };
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex flex-row gap-3 min-w-[1100px]">
        <div className="flex-shrink-0">
          {mainRows.map((row, ri) => (
            <div key={ri} className="flex gap-1 mb-2">
              {row.map((key, ki) => (
                <button key={ki} className={`${selectedCode === key.value ? keyActive : keyNormal} ${getWidthClass(key.wide)}`}
                  onClick={() => handleKeyClick(key.label, key.value)}>
                  <span>{key.value === 0x00 ? t('空') : key.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-row gap-3">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-1.5">
              {functionGrid.map((key, idx) => (
                <button key={idx} className={`${selectedCode === key.value ? keyActive : keyNormal} w-16`}
                  onClick={() => handleKeyClick(key.label, key.value)}>
                  <span>{key.label}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <button className={`${selectedCode === 0x52 ? keyActive : keyNormal} w-12`} onClick={() => handleKeyClick('↑', 0x52)}>↑</button>
              <div className="flex gap-1.5">
                <button className={`${selectedCode === 0x50 ? keyActive : keyNormal} w-11`} onClick={() => handleKeyClick('←', 0x50)}>←</button>
                <button className={`${selectedCode === 0x51 ? keyActive : keyNormal} w-11`} onClick={() => handleKeyClick('↓', 0x51)}>↓</button>
                <button className={`${selectedCode === 0x4F ? keyActive : keyNormal} w-11`} onClick={() => handleKeyClick('→', 0x4F)}>→</button>
              </div>
            </div>
          </div>
          {/* 数字区: 显式网格坐标定位 (4 列 × 5 行)
              行高与主键盘一致 (h-11 = 2.75rem), 跨行键用 height:100% 自动填满
              「行 + 间距」, 不再写死高度 (原来的 5.75rem 比两行实际高度短 2px) */}
          <div
            className="grid gap-1.5 content-start self-start"
            style={{ gridTemplateColumns: 'repeat(4, 3.5rem)', gridAutoRows: '2.75rem' }}
          >
            {numpadKeys.map((key) => (
              <button
                key={`numpad-${key.value}`}
                className={selectedCode === key.value ? keyActive : keyNormal}
                style={{
                  width: '100%',
                  height: '100%',
                  gridColumn: `${key.col + 1} / span ${key.colspan || 1}`,
                  gridRow: `${key.row + 1} / span ${key.rowspan || 1}`,
                }}
                onClick={() => handleKeyClick(key.label, key.value)}
              >
                <span>{key.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function NewProtoConfigurator() {
  const { t, lang, toggleLang } = useLang();
  const navigate = useNavigate();
  const { device, model, modelId, modelName, disconnectDevice, deviceInfo, getNewHandler } = useDevice();

  // 防御性钳位: 部分新芯片 0x0B 会返回垃圾值 (如 keyCount=0, layerCount=221)
  const keyCount = Math.min(Math.max(deviceInfo?.keyCount || model?.keyCount || 3, 1), 16);
  const layerCount = Math.min(Math.max(deviceInfo?.layerCount || 1, 1), 16);
  const hasBacklight = (deviceInfo?.backlightType || 0) > 0;
  // 方向键款判定: 新协议方向键固件 0x0B 型号名字符串含 "Arrow" (与 C# 上位机一致);
  // 部分固件版本 0x0B 无型号名 (实测 dataLen=7), 此时用 layoutId=1 兜底识别 —
  // 实测方向键 keyCount=4/layerCount=1/layoutId=1/backlightType=1, 麦克风款 layoutId=5, 互不重叠
  const isArrowKeys = deviceInfo?.keyCount === 4 && (
    (typeof deviceInfo?.modelName === 'string' && /arrow/i.test(deviceInfo.modelName)) ||
    deviceInfo?.layoutId === 1
  );

  // ---- 核心状态 ----
  const [keyConfigs, setKeyConfigs] = useState(() => createDefaultConfig(keyCount));
  const [selectedKey, setSelectedKey] = useState(0);
  // 桌面版里已配置的扩展动作（网页版拿不到 → 空对象）
  const [actionNames, setActionNames] = useState({});
  useEffect(() => { fetchActionSummary().then((s) => setActionNames(toSlotMap(s))); }, []);
  const [activeTab, setActiveTab] = useState(0); // 0=键盘 1=鼠标 2=多媒体 3=宏 4=组合键
  const [currentLayer, setCurrentLayer] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState(''); // 'read' | 'save' | ''
  const isReadingRef = useRef(false); // 防重入: React 19 Strict Mode 会双重调用 useEffect
  const isSavingRef = useRef(false); // 防重入: 防止保存被并发调用
  const allLayerConfigsRef = useRef([]); // 缓存所有层的配置，首次连接时一次性读取

  // 键盘 tab 状态
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);

  // 宏录制状态
  const [macroRecording, setMacroRecording] = useState(false);
  const macroRecordingRef = useRef(false);
  const macroStepsRef = useRef([]);
  const [passwordText, setPasswordText] = useState(''); // 一键密码输入
  const [insertKeyOpen, setInsertKeyOpen] = useState(false); // 手动插入按键面板
  const lastStepTimeRef = useRef(0);
  const heldKeysRef = useRef(new Map()); // keyCode → timestamp
  const [selectedStepIdx, setSelectedStepIdx] = useState(null); // 选中的宏步骤索引，用于插入延时

  // 灯光 tab 状态
  const rgbModes = getNewProtoRgbModes() || [];
  const [ledMode, setLedMode] = useState(0);
  const [ledColors, setLedColors] = useState(() => Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0 })));
  const [ledSleepAllow, setLedSleepAllow] = useState(1);
  const [ledLoading, setLedLoading] = useState(false);

  const tabs = [
    { label: t('键盘'), mode: KEY_MODE.KEYBOARD },
    { label: t('鼠标'), mode: KEY_MODE.MOUSE },
    { label: t('多媒体'), mode: KEY_MODE.MEDIA },
    { label: t('宏(多键合一)'), mode: KEY_MODE.MACRO },
    { label: t('扩展'), mode: -2 },
    ...(hasBacklight ? [{ label: t('灯光'), mode: -1 }] : []),
  ];
  const extTabIndex = tabs.findIndex((x) => x.mode === -2);
  const ledTabIndex = tabs.findIndex((x) => x.mode === -1);

  // ---- 初始化 / 自动读取 ----
  useEffect(() => {
    setKeyConfigs(createDefaultConfig(keyCount));
    setSelectedKey(0);
    setActiveTab(0);
  }, [keyCount]);

  useEffect(() => {
    if (!device || !device.opened) { setIsConnected(false); return; }
    setIsConnected(true);
    if (deviceInfo) {
      // 首次连接: 一次性读取所有层配置
      (async () => {
        if (isReadingRef.current) return;
        isReadingRef.current = true;
        try {
          setLoading(true);
          setLoadingAction('read');
          toast.loading(t('正在从键盘读取配置...'), { id: 'read' });
          const handler = getNewHandler();
          if (!handler) throw new Error('Protocol handler not available');
          const lc = deviceInfo.layerCount || 1;
          const allConfigs = [];
          for (let l = 0; l < lc; l++) {
            const configs = await handler.readLayer(l, keyCount);
            allConfigs.push(configs);
          }
          allLayerConfigsRef.current = allConfigs;
          setKeyConfigs(allConfigs[0]);
          setCurrentLayer(0);
          toast.success(t('配置读取成功！'), { id: 'read' });
        } catch (e) {
          toast.error(t('读取配置失败: {msg}', { msg: e.message }), { id: 'read' });
        } finally {
          setLoading(false);
          setLoadingAction('');
          isReadingRef.current = false;
        }
      })();
      // 自动读取灯光配置
      if ((deviceInfo.backlightType || 0) > 0) {
        const handler = getNewHandler();
        if (handler) {
          handler.readLedLayer(0).then(led => {
            setLedMode(led.mode);
            setLedSleepAllow(led.sleepAllow);
            if (led.colors && led.colors.length > 0) {
              setLedColors(Array.from({ length: 16 }, (_, i) => led.colors[i] || { r: 0, g: 0, b: 0 }));
            }
          }).catch(e => console.warn('[NewProto] 自动读取灯光配置失败:', e.message));
        }
      }
    }
  }, [device, deviceInfo]);

  useEffect(() => {
    if (!device) {
      toast.error(t('设备已断开，请重新连接'));
      navigate('/');
    }
  }, [device]);

  // ---- 按键捕获 (键盘 tab) ----
  useEffect(() => {
    if (!capturing && !macroRecording) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 宏录制模式
      if (macroRecording && macroRecordingRef.current) {
        if (e.code === 'Escape' && !BROWSER_MACRO_KEY_TO_HID[e.code]) {
          // Esc 停止录制 (但只有非修饰键的 Esc 才停止)
          if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
            stopMacroRecording();
            return;
          }
        }
        const hidCode = BROWSER_MACRO_KEY_TO_HID[e.code];
        if (hidCode === undefined) return;
        handleMacroKeyDown(hidCode, e);
        return;
      }

      // 普通键盘捕获
      if (!capturing || !capturingRef.current) return;
      if (BROWSER_MOD_TO_BIT[e.code] !== undefined) return;
      if (e.code === 'Escape') {
        setCapturing(false);
        capturingRef.current = false;
        return;
      }
      const hidCode = BROWSER_CODE_TO_HID[e.code];
      if (hidCode === undefined) return;
      let modifier = 0;
      if (e.ctrlKey) modifier |= (e.code === 'ControlRight' ? 0x10 : 0x01);
      if (e.shiftKey) modifier |= (e.code === 'ShiftRight' ? 0x20 : 0x02);
      if (e.altKey) modifier |= (e.code === 'AltRight' ? 0x40 : 0x04);
      if (e.metaKey) modifier |= (e.code === 'MetaRight' ? 0x80 : 0x08);
      updateConfig({ mode: KEY_MODE.KEYBOARD, keyCode: hidCode, modifier });
      setCapturing(false);
      capturingRef.current = false;
    };

    const keyUpHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (macroRecording && macroRecordingRef.current) {
        const hidCode = BROWSER_MACRO_KEY_TO_HID[e.code];
        if (hidCode !== undefined) handleMacroKeyUp(hidCode, e);
      }
    };

    window.addEventListener('keydown', handler, true);
    window.addEventListener('keyup', keyUpHandler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('keyup', keyUpHandler, true);
    };
  }, [capturing, macroRecording]);

  // ---- 配置操作 ----
  const currentConfig = keyConfigs[selectedKey] || { mode: 0 };

  const updateConfig = useCallback((partial) => {
    setKeyConfigs(prev => {
      const n = [...prev];
      n[selectedKey] = { ...n[selectedKey], ...partial };
      // 同步到缓存
      const cached = [...allLayerConfigsRef.current];
      cached[currentLayer] = n;
      allLayerConfigsRef.current = cached;
      return n;
    });
  }, [selectedKey, currentLayer]);

  const toggleModifier = (bit) => updateConfig({ modifier: (currentConfig.modifier || 0) ^ bit });

  // 自动切换 tab 到当前配置的 mode
  useEffect(() => {
    if (currentConfig.mode) {
      const idx = tabs.findIndex(tab => tab.mode === currentConfig.mode);
      if (idx >= 0) setActiveTab(idx);
    }
    setSelectedStepIdx(null); // 切换按键时清除步骤选中
  }, [selectedKey]);

  // ---- 读取/保存 ----
  const handleReadConfig = async () => {
    if (isReadingRef.current) {
      console.log('[NewProto] 读取已在进行中, 跳过重复调用 (React Strict Mode double invoke)');
      return;
    }
    isReadingRef.current = true;
    try {
      setLoading(true);
      setLoadingAction('read');
      toast.loading(t('正在从键盘读取配置...'), { id: 'read' });
      const handler = getNewHandler();
      if (!handler) throw new Error('Protocol handler not available');
      const configs = await handler.readLayer(currentLayer, keyCount);
      setKeyConfigs(configs);
      // 更新缓存
      const cached = [...allLayerConfigsRef.current];
      cached[currentLayer] = configs;
      allLayerConfigsRef.current = cached;
      toast.success(t('配置读取成功！'), { id: 'read' });
    } catch (e) {
      toast.error(t('读取配置失败: {msg}', { msg: e.message }), { id: 'read' });
    } finally {
      setLoading(false);
      setLoadingAction('');
      isReadingRef.current = false;
    }
  };

  const handleSaveToDevice = async () => {
    if (isSavingRef.current) {
      console.log('[NewProto] 保存已在进行中, 跳过重复调用');
      return;
    }
    isSavingRef.current = true;
    try {
      setLoading(true);
      setLoadingAction('save');
      toast.loading(t('正在保存配置到键盘...'), { id: 'save' });
      const handler = getNewHandler();
      if (!handler) throw new Error('Protocol handler not available');
      // 先同步当前层编辑到缓存
      const cached = [...allLayerConfigsRef.current];
      cached[currentLayer] = keyConfigs;
      allLayerConfigsRef.current = cached;
      // 逐层保存到键盘
      //
      // ⚠ 层序必须**从高层往低层**（3→2→1）：
      //   固件每次 SAVE_LAYER 之后会把"当前活动层"切到刚保存的那一层；
      //   若按 1→2→3 保存，最后停在第三层，客户一上手看到的就是第 3 层配置。
      //   倒序保存后，最后写入的是第 1 层，设备停在正常使用的第 1 层。
      const totalLayers = cached.length || 1;
      for (let l = totalLayers - 1; l >= 0; l -= 1) {
        // 防御：按设备实际键数补齐/截断，避免少写或多写
        const raw = cached[l];
        const layerCfgs = Array.from({ length: keyCount }, (_, i) => (raw && raw[i]) || createDefaultConfig(1)[0]);
        if (totalLayers > 1) {
          toast.loading(t('正在保存第{layer}层...', { layer: l + 1 }), { id: 'save' });
        }
        await handler.saveAll(l, layerCfgs, undefined);
      }
      // 全部保存完，再把活动层明确设成客户正在编辑的层（一般就是第 1 层）
      try {
        await handler.setActiveLayer(currentLayer);
        console.log('[NewProto] 已设置活动层 =', currentLayer + 1);
      } catch (err) {
        console.warn('[NewProto] 设置活动层失败（不影响已保存内容）:', err.message);
      }

      // 保存后逐层回读校验：把"写进去但没进 flash"的按键找出来
      const mismatchReport = [];
      for (let l = 0; l < totalLayers; l += 1) {
        let back = null;
        try {
          back = await handler.readLayer(l, keyCount);
        } catch (err) {
          console.warn('[NewProto] 回读校验失败 层' + (l + 1) + ':', err.message);
          continue;
        }
        const want = Array.isArray(cached[l]) ? cached[l] : [];
        const badKeys = [];
        for (let i = 0; i < keyCount; i += 1) {
          const a = want[i] || { mode: 0 };
          const b = (back && back[i]) || { mode: 0 };
          const same = (a.mode || 0) === (b.mode || 0)
            && (a.keyCode || 0) === (b.keyCode || 0)
            && (a.modifier || 0) === (b.modifier || 0)
            && ((a.mediaCode && a.mediaCode[1]) || 0) === ((b.mediaCode && b.mediaCode[1]) || 0);
          if (!same) badKeys.push(i + 1);
        }
        console.log('[NewProto] 保存校验 层' + (l + 1) + ': ' + keyCount + ' 键中 ' + badKeys.length + ' 个不一致' +
          (badKeys.length ? ' -> 键' + badKeys.join(', 键') : ' ✓'));
        if (badKeys.length) mismatchReport.push(t('第{layer}层：键{keys}', { layer: l + 1, keys: badKeys.join('、') }));
      }

      if (mismatchReport.length) {
        toast.error(t('有按键没写进键盘：{detail}。请再点一次保存；若一直这样，把控制台的 [NewProto] 日志发给技术支持。', {
          detail: mismatchReport.join('；'),
        }), { id: 'save', duration: 12000 });
      } else {
        toast.success(t('配置已成功保存到键盘！'), { id: 'save' });
      }
    } catch (e) {
      toast.error(t('保存到键盘失败: {msg}', { msg: e.message }), { id: 'save' });
    } finally {
      setLoading(false);
      setLoadingAction('');
      isSavingRef.current = false;
    }
  };

  const handleClearKey = () => {
    setKeyConfigs(prev => {
      const n = [...prev];
      n[selectedKey] = { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
      const cached = [...allLayerConfigsRef.current];
      cached[currentLayer] = n;
      allLayerConfigsRef.current = cached;
      return n;
    });
  };

  const handleClearAll = () => {
    setKeyConfigs(createDefaultConfig(keyCount));
    toast.success(t('已清除全部按键配置'));
  };

  const handleGoBack = async () => {
    await disconnectDevice();
    navigate('/');
  };

  // ---- 切换层 (从缓存中切换，不读取键盘) ----
  // ---- 切换层 ----
  // 正常情况下从缓存切；但如果缓存里这层是空的（读取超时/没读到），
  // 就主动从键盘补读一次 —— 之前只能靠"切来切去碰运气"才显示出来。
  const layerSwitchRef = useRef(0);
  const handleLayerChange = async (newLayer) => {
    if (newLayer === currentLayer) return;
    layerSwitchRef.current += 1;
    const token = layerSwitchRef.current;
    setCurrentLayer(newLayer);
    setSelectedKey(0);

    const cachedLayer = allLayerConfigsRef.current[newLayer];
    const looksEmpty = !cachedLayer || cachedLayer.every((c) => !c || !c.mode);
    if (!looksEmpty) {
      setKeyConfigs(cachedLayer);
      return;
    }

    setKeyConfigs(createDefaultConfig(keyCount));
    const handler = getNewHandler();
    if (!handler) return;
    try {
      setLoading(true);
      setLoadingAction('read');
      toast.loading(t('正在读取第{layer}层...', { layer: newLayer + 1 }), { id: 'layer-read' });
      const configs = await handler.readLayer(newLayer, keyCount);
      const padded = Array.from({ length: keyCount }, (_, i) => configs[i] || createDefaultConfig(1)[0]);
      const cache = [...allLayerConfigsRef.current];
      cache[newLayer] = padded;
      allLayerConfigsRef.current = cache;
      // 期间用户可能又切走了，只有仍停在这一层才更新界面
      if (layerSwitchRef.current === token) setKeyConfigs(padded);
      const filled = padded.filter((c) => c && c.mode).length;
      console.log('[NewProto] 切换层补读 层' + (newLayer + 1) + ': ' + filled + '/' + keyCount + ' 键有内容');
      toast.dismiss('layer-read');
    } catch (err) {
      console.warn('[NewProto] 切换层补读失败 层' + (newLayer + 1) + ':', err.message);
      toast.error(t('第{layer}层读取失败：{msg}，可点「读取键盘配置」重试', { layer: newLayer + 1, msg: err.message }), { id: 'layer-read', duration: 8000 });
    } finally {
      setLoading(false);
      setLoadingAction('');
    }
  };

  // ---- 灯光读取/保存 ----
  const handleReadLed = async () => {
    try {
      setLedLoading(true);
      toast.loading(t('正在读取灯光配置...'), { id: 'led-read' });
      const handler = getNewHandler();
      if (!handler) throw new Error('Protocol handler not available');
      const led = await handler.readLedLayer(currentLayer);
      setLedMode(led.mode);
      setLedSleepAllow(led.sleepAllow);
      if (led.colors && led.colors.length > 0) {
        const newColors = Array.from({ length: 16 }, (_, i) => led.colors[i] || { r: 0, g: 0, b: 0 });
        setLedColors(newColors);
      }
      toast.success(t('灯光配置读取成功！'), { id: 'led-read' });
    } catch (e) {
      toast.error(t('读取灯光配置失败: {msg}', { msg: e.message }), { id: 'led-read' });
    } finally { setLedLoading(false); }
  };

  const handleSaveLed = async () => {
    try {
      setLedLoading(true);
      toast.loading(t('正在保存灯光配置...'), { id: 'led-save' });
      const handler = getNewHandler();
      if (!handler) throw new Error('Protocol handler not available');
      // 灯光配置写入所有层 — 多层键盘(如6键3层款)所有层统一生效,
      // 否则只改当前层会出现其他层灯光没关闭/没生效的问题
      for (let l = 0; l < layerCount; l++) {
        await handler.writeLedLayer(l, ledMode, ledColors, ledSleepAllow);
      }
      toast.success(t('灯光配置已保存到所有层！'), { id: 'led-save' });
    } catch (e) {
      toast.error(t('保存灯光配置失败: {msg}', { msg: e.message }), { id: 'led-save' });
    } finally { setLedLoading(false); }
  };

  const handleLedColorChange = (index, colorObj) => {
    setLedColors(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...colorObj };
      return next;
    });
  };

  const handleApplyColorToAll = (r, g, b) => {
    setLedColors(prev => prev.map(() => ({ r, g, b })));
  };

  // ---- 宏录制 ----
  const startMacroRecording = () => {
    setMacroRecording(true);
    macroRecordingRef.current = true;
    macroStepsRef.current = [];
    lastStepTimeRef.current = Date.now();
    heldKeysRef.current = new Map();
    updateConfig({ mode: KEY_MODE.MACRO, macroSteps: [] });
  };

  const stopMacroRecording = () => {
    setMacroRecording(false);
    macroRecordingRef.current = false;
    heldKeysRef.current.clear();
  };

  const handleMacroKeyDown = (hidCode, e) => {
    if (heldKeysRef.current.has(hidCode)) return; // 忽略重复 keydown
    const now = Date.now();
    const delay = now - lastStepTimeRef.current;
    lastStepTimeRef.current = now;
    heldKeysRef.current.set(hidCode, now);

    // 新协议宏步骤没有 modifier 字段 — 修饰键作为独立步骤录入 (0xE0-0xE7)
    const steps = [...macroStepsRef.current];
    if (delay > 30 && steps.length > 0) {
      steps.push({ action: MACRO_STEP.DELAY, keyCode: 0, delay });
    }
    steps.push({ action: MACRO_STEP.DOWN, keyCode: hidCode, delay: 0 });
    macroStepsRef.current = steps;
    updateConfig({ macroSteps: steps });
  };

  const handleMacroKeyUp = (hidCode, e) => {
    if (!heldKeysRef.current.has(hidCode)) return;
    const downTime = heldKeysRef.current.get(hidCode);
    heldKeysRef.current.delete(hidCode);
    const now = Date.now();
    const holdDuration = now - downTime;
    lastStepTimeRef.current = now;

    const steps = [...macroStepsRef.current];
    if (holdDuration > 300) {
      // 长按 → 生成 UP + 后续按键的延时
      steps.push({ action: MACRO_STEP.UP, keyCode: hidCode, delay: 0 });
    } else {
      // 短按 → 转换为 PRESS, 替换最后的 DOWN
      const lastIdx = steps.length - 1;
      if (lastIdx >= 0 && steps[lastIdx].action === MACRO_STEP.DOWN && steps[lastIdx].keyCode === hidCode) {
        steps[lastIdx] = { ...steps[lastIdx], action: MACRO_STEP.PRESS };
      }
    }
    macroStepsRef.current = steps;
    updateConfig({ macroSteps: steps });
  };

  const addMacroDelay = () => {
    const steps = [...(currentConfig.macroSteps || [])];
    if (selectedStepIdx !== null && selectedStepIdx >= 0 && selectedStepIdx < steps.length) {
      // 不允许在 DELAY 步骤后面插入延时
      if (steps[selectedStepIdx].action === MACRO_STEP.DELAY) {
        toast.error(t('不能在延时步骤后面插入延时，请直接编辑延时的时间'));
        return;
      }
    } else if (steps.length > 0 && steps[steps.length - 1].action === MACRO_STEP.DELAY) {
      // 末尾已是 DELAY, 不能再追加
      toast.error(t('末尾已经是延时步骤了，请直接编辑延时的时间'));
      return;
    }
    const insertAt = (selectedStepIdx !== null && selectedStepIdx >= 0 && selectedStepIdx < steps.length)
      ? selectedStepIdx + 1
      : steps.length;
    steps.splice(insertAt, 0, { action: MACRO_STEP.DELAY, keyCode: 0, delay: 500 });
    updateConfig({ macroSteps: steps });
    macroStepsRef.current = steps;
    setSelectedStepIdx(null);
  };

  // ---- 手动插入按键 (不用录制, 从虚拟键盘选择) ----
  const insertMacroKey = (code) => {
    if (code >= 0xE0 && code <= 0xE7) return; // 修饰键不可单独插入 (录制或用一键密码)
    const steps = [...(currentConfig.macroSteps || [])];
    const insertAt = (selectedStepIdx !== null && selectedStepIdx >= 0 && selectedStepIdx < steps.length)
      ? selectedStepIdx + 1
      : steps.length;
    steps.splice(insertAt, 0, { action: MACRO_STEP.PRESS, keyCode: code, delay: 0 });
    // 同时设置 mode=MACRO, 保证直接手动插入不点录制也生效
    updateConfig({ mode: KEY_MODE.MACRO, macroSteps: steps });
    macroStepsRef.current = steps;
    setSelectedStepIdx(null);
  };

  const removeMacroStep = (idx) => {
    const steps = [...(currentConfig.macroSteps || [])];
    steps.splice(idx, 1);
    updateConfig({ macroSteps: steps });
    macroStepsRef.current = steps;
    setSelectedStepIdx(null);
  };

  const updateMacroStep = (idx, field, value) => {
    const steps = [...(currentConfig.macroSteps || [])];
    steps[idx] = { ...steps[idx], [field]: value };
    updateConfig({ macroSteps: steps });
    macroStepsRef.current = steps;
  };

  const clearMacroSteps = () => {
    updateConfig({ macroSteps: [] });
    macroStepsRef.current = [];
    setSelectedStepIdx(null);
  };

  // ---- 一键密码: 文本 → 宏按键步骤 ----
  const generatePasswordSteps = () => {
    const text = passwordText;
    if (!text || !text.length) {
      toast.error(t('请输入要输出的密码内容'));
      return;
    }
    const steps = [];
    for (const ch of text) {
      const m = CHAR_TO_KEY[ch];
      if (!m) {
        toast.error(t('暂不支持的字符: {ch}', { ch }));
        return;
      }
      // 需要 Shift 的字符: 按下Shift → 点击按键 → 松开Shift
      if (m.shift) {
        steps.push({ action: MACRO_STEP.DOWN, keyCode: SHIFT_LEFT, delay: 0 });
        steps.push({ action: MACRO_STEP.PRESS, keyCode: m.code, delay: 0 });
        steps.push({ action: MACRO_STEP.UP, keyCode: SHIFT_LEFT, delay: 0 });
      } else {
        steps.push({ action: MACRO_STEP.PRESS, keyCode: m.code, delay: 0 });
      }
    }
    const merged = [...(currentConfig.macroSteps || []), ...steps];
    // 必须同时设置 mode=MACRO: 否则不点"开始录制"直接生成时按键模式仍是"无",
    // 保存时会被当作清除处理, 按键不会变成宏按键
    updateConfig({ mode: KEY_MODE.MACRO, macroSteps: merged });
    macroStepsRef.current = merged;
    setPasswordText('');
    toast.success(t('已生成 {count} 个字符的按键', { count: text.length }));
  };

  // ---- 显示文本 ----
  const keyCodeToLabel = (code) => KEYCODE_LABELS[code] || (code ? `0x${code.toString(16)}` : t('无'));

  const getConfigDisplay = (cfg) => {
    if (!cfg || cfg.mode === 0) return t('未设置');
    switch (cfg.mode) {
      case KEY_MODE.KEYBOARD: {
        let label = '';
        if (cfg.modifier) {
          const mods = MODIFIERS.filter(m => cfg.modifier & m.bit).map(m => t(m.label));
          label = mods.join('+') + '+';
        }
        return t('键盘: ') + label + keyCodeToLabel(cfg.keyCode);
      }
      case KEY_MODE.MOUSE: {
        const action = NEW_MOUSE_ACTIONS.find(a => a.code === (cfg.mouseButton || 0));
        return t('鼠标: ') + (action ? t(action.label) : `0x${(cfg.mouseButton || 0).toString(16)}`);
      }
      case KEY_MODE.MEDIA: {
        if (!cfg.mediaCode) return t('多媒体: 未选择');
        const mk = NEW_MEDIA_KEYS.find(m => m.code[0] === cfg.mediaCode[0] && m.code[1] === cfg.mediaCode[1]);
        return t('多媒体: ') + (mk ? t(mk.label) : t('多媒体: 未知'));
      }
      case KEY_MODE.MACRO: {
        const steps = cfg.macroSteps || [];
        return t('宏') + ` (${steps.length} ${t('步')})`;
      }
      default: return t('未设置');
    }
  };

  // ---- ConfigListPanel 回调 ----
  const handleLoadConfig = (loaded) => {
    const defaultKey = { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
    if (loaded.layers && Array.isArray(loaded.layers) && loaded.layers.length > 1) {
      // 多层配置: 恢复所有层
      const newCache = loaded.layers.map(layerCfgs =>
        Array.from({ length: keyCount }, (_, i) => layerCfgs?.[i] || { ...defaultKey })
      );
      allLayerConfigsRef.current = newCache;
      setKeyConfigs(newCache[currentLayer] || newCache[0]);
      toast.success(t('配置已加载 ({layers}层)', { layers: loaded.layers.length }));
    } else if (loaded.keyConfigs && Array.isArray(loaded.keyConfigs)) {
      // 单层配置: 只加载到当前层
      const padded = Array.from({ length: keyCount }, (_, i) =>
        loaded.keyConfigs[i] || { ...defaultKey }
      );
      setKeyConfigs(padded);
      const cached = [...allLayerConfigsRef.current];
      cached[currentLayer] = padded;
      allLayerConfigsRef.current = cached;
      toast.success(t('配置已加载'));
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-50/30">
      {/* ---- 顶部状态栏 ---- */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button className="text-base text-gray-400 hover:text-indigo-600 transition-colors cursor-pointer" onClick={handleGoBack}>{t('← 返回')}</button>
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-base font-bold text-gray-800">{modelName ? t(modelName) : t('未知型号')}</span>
          <span className="text-sm px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
            {isArrowKeys ? t('方向键') : `${keyCount} ${t('键')}`}
          </span>
          {layerCount > 1 && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-xs text-gray-500">{t('层')}:</span>
              <div className="flex gap-0.5">
                {Array.from({ length: layerCount }, (_, i) => (
                  <button key={i} className={`w-9 h-9 text-base font-bold rounded-md transition-all cursor-pointer ${
                    currentLayer === i ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`} onClick={() => handleLayerChange(i)}>{i + 1}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a href={`${import.meta.env.BASE_URL}tutorial.html?type=new`} target="_blank" rel="noopener noreferrer"
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

      {/* ---- 主体内容 ---- */}
      <div className="flex flex-col lg:flex-row gap-4 p-4 w-full">
        {/* ==== 左栏: 按键网格 + 操作 ==== */}
        <div className="lg:w-[360px] xl:w-[400px] flex-shrink-0 space-y-4">
          {/* 按键网格 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-base font-bold text-gray-600 uppercase tracking-wider mb-4">{t('物理按键')}</h3>
            {(() => {
              const renderKeyCard = (i, extraCls = '', compact = false) => {
                const isSel = selectedKey === i;
                const display = getConfigDisplay(keyConfigs[i]);
                return (
                  <button key={i}
                    disabled={loading}
                    className={`relative ${compact ? 'p-2.5' : 'p-5'} rounded-xl border-2 transition-all text-left ${extraCls} ${
                      loading ? 'cursor-not-allowed opacity-60 border-gray-200 bg-gray-50' : 'cursor-pointer'
                    } ${
                      !loading && isSel ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100' : !loading ? 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm' : ''
                    }`}
                    onClick={() => !loading && setSelectedKey(i)}>
                    <div className={`flex items-center justify-between ${compact ? 'mb-1' : 'mb-2'}`}>
                      <span className={`${compact ? 'text-xs px-2 py-0.5' : 'text-base px-3 py-1'} font-bold rounded-full ${isSel ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>K{i + 1}</span>
                      {!compact && keyConfigs[i]?.mode > 0 && (
                        <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${
                          keyConfigs[i].mode === KEY_MODE.MACRO ? 'bg-amber-100 text-amber-700' :
                          keyConfigs[i].mode === KEY_MODE.MOUSE ? 'bg-blue-100 text-blue-700' :
                          keyConfigs[i].mode === KEY_MODE.MEDIA ? 'bg-green-100 text-green-700' :
                          keyConfigs[i].mode === KEY_MODE.MULTI ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {tabs.find(t2 => t2.mode === keyConfigs[i].mode)?.label || ''}
                        </span>
                      )}
                    </div>
                    <div className={`${compact ? 'text-xs min-h-[2rem]' : 'text-base min-h-[3rem]'} text-gray-700 font-semibold line-clamp-2 leading-snug`} title={display}>{display}</div>
                  </button>
                );
              };
              // 方向键款: 十字布局 (K1上 K2左 K3下 K4右)
              if (isArrowKeys) {
                return (
                  <div className="grid grid-cols-3 gap-2 justify-items-center max-w-[340px] mx-auto">
                    <div className="w-[106px]" />
                    {renderKeyCard(0, 'w-[106px]')}
                    <div className="w-[106px]" />
                    {renderKeyCard(1, 'w-[106px]')}
                    {renderKeyCard(2, 'w-[106px]')}
                    {renderKeyCard(3, 'w-[106px]')}
                  </div>
                );
              }
              // 4 键款(非方向键)是单排 4 个 —— 与实物一致；其余每行最多 3 个
              if (keyCount === 4) {
                return (
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                    {Array.from({ length: keyCount }, (_, i) => renderKeyCard(i, '', true))}
                  </div>
                );
              }
              return (
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(keyCount, 3)}, minmax(0, 1fr))` }}>
                  {Array.from({ length: keyCount }, (_, i) => renderKeyCard(i))}
                </div>
              );
            })()}
          </div>

          {/* 操作按钮 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="grid grid-cols-2 gap-3">
              <button disabled={loading} className={`py-3.5 text-base font-bold border-2 rounded-lg transition-colors ${loading ? 'cursor-not-allowed opacity-50 border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'}`} onClick={() => !loading && handleReadConfig()}>{t('读取键盘配置')}</button>
              <button disabled={loading} className={`py-3.5 text-base font-bold border-2 rounded-lg transition-colors ${loading ? 'cursor-not-allowed opacity-50 border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'}`} onClick={() => !loading && handleClearKey()}>{t('清除当前键')}</button>
              <button disabled={loading} className={`py-3.5 text-base font-bold border-2 rounded-lg transition-colors ${loading ? 'cursor-not-allowed opacity-50 border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'}`} onClick={() => !loading && handleClearAll()}>{t('全部清除')}</button>
              <button disabled={loading} className={`py-3.5 text-lg font-extrabold rounded-lg transition-all shadow-md ${loading ? 'cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 cursor-pointer active:scale-[0.97]'}`} onClick={() => !loading && handleSaveToDevice()}>{t('保存到键盘')}</button>
            </div>
          </div>

          {/* 配置列表 */}
          <ConfigListPanel
            modelId={modelId || 'AC632N'}
            keyConfigs={keyConfigs}
            layers={allLayerConfigsRef.current}
            rgbMode={0}
            customColor={{ r: 0, g: 0, b: 0 }}
            delays={Array(keyCount).fill(0)}
            onLoadConfig={handleLoadConfig}
          />
        </div>

        {/* ==== 右栏: 配置面板 ==== */}
        <div className="flex-1 min-w-0 space-y-4 relative">
          {loading && (
            <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-sm rounded-xl flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-full shadow-lg border border-gray-200">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-base font-semibold text-gray-700">
                  {loadingAction === 'save' ? t('保存中，请稍候...') : t('读取中，请稍候...')}
                </span>
              </div>
            </div>
          )}
          {/* 当前选中键信息 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-indigo-600">K{selectedKey + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base text-gray-400 mb-1">{t('当前配置')} · {t('层')} {currentLayer + 1}</div>
                <div className="text-lg font-bold text-gray-800 break-words leading-snug">{getConfigDisplay(keyConfigs[selectedKey])}</div>
              </div>
            </div>
          </div>

          {/* Tab 切换 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex gap-1.5 mb-5 bg-gray-100 p-1.5 rounded-xl">
              {tabs.map((tab, idx) => (
                <button key={tab.mode} className={activeTab === idx ? tabActive : tabNormal} onClick={() => setActiveTab(idx)}>{tab.label}</button>
              ))}
            </div>

            {/* ---- 键盘 Tab ---- */}
            {activeTab === 0 && (
              <div>
                <div className="mb-4">
                  <label className="text-base font-bold text-gray-700 mb-3 block">{t('修饰键 (可多选)')}</label>
                  <div className="flex flex-wrap gap-2.5">
                    {MODIFIERS.map((mod) => (
                      <button key={mod.bit} className={(currentConfig.modifier || 0) & mod.bit ? chipActive : chipNormal}
                        onClick={() => toggleModifier(mod.bit)}>{t(mod.label)}</button>
                    ))}
                  </div>
                  {/* Mac 用户经常问"怎么没有 Command 键"，这里明确说明对应关系 */}
                  <div className="mt-2 inline-flex items-start gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
                    <span className="text-base leading-none select-none">🍎</span>
                    <span className="text-xs leading-relaxed text-indigo-800">
                      {t('Mac 用户：键盘上没有 Command 键是正常的 —— Win 就是 Command ⌘，Alt 就是 Option ⌥。')}
                    </span>
                  </div>
                </div>
                <div className="mb-4">
                  <div className="flex items-center gap-4 mb-3">
                    <label className="text-base font-bold text-gray-700">
                      {t('按键:')} <span className="text-indigo-600 font-semibold">{currentConfig.keyCode ? keyCodeToLabel(currentConfig.keyCode) : t('未选择')}</span>
                    </label>
                    <button onClick={() => { setCapturing(true); capturingRef.current = true; }} disabled={capturing}
                      className={`px-4 py-2 text-sm font-bold rounded-lg transition-all cursor-pointer select-none ${
                        capturing ? 'bg-amber-100 text-amber-700 border-2 border-amber-400 animate-pulse'
                          : 'bg-indigo-50 text-indigo-700 border-2 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-400'
                      }`}>
                      {capturing ? '⏳ ' + t('请按下按键...') : '🎯 ' + t('捕获按键')}
                    </button>
                  </div>
                  {capturing && (
                    <div className="mb-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                      {lang === 'en' ? 'Press any key on your keyboard. Press Esc to cancel.' : '现在请在大键盘上按下你想设置的按键（可同时按修饰键组合）。按 Esc 取消。'}
                    </div>
                  )}
                  <VirtualKeyboard selectedCode={currentConfig.keyCode} onSelect={(code) => updateConfig({ mode: KEY_MODE.KEYBOARD, keyCode: code })} t={t} />
                </div>
              </div>
            )}

            {/* ---- 鼠标 Tab ---- */}
            {activeTab === 1 && (
              <div>
                <label className="text-base font-bold text-gray-700 mb-3 block">{t('选择鼠标动作')}</label>
                <div className="grid grid-cols-4 gap-3">
                  {NEW_MOUSE_ACTIONS.map((action) => {
                    const isSel = (currentConfig.mouseButton || 0) === action.code;
                    return (
                      <button key={action.code}
                        className={`p-4 rounded-xl border-2 text-base font-medium transition-all cursor-pointer text-center ${
                          isSel ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                        }`}
                        onClick={() => updateConfig({ mode: KEY_MODE.MOUSE, mouseButton: action.code })}>
                        {t(action.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---- 多媒体 Tab ---- */}
            {activeTab === 2 && (
              <div>
                <label className="text-base font-bold text-gray-700 mb-3 block">{t('选择多媒体功能')}</label>
                <div className="flex flex-wrap gap-2">
                  {NEW_MEDIA_KEYS.map((mk) => {
                    const isSelected = currentConfig.mediaCode && mk.code[0] === currentConfig.mediaCode[0] && mk.code[1] === currentConfig.mediaCode[1];
                    return (
                      <button key={mk.label} className={isSelected ? chipActive : chipNormal}
                        onClick={() => updateConfig({ mode: KEY_MODE.MEDIA, mediaCode: mk.code })}>{t(mk.label)}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---- 宏 Tab ---- */}
            {activeTab === 3 && (
              <div>
                {/* 录制工具栏 */}
                <div className="flex items-center gap-3 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <button
                    onClick={macroRecording ? stopMacroRecording : startMacroRecording}
                    className={`px-5 py-2.5 text-base font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                      macroRecording
                        ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-200'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm'
                    }`}>
                    {macroRecording ? (
                      <><span className="w-2.5 h-2.5 bg-white rounded-full" /> {t('停止录制')}</>
                    ) : (
                      <><span className="w-2.5 h-2.5 bg-red-400 rounded-full" /> {t('开始录制')}</>
                    )}
                  </button>
                  <button className="px-4 py-2 text-base font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={addMacroDelay} disabled={macroRecording}>
                    {selectedStepIdx !== null ? `${t('插入延时')} (第${selectedStepIdx + 1}步后)` : t('插入延时')}
                  </button>
                  <button className={`px-4 py-2 text-base font-semibold border rounded-lg transition-colors cursor-pointer ${
                    insertKeyOpen
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
                  }`}
                    onClick={() => setInsertKeyOpen(!insertKeyOpen)} disabled={macroRecording}>
                    {t('插入按键')}
                  </button>
                  <button className="px-4 py-2 text-base font-semibold border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                    onClick={clearMacroSteps} disabled={macroRecording}>{t('清空')}</button>
                  <span className="text-sm text-gray-500 ml-auto">
                    {(currentConfig.macroSteps || []).length} {t('步')}
                  </span>
                </div>

                {/* 手动插入按键面板 */}
                {insertKeyOpen && !macroRecording && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="text-xs text-gray-400 mb-3">{t('点击下方按键插入到宏中 (插入到选中步骤后，未选中则追加到末尾)')}</p>
                    <VirtualKeyboard
                      onSelect={insertMacroKey}
                      selectedCode={null}
                      t={t}
                    />
                  </div>
                )}

                {/* 录制提示 */}
                {macroRecording && (
                  <div className="mb-4 p-4 rounded-xl bg-red-50 border-2 border-red-300 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-sm font-bold text-red-700">{t('录制中...')}</span>
                    </div>
                    <p className="text-xs text-red-600">{t('请在键盘上按下想要的按键序列，完成后点击"停止录制"或按 Esc 结束')}</p>
                  </div>
                )}

                {/* 选中提示 */}
                {!macroRecording && (currentConfig.macroSteps || []).length > 0 && (
                  <div className="mb-3 text-xs text-gray-400">
                    {selectedStepIdx !== null
                      ? `${t('已选中第')}${selectedStepIdx + 1}${t('步，点击"插入延时"在该步骤后插入延时')}  ${t('(再次点击取消选中)')}`
                      : t('点击某个步骤可选中它，然后"插入延时"会插入到该步骤后面')
                    }
                  </div>
                )}

                {/* 步骤时间线 */}
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                  {(currentConfig.macroSteps || []).length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-3xl mb-2">🎬</div>
                      <p className="text-sm">{macroRecording ? t('等待按键输入...') : t('点击"开始录制"来录制宏，或手动添加步骤')}</p>
                    </div>
                  ) : (
                    (currentConfig.macroSteps || []).map((step, idx) => (
                      <React.Fragment key={idx}>
                      <div
                        className={`flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all ${
                          !macroRecording ? 'cursor-pointer' : ''
                        } ${
                          selectedStepIdx === idx
                            ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                            : step.action === MACRO_STEP.DELAY ? 'bg-amber-50 border-amber-200 hover:border-amber-300' : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => {
                          if (macroRecording) return;
                          if (step.action === MACRO_STEP.DELAY) return; // DELAY 步骤不可选中
                          setSelectedStepIdx(selectedStepIdx === idx ? null : idx);
                        }}>
                        <span className="text-xs text-gray-400 font-mono w-6 text-right flex-shrink-0">#{idx + 1}</span>
                        <span className={`text-sm font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          step.action === MACRO_STEP.PRESS ? 'bg-indigo-100 text-indigo-700' :
                          step.action === MACRO_STEP.DOWN ? 'bg-blue-100 text-blue-700' :
                          step.action === MACRO_STEP.UP ? 'bg-gray-100 text-gray-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {t(MACRO_STEP_LABELS[step.action] || '未知')}
                        </span>
                        {step.action !== MACRO_STEP.DELAY && (
                          <span className="text-sm font-semibold text-gray-800 min-w-[3rem]">
                            {step.modifier ? MODIFIERS.filter(m => step.modifier & m.bit).map(m => t(m.label)).join('+') + '+' : ''}
                            {keyCodeToLabel(step.keyCode)}
                          </span>
                        )}
                        {step.action === MACRO_STEP.DELAY && (
                          <div className="flex items-center gap-1">
                            <input type="number" className="w-20 rounded-lg border border-amber-300 text-sm px-2 py-1 outline-none focus:border-amber-500"
                              value={step.delay || 0} min={0} max={65535}
                              onChange={(e) => updateMacroStep(idx, 'delay', Math.max(0, Math.min(65535, Number(e.target.value) || 0)))}
                              disabled={macroRecording} />
                            <span className="text-sm text-amber-600">ms</span>
                          </div>
                        )}
                        <div className="flex-1" />
                        {!macroRecording && (
                          <button className="w-5 h-5 rounded-full hover:bg-red-100 flex items-center justify-center text-red-400 hover:text-red-600 text-xs cursor-pointer flex-shrink-0"
                            onClick={(e) => { e.stopPropagation(); removeMacroStep(idx); }}>×</button>
                        )}
                      </div>
                      {selectedStepIdx === idx && !macroRecording && (
                        <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-indigo-500 font-medium">
                          <span>↓</span>
                          <span>{t('延时将插入到此位置')}</span>
                        </div>
                      )}
                      </React.Fragment>
                    ))
                  )}
                </div>

                {/* 一键密码: 文本转按键 (放在宏列表下方, 避免干扰宏录制用户) */}
                <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-bold text-indigo-700">🔑 {t('一键密码')}</span>
                    <span className="text-xs text-indigo-400">{t('输入密码文本，自动转换为按键序列')}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 rounded-lg border border-indigo-200 text-sm px-3 py-2 outline-none focus:border-indigo-400 bg-white"
                      placeholder={t('输入要输出的密码内容...')}
                      value={passwordText}
                      onChange={(e) => setPasswordText(e.target.value)}
                      disabled={macroRecording}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generatePasswordSteps(); } }}
                    />
                    <button
                      className="px-5 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors cursor-pointer flex-shrink-0"
                      onClick={generatePasswordSteps}
                      disabled={macroRecording}>
                      {t('生成按键')}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">{t('支持大小写字母、数字和常用符号 ( !@#$%^&*()-_=+[]{};:\'"`~,.<>/?| 及空格 )，生成后追加到当前宏末尾')}</p>
                </div>
              </div>
            )}

            {/* ---- 扩展动作 Tab ---- */}
            {activeTab === extTabIndex && (
              <div>
                {/* 醒目提示：扩展动作依赖桌面版；网页版直接引导下载 */}
                <div className="mb-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/80 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none select-none">⚡</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-bold text-indigo-800 mb-1">
                        {isDesktopApp()
                          ? t('这些键由桌面版后台执行扩展动作')
                          : t('扩展动作需要桌面版（网页版无法执行）')}
                      </div>
                      <div className="text-sm text-indigo-900/80 leading-relaxed">
                        {t('键盘本身只能发标准按键；打开文件夹、开网址、粘贴文字/图片、鼠标点击，都要由桌面版在后台执行。这里只负责把按键绑定到某个动作。')}
                      </div>
                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        {isDesktopApp() ? (
                          <>
                            <button
                              onClick={async () => {
                                const ok = await openActionsWindow();
                                if (ok) {
                                  toast.success(t('已打开「扩展动作」窗口，去那边配置动作'), { id: 'open-actions' });
                                  setTimeout(() => { fetchActionSummary().then((s) => setActionNames(toSlotMap(s))); }, 900);
                                } else {
                                  toast.error(t('打开失败，请从菜单「文件 → 扩展动作…」进入'), { id: 'open-actions' });
                                }
                              }}
                              className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer">
                              ⚙ {t('配置扩展动作')}
                            </button>
                            <span className="text-xs text-indigo-700/70">{t('也可以从顶部菜单「文件 → 扩展动作…」打开')}</span>
                            <a href={guideUrl(lang)} target="_blank" rel="noreferrer"
                              className="text-xs font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900">
                              📖 {t('图文使用说明')}
                            </a>
                          </>
                        ) : (
                          <>
                            <a href={`${import.meta.env.BASE_URL}download.html`}
                              className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
                              ⬇ {t('下载桌面版')}
                            </a>
                            <span className="text-xs text-indigo-700/70">{t('装好后在菜单「文件 → 扩展动作…」里配置，程序会在后台常驻')}</span>
                            <a href={guideUrl(lang)} target="_blank" rel="noreferrer"
                              className="text-xs font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900">
                              📖 {t('图文使用说明')}
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {Array.from({ length: 12 }, (_, i) => {
                    const hk = 0x68 + i; // F13..F24
                    const isSel = currentConfig.mode === KEY_MODE.KEYBOARD && currentConfig.keyCode === hk;
                    return (
                      <button key={i}
                        onClick={() => {
                          updateConfig({ mode: KEY_MODE.KEYBOARD, keyCode: hk, modifier: 0 });
                          toast.success(t('已设为扩展动作 {n}（F{k}）', { n: i + 1, k: i + 13 }), { id: 'ext-set' });
                        }}
                        className={`py-4 rounded-xl border-2 transition-all cursor-pointer ${
                          isSel ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-indigo-300'
                        }`}>
                        <div className={`text-base font-bold ${isSel ? 'text-indigo-700' : 'text-gray-700'}`}>{t('动作')} {i + 1}</div>
                        <div className="text-xs text-gray-400 mt-1 font-mono">F{i + 13}</div>
                        <div className="text-[10px] mt-1 truncate px-1">
                          {actionNames[i + 1]
                            ? <span className="text-emerald-600 font-semibold" title={actionNames[i + 1]}>⚡ {actionNames[i + 1]}</span>
                            : <span className="text-gray-300">{t('未配置')}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
                  ⚠️ {t('扩展动作需要安装桌面版并让它在后台运行；网页版和未安装桌面版时，按下只会发出 F13-F24（大多数软件没有反应）。')}
                </div>
              </div>
            )}

            {/* ---- 灯光 Tab ---- */}
            {hasBacklight && activeTab === ledTabIndex && (
              <div>
                <p className="text-sm text-gray-500 mb-4">{t('选择灯光效果，保存时会应用到所有层。部分灯效使用基础颜色，其他灯效使用内置色盘。')}</p>

                {/* 工具栏: 读取/保存 */}
                <div className="flex items-center gap-3 mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <button className="px-5 py-2.5 text-base font-bold border-2 border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
                    onClick={handleReadLed} disabled={ledLoading}>{t('读取灯光')}</button>
                  <button className="px-6 py-2.5 text-base font-bold bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg hover:from-indigo-500 hover:to-violet-500 transition-all cursor-pointer shadow-md"
                    onClick={handleSaveLed} disabled={ledLoading}>{t('保存灯光')}</button>
                  <label className="flex items-center gap-2 ml-auto text-base text-gray-600 cursor-pointer select-none">
                    <input type="checkbox" className="checkbox checkbox-sm checkbox-indigo" checked={ledSleepAllow === 1}
                      onChange={(e) => setLedSleepAllow(e.target.checked ? 1 : 0)} />
                    {t('休眠允许')}
                  </label>
                </div>

                {/* 灯光模式选择 — 2列布局 (与上位机一致) */}
                <div className="mb-5">
                  <label className="text-base font-bold text-gray-700 mb-3 block">{t('灯光模式')}</label>
                  <div className="grid grid-cols-2 gap-3">
                    {rgbModes.map((modeName, idx) => (
                      <button key={idx}
                        className={`p-4 rounded-xl border-2 text-base font-semibold transition-all cursor-pointer text-center ${
                          ledMode === idx
                            ? 'border-indigo-500 bg-indigo-500 text-white shadow-md'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:text-indigo-600'
                        }`}
                        onClick={() => setLedMode(idx)}>
                        {t(modeName)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 基础颜色设置 */}
                <div>
                  <label className="text-base font-bold text-gray-700 mb-3 block">
                    {t('基础颜色')} <span className="text-sm font-normal text-gray-400">({t('共')} {keyCount} {t('键')})</span>
                  </label>
                  {/* 全局颜色应用 */}
                  {(() => {
                    // 统一色块跟随当前基础颜色 (修复: 原来写死 #ff0000 导致选色后色块不变/选色不生效)
                    const c0 = ledColors[0] || { r: 0, g: 0, b: 0 };
                    const unifiedHex = '#' + [c0.r, c0.g, c0.b].map(v => v.toString(16).padStart(2, '0')).join('');
                    return (
                      <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span className="text-sm text-gray-500">{t('统一设置:')}</span>
                        <input type="color" className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
                          value={unifiedHex}
                          onChange={(e) => {
                            const hex = e.target.value;
                            handleApplyColorToAll(
                              parseInt(hex.slice(1, 3), 16),
                              parseInt(hex.slice(3, 5), 16),
                              parseInt(hex.slice(5, 7), 16),
                            );
                          }} />
                        <span className="text-sm text-gray-400">{t('应用到全部按键')}</span>
                      </div>
                    );
                  })()}
                  {/* 逐键颜色 */}
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: keyCount }, (_, i) => {
                      const c = ledColors[i] || { r: 0, g: 0, b: 0 };
                      const hex = '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('');
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200">
                          <span className="text-base font-bold text-gray-500">K{i + 1}</span>
                          <input type="color" className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer flex-shrink-0"
                            value={hex}
                            onChange={(e) => {
                              const h = e.target.value;
                              handleLedColorChange(i, {
                                r: parseInt(h.slice(1, 3), 16),
                                g: parseInt(h.slice(3, 5), 16),
                                b: parseInt(h.slice(5, 7), 16),
                              });
                            }} />
                          <span className="text-sm text-gray-400 font-mono">{hex.toUpperCase()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
