// src/components/KeyConfigPanel.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { KEY_MODE, KEYCODE_LABELS, MEDIA_KEYS, MOUSE_BUTTONS, mouseIndexToDevice, mouseDeviceToIndex, MODIFIERS, BROWSER_CODE_TO_HID, BROWSER_MOD_TO_BIT, HID_TO_CS_SHIFTED, CS_SHIFTED_CODES } from '../services/hid-constants';

// ---- styles ----
const keyBase = 'h-8 px-1 text-xs border rounded-lg transition-all flex items-center justify-center cursor-pointer select-none font-medium';
const keyNormal = `${keyBase} bg-slate-100 text-slate-700 border-slate-200 hover:bg-indigo-100 hover:text-indigo-700 hover:border-indigo-300`;
const keyActive = `${keyBase} bg-indigo-500 text-white border-indigo-500 shadow`;

const chipBase = 'px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer select-none font-medium';
const chipActive = `${chipBase} bg-indigo-600 text-white border-indigo-600`;
const chipNormal = `${chipBase} bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600`;

const tabBase = 'flex-1 px-3 py-2 text-sm font-semibold text-center transition-colors cursor-pointer rounded-lg';
const tabActive = `${tabBase} bg-indigo-600 text-white`;
const tabNormal = `${tabBase} text-gray-500 hover:text-gray-700 hover:bg-gray-100`;

// ---- keyboard layout ----
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
  if (wide >= 2.5) return 'w-24';
  if (wide >= 2.2) return 'w-20';
  if (wide >= 2) return 'w-16';
  if (wide >= 1.8) return 'w-16';
  if (wide >= 1.5) return 'w-14';
  return 'w-12';
};

function VirtualKeyboard({ onSelect, selectedCode, t, shiftToggle }) {
  const [shiftActive, setShiftActive] = useState(false);

  console.log('[VK render] shiftToggle=' + shiftToggle + ' shiftActive=' + shiftActive);

  const handleKeyClick = (label, value) => {
    if (value >= 0xE0 && value <= 0xE7) return;
    console.log('[VK handleKeyClick] label=' + label + ' value=0x' + value.toString(16) + ' shiftActive=' + shiftActive);
    if (shiftToggle && shiftActive) {
      // C# 旧协议使用单字节 shifted codes (如 HID 0x1E → 0x96 表示 !)
      const shiftedCode = HID_TO_CS_SHIFTED[value];
      if (shiftedCode !== undefined) {
        console.log('[VK] Adding Shift+key as C# shifted code: 0x' + shiftedCode.toString(16));
        onSelect(shiftedCode);
      } else {
        console.log('[VK] No C# shifted code for value=0x' + value.toString(16) + ', sending raw value');
        onSelect(value);
      }
    } else {
      onSelect(value);
    }
  };

  const getLabel = (key) => {
    if (shiftToggle && shiftActive) {
      const shiftedCode = HID_TO_CS_SHIFTED[key.value];
      if (shiftedCode !== undefined && CS_SHIFTED_CODES[shiftedCode]) {
        return CS_SHIFTED_CODES[shiftedCode];
      }
    }
    return key.value === 0x00 ? t('空') : key.label;
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex flex-row gap-2 min-w-[900px]">
        <div className="flex-shrink-0">
          {mainRows.map((row, ri) => (
            <div key={ri} className="flex gap-1 mb-2">
              {/* 在 Z 行 (ri===5) 左侧插入 Shift 切换按钮 */}
              {ri === 5 && shiftToggle && (
                <button
                  onClick={() => {
                    console.log('[VK Shift btn] clicked, was shiftActive=' + shiftActive);
                    setShiftActive(prev => {
                      console.log('[VK Shift btn] setting to ' + !prev);
                      return !prev;
                    });
                  }}
                  className={`h-8 px-2 text-xs border rounded transition-all flex items-center justify-center cursor-pointer select-none font-bold w-14 ${
                    shiftActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300'
                  }`}
                >
                  按住shift
                </button>
              )}
              {row.map((key, ki) => (
                <button key={ki} className={`${selectedCode === key.value ? keyActive : keyNormal} ${getWidthClass(key.wide)}`} onClick={() => handleKeyClick(key.label, key.value)}>
                  <span>{getLabel(key)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-row gap-2">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-1.5">
              {functionGrid.map((key, idx) => (
                <button key={idx} className={`${selectedCode === key.value ? keyActive : keyNormal} w-14`} onClick={() => handleKeyClick(key.label, key.value)}>
                  <span>{key.label}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <button className={`${selectedCode === 0x52 ? keyActive : keyNormal} w-10`} onClick={() => handleKeyClick('↑', 0x52)}>↑</button>
              <div className="flex gap-1.5">
                <button className={`${selectedCode === 0x50 ? keyActive : keyNormal} w-8`} onClick={() => handleKeyClick('←', 0x50)}>←</button>
                <button className={`${selectedCode === 0x51 ? keyActive : keyNormal} w-8`} onClick={() => handleKeyClick('↓', 0x51)}>↓</button>
                <button className={`${selectedCode === 0x4F ? keyActive : keyNormal} w-8`} onClick={() => handleKeyClick('→', 0x4F)}>→</button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {numpadKeys.map((key, idx) => (
              <button key={idx} className={selectedCode === key.value ? keyActive : keyNormal}
                style={{ gridRow: key.rowspan ? `span ${key.rowspan}` : 'auto', gridColumn: key.colspan ? `span ${key.colspan}` : 'auto', height: key.rowspan ? '4.25rem' : undefined }}
                onClick={() => handleKeyClick(key.label, key.value)}>
                <span>{key.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function KeyConfigPanel({ config, onChange, multiKeyOnly, multiKeyLen }) {
  const { t, lang } = useLang();
  const [activeTab, setActiveTab] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);
  const tabs = multiKeyOnly
    ? [{ label: t('多键合一'), mode: KEY_MODE.MULTI }]
    : [
        { label: t('键盘'), mode: KEY_MODE.KEYBOARD }, { label: t('鼠标'), mode: KEY_MODE.MOUSE },
        { label: t('多媒体'), mode: KEY_MODE.MEDIA }, { label: t('多键合一'), mode: KEY_MODE.MULTI },
      ];

  useEffect(() => {
    if (!multiKeyOnly && config.mode) {
      const idx = tabs.findIndex(tab => tab.mode === config.mode);
      if (idx >= 0) setActiveTab(idx);
    }
  }, [config.mode, multiKeyOnly]);

  // 按键捕获：监听键盘按下，映射为HID键码+修饰键
  const startCapture = useCallback(() => {
    setCapturing(true);
    capturingRef.current = true;
  }, []);

  useEffect(() => {
    if (!capturing) return;
    const handler = (e) => {
      if (!capturingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      // 如果是纯修饰键按下，不触发（等普通键一起按）
      if (BROWSER_MOD_TO_BIT[e.code] !== undefined) return;
      // Esc 取消捕获
      if (e.code === 'Escape') {
        setCapturing(false);
        capturingRef.current = false;
        return;
      }
      const hidCode = BROWSER_CODE_TO_HID[e.code];
      if (hidCode === undefined) return;
      // 计算修饰键位
      let modifier = 0;
      if (e.ctrlKey) modifier |= (e.code === 'ControlRight' ? 0x10 : 0x01);
      if (e.shiftKey) modifier |= (e.code === 'ShiftRight' ? 0x20 : 0x02);
      if (e.altKey) modifier |= (e.code === 'AltRight' ? 0x40 : 0x04);
      if (e.metaKey) modifier |= (e.code === 'MetaRight' ? 0x80 : 0x08);
      // 应用捕获的按键配置
      onChange({ ...config, mode: KEY_MODE.KEYBOARD, keyCode: hidCode, modifier });
      setCapturing(false);
      capturingRef.current = false;
    };
    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      capturingRef.current = false;
    };
  }, [capturing, config, onChange]);

  const currentMode = tabs[activeTab]?.mode || KEY_MODE.KEYBOARD;
  const update = (partial) => onChange({ ...config, mode: currentMode, ...partial });
  const toggleModifier = (bit) => update({ modifier: (config.modifier || 0) ^ bit });

  const addMultiKey = (keyCodeOrArray) => {
    // 支持单个值或数组（Shift+key 组合）
    const codes = Array.isArray(keyCodeOrArray) ? keyCodeOrArray : [keyCodeOrArray];
    if (codes.length === 0 || codes[0] === 0) return;
    
    console.log('[addMultiKey] received:', codes.map(c => '0x' + c.toString(16) + '(' + (KEYCODE_LABELS[c] || '?') + ')'));
    
    const keys = [...(config.multiKeys || [])];
    const remainingSlots = (multiKeyLen || 15) - keys.length;
    if (remainingSlots <= 0) return;
    
    // 一次性添加所有码（最多填满剩余槽位）
    const toAdd = codes.slice(0, remainingSlots);
    keys.push(...toAdd);
    update({ multiKeys: keys });
  };
  const removeMultiKey = (index) => {
    const keys = [...(config.multiKeys || [])];
    // C# 旧协议使用单字节 shifted codes，每个键只占一个字节
    keys.splice(index, 1);
    update({ multiKeys: keys });
  };
  const clearMultiKeys = () => update({ multiKeys: [] });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      {!multiKeyOnly && (
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl">
          {tabs.map((tab, idx) => (
            <button key={tab.mode} className={activeTab === idx ? tabActive : tabNormal} onClick={() => setActiveTab(idx)}>{tab.label}</button>
          ))}
        </div>
      )}

      {currentMode === KEY_MODE.KEYBOARD && (
        <div>
          <div className="mb-4">
            <label className="text-sm font-bold text-gray-700 mb-2.5 block">{t('修饰键 (可多选)')}</label>
            <div className="flex flex-wrap gap-2">
              {MODIFIERS.map((mod) => (
                <button key={mod.bit} className={(config.modifier || 0) & mod.bit ? chipActive : chipNormal} onClick={() => toggleModifier(mod.bit)}>{t(mod.label)}</button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{t('Mac: Win = Command ⌘ · Alt = Option ⌥')}</p>
          </div>
          <div className="mb-3">
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm font-bold text-gray-700">
                {t('按键:')} <span className="text-indigo-600 font-semibold normal-case tracking-normal">{config.keyCode ? (KEYCODE_LABELS[config.keyCode] || `0x${config.keyCode.toString(16)}`) : t('未选择')}</span>
              </label>
              <button onClick={startCapture} disabled={capturing}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer select-none ${
                  capturing
                    ? 'bg-amber-100 text-amber-700 border-2 border-amber-400 animate-pulse'
                    : 'bg-indigo-50 text-indigo-700 border-2 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-400'
                }`}>
                {capturing ? (lang === 'en' ? '⏳ Press any key...' : '⏳ 请按下按键...') : (lang === 'en' ? '🎯 Capture Key' : '🎯 捕获按键')}
              </button>
            </div>
            {capturing && (
              <div className="mb-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                {lang === 'en'
                  ? 'Press any key on your keyboard now. Modifier keys (Ctrl/Shift/Alt/Win) will be captured automatically.'
                  : '现在请在大键盘上按下你想设置的按键（可以同时按 Ctrl/Shift/Alt/Win 组合键）。按 Esc 取消。'}
              </div>
            )}
            <VirtualKeyboard selectedCode={config.keyCode} onSelect={(code) => update({ keyCode: code })} t={t} />
          </div>
        </div>
      )}

      {currentMode === KEY_MODE.MOUSE && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-gray-700 mb-2 block">{t('鼠标按键')}</label>
            <select className="rounded-lg border border-gray-200 text-sm px-3 py-2 outline-none focus:border-indigo-400 cursor-pointer max-w-xs w-full" value={mouseDeviceToIndex(config.mouseButton || 0)} onChange={(e) => update({ mouseButton: mouseIndexToDevice(Number(e.target.value)) })}>
              {MOUSE_BUTTONS.map((name, idx) => (<option key={idx} value={idx}>{t(name)}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[{ label: t('X 移动'), key: 'mouseX' }, { label: t('Y 移动'), key: 'mouseY' }, { label: t('滚轮'), key: 'mouseScroll' }].map(({ label, key }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <input type="number" className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 outline-none focus:border-indigo-400" min={0} max={255} value={config[key] || 0} onChange={(e) => update({ [key]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
        </div>
      )}

      {currentMode === KEY_MODE.MEDIA && (
        <div>
          <label className="text-sm font-bold text-gray-700 mb-3 block">{t('选择多媒体功能')}</label>
          <div className="flex flex-wrap gap-2">
            {MEDIA_KEYS.map((mk) => {
              const isSelected = config.mediaCode && mk.code.every((b, i) => b === (config.mediaCode?.[i] ?? 0));
              return (<button key={mk.label} className={isSelected ? chipActive : chipNormal} onClick={() => update({ mediaCode: mk.code })}>{t(mk.label)}</button>);
            })}
          </div>
        </div>
      )}

      {currentMode === KEY_MODE.MULTI && (
        <div>
          <div className="mb-4">
            <label className="text-sm font-bold text-gray-700 mb-2.5 block">{t('修饰键 (可选)')}</label>
            <div className="flex flex-wrap gap-2">
              {MODIFIERS.map((mod) => (
                <button key={mod.bit} className={(config.modifier || 0) & mod.bit ? chipActive : chipNormal} onClick={() => toggleModifier(mod.bit)}>{t(mod.label)}</button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{t('Mac: Win = Command ⌘ · Alt = Option ⌥')}</p>
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold text-gray-700">
                {t('按键序列')} <span className="text-indigo-600 font-semibold normal-case">({(config.multiKeys || []).length}/{multiKeyLen || 15})</span>
              </label>
              <button className="px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer" onClick={clearMultiKeys}>{t('清空')}</button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[2.5rem] p-3 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
              {(config.multiKeys || []).length === 0 ? (
                <span className="text-gray-400 text-sm">{t('点击下方键盘添加按键...')}</span>
              ) : (() => {
                // C# 旧协议使用单字节 shifted codes (如 0x96=!，0x97=@)
                // KEYCODE_LABELS 已包含这些映射，直接显示即可
                const keys = config.multiKeys;
                return keys.map((k, idx) => {
                  const label = KEYCODE_LABELS[k] || `0x${k.toString(16)}`;
                  const isShifted = CS_SHIFTED_CODES[k] !== undefined;
                  return (
                    <span key={idx} className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-full ${
                      isShifted ? 'bg-violet-600 text-white' : 'bg-indigo-600 text-white'
                    }`}>
                      {isShifted && <span className="text-[10px] opacity-70">⇧</span>}
                      {label}
                      <button className="w-4 h-4 rounded-full hover:bg-white/20 flex items-center justify-center text-white text-xs cursor-pointer" onClick={() => removeMultiKey(idx)}>x</button>
                    </span>
                  );
                });
              })()}
            </div>
          </div>
          <VirtualKeyboard selectedCode={null} onSelect={addMultiKey} t={t} shiftToggle={true} />
        </div>
      )}
    </div>
  );
}
