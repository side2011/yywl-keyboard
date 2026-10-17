import { useState, useEffect, useRef } from 'react';

// ============================================================
// 通用配置结构 (与主进程协议模块约定一致):
//   mode: 0未设置 1键盘 2鼠标 3多媒体 4多键 5宏 6延时(仅蓝牙)
//   modifier: 8位修饰掩码 (bit0-3 左Ctrl/Shift/Alt/Win, bit4-7 右)
//   keyCode / mouseButton / mouseX / mouseY / mouseScroll / mediaCode[4] / multiKeys / macroSteps
//   蓝牙扩展: mouseMod / mouseWheel / mouseBehavior / delay
// ============================================================
const MODE_LABELS = { 0: '未设置', 1: '键盘', 2: '鼠标', 3: '多媒体', 4: '多键合一', 5: '宏', 6: '延时' };
const MODE_COLORS = { 0: '#ccc', 1: '#6366f1', 2: '#f59e0b', 3: '#10b981', 4: '#8b5cf6', 5: '#ef4444', 6: '#0ea5e9' };

// 修饰键: 三种协议统一使用 8 位掩码 (各协议模块负责转换为线格式 token)
// 新协议: 位→0xE0-0xE7 token; 蓝牙V10: 位→0xF1-0xF8 token; 蓝牙旧/CH55x旧: 位掩码直用
const MODIFIERS_8 = [
  { label: '左Ctrl', bit: 0x01 }, { label: '左Shift', bit: 0x02 },
  { label: '左Alt', bit: 0x04 }, { label: '左Win', bit: 0x08 },
  { label: '右Ctrl', bit: 0x10 }, { label: '右Shift', bit: 0x20 },
  { label: '右Alt', bit: 0x40 }, { label: '右Win', bit: 0x80 },
];

const KEYCODE_LABELS = {
  0x00:'无',0x04:'A',0x05:'B',0x06:'C',0x07:'D',0x08:'E',0x09:'F',0x0A:'G',0x0B:'H',0x0C:'I',0x0D:'J',0x0E:'K',0x0F:'L',0x10:'M',0x11:'N',0x12:'O',0x13:'P',0x14:'Q',0x15:'R',0x16:'S',0x17:'T',0x18:'U',0x19:'V',0x1A:'W',0x1B:'X',0x1C:'Y',0x1D:'Z',
  0x1E:'1',0x1F:'2',0x20:'3',0x21:'4',0x22:'5',0x23:'6',0x24:'7',0x25:'8',0x26:'9',0x27:'0',
  0x28:'Enter',0x29:'Esc',0x2A:'Backspace',0x2B:'Tab',0x2C:'Space',0x2D:'-',0x2E:'=',0x2F:'[',0x30:']',0x31:'\\',0x33:';',0x34:"'",0x35:'`',0x36:',',0x37:'.',0x38:'/',
  0x39:'CapsLock',0x3A:'F1',0x3B:'F2',0x3C:'F3',0x3D:'F4',0x3E:'F5',0x3F:'F6',0x40:'F7',0x41:'F8',0x42:'F9',0x43:'F10',0x44:'F11',0x45:'F12',
  0x46:'PrtSc',0x47:'ScrLk',0x48:'Pause',0x49:'Insert',0x4A:'Home',0x4B:'PgUp',0x4C:'Delete',0x4D:'End',0x4E:'PgDn',
  0x4F:'→',0x50:'←',0x51:'↓',0x52:'↑',
  0x53:'NumLock',0x54:'Num/',0x55:'Num*',0x56:'Num-',0x57:'Num+',0x58:'NumEnter',
  0x59:'Num1',0x5A:'Num2',0x5B:'Num3',0x5C:'Num4',0x5D:'Num5',0x5E:'Num6',0x5F:'Num7',0x60:'Num8',0x61:'Num9',0x62:'Num0',0x63:'Num.',0x65:'Menu',
};

// 多媒体键 — 新协议/旧协议 (C# KeyMediaForm)
const MEDIA_KEYS = [
  { label: '播放/暂停', code: [0x04, 0xCD, 0x00, 0x00] },
  { label: '停止播放', code: [0x04, 0xB7, 0x00, 0x00] },
  { label: '上一首', code: [0x04, 0xB6, 0x00, 0x00] },
  { label: '下一首', code: [0x04, 0xB5, 0x00, 0x00] },
  { label: '我的电脑', code: [0x04, 0x94, 0x01, 0x00] },
  { label: '亮度+', code: [0x04, 0x6F, 0x00, 0x00] },
  { label: '亮度-', code: [0x04, 0x70, 0x00, 0x00] },
  { label: '打开媒体', code: [0x04, 0x83, 0x01, 0x00] },
  { label: '系统静音', code: [0x04, 0xE2, 0x00, 0x00] },
  { label: '音量+', code: [0x04, 0xEA, 0x00, 0x00] },
  { label: '音量-', code: [0x04, 0xE9, 0x00, 0x00] },
  { label: '打开计算器', code: [0x04, 0x92, 0x01, 0x00] },
  { label: '打开浏览器', code: [0x04, 0x23, 0x02, 0x00] },
  { label: '打开邮件', code: [0x04, 0x8A, 0x01, 0x00] },
  { label: '网页刷新', code: [0x04, 0x53, 0x01, 0x00] },
  { label: '网页前进', code: [0x04, 0x52, 0x01, 0x00] },
  { label: '网页后退', code: [0x04, 0x55, 0x01, 0x00] },
  { label: '低音+', code: [0x04, 0x27, 0x02, 0x00] },
  { label: '低音-', code: [0x04, 0x25, 0x02, 0x00] },
  { label: '高音+', code: [0x04, 0x24, 0x02, 0x00] },
];

// 多媒体键 — 蓝牙 QT (Consumer Usage 16bit)
const BT_MEDIA_KEYS = [
  { label: '播放/暂停', code: 0x00CD },
  { label: '停止播放', code: 0x00B7 },
  { label: '上一首', code: 0x00B6 },
  { label: '下一首', code: 0x00B5 },
  { label: '我的电脑', code: 0x0194 },
  { label: '屏幕亮度+', code: 0x006F },
  { label: '屏幕亮度-', code: 0x0070 },
  { label: '打开媒体', code: 0x0183 },
  { label: '系统静音', code: 0x00E2 },
  { label: '音量+', code: 0x00E9 },
  { label: '音量-', code: 0x00EA },
  { label: '打开计算器', code: 0x0192 },
  { label: '打开浏览器', code: 0x0223 },
  { label: '打开邮件', code: 0x018A },
  { label: '低音+', code: 0x0152 },
  { label: '低音-', code: 0x0153 },
  { label: '高音+', code: 0x0154 },
  { label: '高音-', code: 0x0155 },
  { label: '网页刷新', code: 0x0227 },
  { label: '网页前进', code: 0x0225 },
  { label: '网页后退', code: 0x0224 },
];

// 鼠标 — 新协议
const MOUSE_ACTIONS = [
  { label: '左键', code: 0x00 },
  { label: '右键', code: 0x01 },
  { label: '中键', code: 0x02 },
  { label: '滚轮上', code: 0x03 },
  { label: '滚轮下', code: 0x04 },
];

// 鼠标 — 旧协议 (设备码 0/1/2/4)
const MOUSE_BUTTONS_OLD = [
  { label: '无', code: 0x00 },
  { label: '左键', code: 0x01 },
  { label: '右键', code: 0x02 },
  { label: '中键', code: 0x04 },
];

// 鼠标 — 蓝牙 QT (16 种动作)
const BT_MOUSE_ACTIONS = [
  { label: '鼠标左键', behavior: 0x01, mod: 0x00, btn: 0x01, wheel: 0x00 },
  { label: '鼠标中键', behavior: 0x01, mod: 0x00, btn: 0x04, wheel: 0x00 },
  { label: '鼠标右键', behavior: 0x01, mod: 0x00, btn: 0x02, wheel: 0x00 },
  { label: '滚轮+', behavior: 0x01, mod: 0x00, btn: 0x00, wheel: 0x01 },
  { label: '滚轮-', behavior: 0x01, mod: 0x00, btn: 0x00, wheel: 0xFF },
  { label: 'Ctrl+滚轮+', behavior: 0x01, mod: 0xF1, btn: 0x00, wheel: 0x01 },
  { label: 'Ctrl+滚轮-', behavior: 0x01, mod: 0xF1, btn: 0x00, wheel: 0xFF },
  { label: 'Shift+滚轮+', behavior: 0x01, mod: 0xF2, btn: 0x00, wheel: 0x01 },
  { label: 'Shift+滚轮-', behavior: 0x01, mod: 0xF2, btn: 0x00, wheel: 0xFF },
  { label: 'Alt+滚轮+', behavior: 0x01, mod: 0xF3, btn: 0x00, wheel: 0x01 },
  { label: 'Alt+滚轮-', behavior: 0x01, mod: 0xF3, btn: 0x00, wheel: 0xFF },
  { label: '向左划屏', behavior: 0x04, mod: 0x01, btn: 0x00, wheel: 0x00 },
  { label: '向右划屏', behavior: 0x04, mod: 0x02, btn: 0x00, wheel: 0x00 },
  { label: '向上划屏', behavior: 0x04, mod: 0x03, btn: 0x00, wheel: 0x00 },
  { label: '向下划屏', behavior: 0x04, mod: 0x04, btn: 0x00, wheel: 0x00 },
  { label: '抖音点赞', behavior: 0x04, mod: 0x05, btn: 0x00, wheel: 0x00 },
];

// 蓝牙灯光
const BT_LED_MODES = ['灯光关闭', '模式1', '模式2', '模式3', '模式4', '模式5'];
const BT_LED_COLORS = [
  { label: '红', rgb: [0xFF, 0x00, 0x00] },
  { label: '橙', rgb: [0xFF, 0x80, 0x00] },
  { label: '黄', rgb: [0xFF, 0xFF, 0x00] },
  { label: '绿', rgb: [0x00, 0xFF, 0x00] },
  { label: '青', rgb: [0x00, 0xFF, 0xFF] },
  { label: '蓝', rgb: [0x00, 0x00, 0xFF] },
  { label: '紫', rgb: [0x80, 0x00, 0xFF] },
];

// 新协议灯光模式 (10 种, 与配置网页一致)
const NEW_LED_MODES = ['关闭灯光', '灯光常量', '流光', '按键触发', '彩虹流光', '波浪', '彩虹跑马', '呼吸', '涟漪', '交叉涟漪'];

// 旧协议型号名称
const MODEL_NAMES_OLD = {
  '1K': '1键小键盘', '2K': '2键小键盘', '2K-mini': '2键迷你',
  '3K': '3键小键盘', '4K': '4键小键盘', '5K': '5键小键盘',
  '6K': '6键小键盘', '7K-noled': '7键(无灯)', '7K': '7键小键盘',
  '8K': '8键小键盘', '9K': '9键小键盘', '12K': '12键小键盘',
  'DXN': '单旋钮', '2KPlus': '2键Plus', '3KPlus': '3键Plus',
  'FOOT': '脚踏开关', '4K-side': '4键侧插', 'FXJ': '方向键',
  'DIY10K': 'DIY 10键', 'xnAnd4K': '旋钮+4键', '8KDZ6': '8键开关款',
  '4K-side-new': '4键侧插新款', '5K-touch': '5键触摸',
  '8K-new': '8键新款', '3KDZ15': '3键定制', '10KDZ1': '10键定制',
};

const COMMON_KEYS = [
  0x1E,0x1F,0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x27,
  0x04,0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0x0C,0x0D,0x0E,0x0F,0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x1A,0x1B,0x1C,0x1D,
  0x28,0x29,0x2A,0x2B,0x2C,
  0x2D,0x2E,0x2F,0x30,0x31,0x33,0x34,0x35,0x36,0x37,0x38,
  0x3A,0x3B,0x3C,0x3D,0x3E,0x3F,0x40,0x41,0x42,0x43,0x44,0x45,
  0x4F,0x50,0x51,0x52,
  0x49,0x4A,0x4B,0x4C,0x4D,0x4E,
];

// 各协议可用的模式页
const TABS_BY_PROTO = {
  new: [0, 1, 2, 3, 4, 5],
  bt: [0, 1, 3, 2, 6],
  old: [0, 1, 2, 3, 4],
};
const TAB_LABELS = { 0: '清除', 1: '键盘', 2: '鼠标', 3: '多媒体', 4: '多键', 5: '宏', 6: '延时' };

function defaultCfg() {
  return { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0,
    mediaCode: null, multiKeys: [], macroSteps: [],
    mouseMod: null, mouseWheel: null, mouseBehavior: null, delay: null };
}

function mediaCodeEq(a, b) {
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

// ============================================================
// 按键编辑器组件 (按协议适配)
// ============================================================
function KeyEditor({ config, proto, multiKeyOnly, onSave, onClose }) {
  const cfg = config || defaultCfg();
  const tabs = multiKeyOnly ? [0, 4] : (TABS_BY_PROTO[proto] || TABS_BY_PROTO.new);
  const [tab, setTab] = useState(cfg.mode && tabs.includes(cfg.mode) ? cfg.mode : 0);
  const [modifier, setModifier] = useState(cfg.modifier || 0);
  const [keyCode, setKeyCode] = useState(cfg.keyCode || 0);
  const [mouseButton, setMouseButton] = useState(cfg.mouseButton || 0);
  const [mouseMod, setMouseMod] = useState(cfg.mouseMod ?? 0);
  const [mouseWheel, setMouseWheel] = useState(cfg.mouseWheel ?? 0);
  const [mouseBehavior, setMouseBehavior] = useState(cfg.mouseBehavior ?? 0x01);
  const [mediaCode, setMediaCode] = useState(cfg.mediaCode || null);
  const [delay, setDelay] = useState(cfg.delay || 0);
  const [multiKeys, setMultiKeys] = useState(cfg.multiKeys || []);
  const [macroSteps, setMacroSteps] = useState(cfg.macroSteps || []);

  const handleSave = () => {
    let result;
    switch (tab) {
      case 0: result = defaultCfg(); break;
      case 1: result = { ...defaultCfg(), mode: 1, modifier, keyCode }; break;
      case 2:
        result = proto === 'bt'
          ? { ...defaultCfg(), mode: 2, mouseMod, mouseButton, mouseWheel, mouseBehavior }
          : { ...defaultCfg(), mode: 2, mouseButton };
        break;
      case 3: result = { ...defaultCfg(), mode: 3, mediaCode }; break;
      case 4: result = { ...defaultCfg(), mode: 4, modifier, multiKeys }; break;
      case 5: result = { ...defaultCfg(), mode: 5, macroSteps }; break;
      case 6: result = { ...defaultCfg(), mode: 6, delay: Math.max(0, Math.min(60000, delay || 0)) }; break;
      default: result = defaultCfg();
    }
    onSave(result);
  };

  const toggleMultiKey = (k) => {
    setMultiKeys(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  const addMacroStep = (action) => {
    setMacroSteps(prev => [...prev, { action, keyCode: 0x04, delay: 0 }]);
  };
  const removeMacroStep = (idx) => {
    setMacroSteps(prev => prev.filter((_, i) => i !== idx));
  };
  const updateMacroStep = (idx, field, value) => {
    setMacroSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const s = {
    modal: { position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100 },
    panel: { background:'#fff',borderRadius:12,padding:24,width:560,maxHeight:'80vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' },
    tabs: { display:'flex',gap:8,marginBottom:16,flexWrap:'wrap' },
    tab: (active) => ({ padding:'8px 16px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:500,background:active?'#6366f1':'#f1f5f9',color:active?'#fff':'#475569' }),
    keyGrid: { display:'flex',flexWrap:'wrap',gap:6 },
    key: (active) => ({ padding:'6px 10px',borderRadius:6,border:active?'2px solid #6366f1':'1px solid #e2e8f0',cursor:'pointer',fontSize:13,background:active?'#eef2ff':'#fff',color:active?'#6366f1':'#334155',minWidth:40,textAlign:'center' }),
    modRow: { display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' },
    modBtn: (active) => ({ padding:'6px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:13,background:active?'#6366f1':'#f1f5f9',color:active?'#fff':'#475569' }),
    footer: { display:'flex',justifyContent:'flex-end',gap:12,marginTop:20 },
    btn: (primary) => ({ padding:'8px 20px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:500,fontSize:14,background:primary?'#6366f1':'#f1f5f9',color:primary?'#fff':'#475569' }),
    macroStep: { display:'flex',alignItems:'center',gap:8,padding:8,borderRadius:6,background:'#f8fafc',marginBottom:6 },
    macroBtn: { padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',cursor:'pointer',fontSize:12,background:'#fff',color:'#475569' },
  };

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.panel} onClick={e => e.stopPropagation()}>
        <div style={s.tabs}>
          {tabs.map(t => (
            <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>{TAB_LABELS[t]}</button>
          ))}
        </div>

        {tab === 0 && <p style={{color:'#64748b'}}>清除按键配置，按下后无功能。</p>}

        {tab === 1 && (
          <div>
            <div style={s.modRow}>
              {MODIFIERS_8.map(m => (
                <button key={m.bit} style={s.modBtn(modifier & m.bit)} onClick={() => setModifier(modifier ^ m.bit)}>{m.label}</button>
              ))}
            </div>
            <div style={s.keyGrid}>
              {COMMON_KEYS.map(k => (
                <div key={k} style={s.key(keyCode === k)} onClick={() => setKeyCode(k)}>
                  {KEYCODE_LABELS[k] || `0x${k.toString(16).toUpperCase()}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 2 && proto !== 'bt' && (
          <div style={s.keyGrid}>
            {(proto === 'old' ? MOUSE_BUTTONS_OLD : MOUSE_ACTIONS).map(a => (
              <div key={a.code} style={s.key(mouseButton === a.code)} onClick={() => setMouseButton(a.code)}>{a.label}</div>
            ))}
          </div>
        )}

        {tab === 2 && proto === 'bt' && (
          <div style={s.keyGrid}>
            {BT_MOUSE_ACTIONS.map((a, i) => {
              const active = mouseBehavior === a.behavior && mouseMod === a.mod && mouseButton === a.btn && mouseWheel === a.wheel;
              return (
                <div key={i} style={s.key(active)} onClick={() => {
                  setMouseBehavior(a.behavior); setMouseMod(a.mod); setMouseButton(a.btn); setMouseWheel(a.wheel);
                }}>{a.label}</div>
              );
            })}
          </div>
        )}

        {tab === 3 && (
          <div style={s.keyGrid}>
            {(proto === 'bt' ? BT_MEDIA_KEYS : MEDIA_KEYS).map((m, i) => {
              const code = proto === 'bt' ? [0x04, m.code & 0xFF, (m.code >> 8) & 0xFF, 0x00] : m.code;
              const active = mediaCodeEq(mediaCode, code);
              return (
                <div key={i} style={s.key(active)} onClick={() => setMediaCode(code)}>{m.label}</div>
              );
            })}
          </div>
        )}

        {tab === 4 && (
          <div>
            <div style={s.modRow}>
              {MODIFIERS_8.slice(0, 4).map(m => (
                <button key={m.bit} style={s.modBtn(modifier & m.bit)} onClick={() => setModifier(modifier ^ m.bit)}>{m.label}</button>
              ))}
            </div>
            <p style={{fontSize:13,color:'#64748b',marginBottom:8}}>选择多个按键 (已选 {multiKeys.length} 个)</p>
            <div style={s.keyGrid}>
              {COMMON_KEYS.map(k => (
                <div key={k} style={s.key(multiKeys.includes(k))} onClick={() => toggleMultiKey(k)}>
                  {KEYCODE_LABELS[k] || `0x${k.toString(16).toUpperCase()}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 5 && (
          <div>
            <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
              <button style={s.macroBtn} onClick={() => addMacroStep(1)}>+ 按下</button>
              <button style={s.macroBtn} onClick={() => addMacroStep(2)}>+ 按住</button>
              <button style={s.macroBtn} onClick={() => addMacroStep(3)}>+ 松开</button>
              <button style={s.macroBtn} onClick={() => addMacroStep(4)}>+ 延时</button>
            </div>
            <div style={{maxHeight:300,overflow:'auto'}}>
              {macroSteps.length === 0 && <p style={{color:'#94a3b8',fontSize:13}}>暂无步骤，点击上方按钮添加</p>}
              {macroSteps.map((step, i) => (
                <div key={i} style={s.macroStep}>
                  <span style={{fontSize:12,color:'#94a3b8',minWidth:20}}>#{i+1}</span>
                  <select
                    value={step.action}
                    onChange={(e) => updateMacroStep(i, 'action', Number(e.target.value))}
                    style={{padding:'4px 8px',borderRadius:4,border:'1px solid #e2e8f0',fontSize:13}}
                  >
                    <option value={1}>按下</option>
                    <option value={2}>按住</option>
                    <option value={3}>松开</option>
                    <option value={4}>延时</option>
                  </select>
                  {step.action !== 4 ? (
                    <select
                      value={step.keyCode}
                      onChange={(e) => updateMacroStep(i, 'keyCode', Number(e.target.value))}
                      style={{padding:'4px 8px',borderRadius:4,border:'1px solid #e2e8f0',fontSize:13,flex:1}}
                    >
                      {COMMON_KEYS.map(k => (
                        <option key={k} value={k}>{KEYCODE_LABELS[k] || `0x${k.toString(16)}`}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={step.delay || 0}
                      onChange={(e) => updateMacroStep(i, 'delay', Number(e.target.value))}
                      style={{padding:'4px 8px',borderRadius:4,border:'1px solid #e2e8f0',fontSize:13,width:80}}
                    />
                  )}
                  {step.action !== 4 && (
                    <input
                      type="number"
                      value={step.delay || 0}
                      onChange={(e) => updateMacroStep(i, 'delay', Number(e.target.value))}
                      placeholder="延时ms"
                      style={{padding:'4px 8px',borderRadius:4,border:'1px solid #e2e8f0',fontSize:13,width:70}}
                    />
                  )}
                  <button
                    onClick={() => removeMacroStep(i)}
                    style={{padding:'4px 8px',borderRadius:4,border:'none',cursor:'pointer',background:'#fee2e2',color:'#ef4444',fontSize:12}}
                  >×</button>
                </div>
              ))}
            </div>
            {macroSteps.length > 0 && <p style={{fontSize:12,color:'#94a3b8',marginTop:8}}>共 {macroSteps.length} 步</p>}
          </div>
        )}

        {tab === 6 && (
          <div>
            <p style={{fontSize:13,color:'#64748b',marginBottom:8}}>按键按下后延时的时间 (0~60000ms)。</p>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <input
                type="number" min={0} max={60000}
                value={delay}
                onChange={(e) => setDelay(Math.max(0, Math.min(60000, Number(e.target.value) || 0)))}
                style={{padding:'6px 10px',borderRadius:6,border:'1px solid #e2e8f0',fontSize:14,width:120}}
              />
              <span style={{fontSize:14,color:'#475569'}}>ms</span>
            </div>
          </div>
        )}

        <div style={s.footer}>
          <button style={s.btn(false)} onClick={onClose}>取消</button>
          <button style={s.btn(true)} onClick={handleSave}>确定</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 配置显示标签 (按协议)
// ============================================================
function getConfigLabel(cfg, proto) {
  if (!cfg || cfg.mode === 0) return '未设置';
  switch (cfg.mode) {
    case 1: {
      const label = KEYCODE_LABELS[cfg.keyCode] || (cfg.keyCode ? `0x${(cfg.keyCode || 0).toString(16)}` : '无');
      const mods = [];
      for (const m of MODIFIERS_8) if (cfg.modifier & m.bit) mods.push(m.label);
      return mods.length > 0 ? mods.join('+') + '+' + label : label;
    }
    case 2: {
      if (proto === 'bt') {
        const a = BT_MOUSE_ACTIONS.find(x => x.behavior === (cfg.mouseBehavior ?? 0x01) && x.mod === (cfg.mouseMod ?? 0) && x.btn === (cfg.mouseButton ?? 0) && x.wheel === (cfg.mouseWheel ?? 0));
        return a ? `鼠标: ${a.label}` : '鼠标: 未知';
      }
      const list = proto === 'old' ? MOUSE_BUTTONS_OLD : MOUSE_ACTIONS;
      const found = list.find(a => a.code === cfg.mouseButton);
      return `鼠标: ${found ? found.label : (cfg.mouseButton || 0)}`;
    }
    case 3: {
      if (!cfg.mediaCode) return '多媒体: 未选择';
      if (proto === 'bt') {
        const code = (cfg.mediaCode[1] || 0) | ((cfg.mediaCode[2] || 0) << 8);
        const found = BT_MEDIA_KEYS.find(m => m.code === code);
        return found ? `多媒体: ${found.label}` : `多媒体: 0x${code.toString(16)}`;
      }
      const found = MEDIA_KEYS.find(m => mediaCodeEq(m.code, cfg.mediaCode));
      return found ? `多媒体: ${found.label}` : '多媒体: 未知';
    }
    case 4: return `多键(${(cfg.multiKeys || []).length}键)`;
    case 5: return `宏 (${(cfg.macroSteps || []).length}步)`;
    case 6: return `延时: ${cfg.delay || 0}ms`;
    default: return '未知';
  }
}

// ============================================================
// 主应用
// ============================================================
export default function App() {
  const [devices, setDevices] = useState([]);
  const [connected, setConnected] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [deviceName, setDeviceName] = useState('');
  const [keyConfigs, setKeyConfigs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [toast, setToast] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const toastTimerRef = useRef(null);
  const successTimerRef = useRef(null);
  const [statusMsg, setStatusMsg] = useState('正在扫描设备...');
  const [savedConfigs, setSavedConfigs] = useState({});
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [ledState, setLedState] = useState({ mode: 0, colors: Array.from({ length: 16 }, () => ({ r: 255, g: 255, b: 255 })), mode2: null, customColor: null, customColor2: null });
  const [currentLayer, setCurrentLayer] = useState(0);
  // 在线更新
  const [appVersion, setAppVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const savingRef = useRef(false);
  const allLayerConfigsRef = useRef([]);
  const savedConfigsRef = useRef({});

  const proto = deviceInfo?.protocol || null;
  const layerCount = deviceInfo?.layerCount || 1;

  // 在线更新: 获取版本 + 监听更新事件
  useEffect(() => {
    if (window.quickConfig?.getVersion) {
      window.quickConfig.getVersion().then((v) => setAppVersion(v || '')).catch(() => {});
    }
    if (window.quickConfig?.onUpdateAvailable) {
      window.quickConfig.onUpdateAvailable((data) => {
        setUpdateInfo(data);
        showToast(`发现新版本 ${data.version}`);
      });
    }
    if (window.quickConfig?.onUpdateProgress) {
      window.quickConfig.onUpdateProgress((p) => {
        setUpdateProgress(p);
        if (p.total > 0) showToast(`正在下载更新 ${p.current}/${p.total}: ${p.file}`);
      });
    }
  }, []);

  const handleCheckUpdate = async () => {
    if (!window.quickConfig?.checkUpdate) return;
    showToast('正在检查更新...');
    const res = await window.quickConfig.checkUpdate();
    if (res.hasUpdate) {
      setUpdateInfo({ version: res.version, description: res.description, files: res.files });
      showToast(`发现新版本 ${res.version}`);
    } else if (res.error) {
      showToast(`检查更新失败: ${res.error}`);
    } else {
      showToast('已是最新版本');
    }
  };

  const handleApplyUpdate = async () => {
    if (!updateInfo || updating) return;
    setUpdating(true);
    setUpdateProgress(null);
    showToast('正在下载更新...');
    const res = await window.quickConfig.applyUpdate(updateInfo);
    if (!res.ok) {
      setUpdating(false);
      showToast(`更新失败: ${res.error || '未知错误'}`);
    }
  };

  // 根据设备信息生成型号 key (与主进程一致)
  const getModelKey = (info) => {
    if (!info) return 'unknown';
    if (info.protocol === 'bt') return `BT-${info.keyCount}+${info.knobCount || 0}`;
    if (info.protocol === 'old') return info.modelId || 'OLD-UNKNOWN';
    const parts = [`${info.keyCount}K`];
    if (info.encoderCount) parts.push(`E${info.encoderCount}`);
    if (info.layoutId) parts.push(`L${info.layoutId}`);
    return parts.join('-');
  };

  const getModelName = (key) => {
    if (key.startsWith('BT-')) return '蓝牙无线款 ' + key.slice(3);
    if (MODEL_NAMES_OLD[key]) return MODEL_NAMES_OLD[key];
    const map = { '4K': '4键系列', '7K': '7键系列', '4K-E1': '4键+编码器', '4K-E1-L5': '4键+编码器(布局5)', '12K': '12键系列' };
    return map[key] || key;
  };

  const currentModelKey = deviceInfo ? getModelKey(deviceInfo) : null;

  const showToast = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 3000);
  };

  const showSuccess = (msg) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMsg(msg);
    successTimerRef.current = setTimeout(() => setSuccessMsg(''), 2000);
  };

  // 读取当前设备全部层配置
  const autoRead = async (info) => {
    try {
      showToast('正在读取配置...');
      const lc = Math.min(Math.max(info.layerCount || 1, 1), 16);
      const total = info.protocol === 'bt' ? (info.totalSlots || info.keyCount) : info.keyCount;
      const allConfigs = [];
      for (let l = 0; l < lc; l++) {
        const configs = await window.quickConfig.readAllKeys(l, total);
        if (info.protocol === 'old' && configs && configs._led) {
          const led = configs._led;
          delete configs._led;
          if (l === 0) {
            setLedState(prev => ({
              ...prev,
              mode: led.rgbMode ?? 0,
              mode2: led.rgbMode2 ?? null,
              customColor: led.customColor ? { r: led.customColor.r, g: led.customColor.g, b: led.customColor.b } : null,
              customColor2: led.customColor2 ? { r: led.customColor2.r, g: led.customColor2.g, b: led.customColor2.b } : null,
            }));
          }
        }
        allConfigs.push(Array.isArray(configs) ? configs : []);
      }
      allLayerConfigsRef.current = allConfigs;
      setKeyConfigs(allConfigs[0] || []);
      setCurrentLayer(0);
      // 新协议/蓝牙: 读灯光
      if (info.protocol !== 'old' && info.backlightType && info.backlightType > 0) {
        try {
          const led = await window.quickConfig.readLedLayer(0);
          if (led && led.protocol !== 'old') {
            setLedState(prev => ({ ...prev, mode: led.mode ?? 0, colors: led.colors || prev.colors }));
          }
        } catch (e) { /* ignore */ }
      }
      showToast('已连接，配置读取完成');
    } catch (e) {
      showToast('已连接，但读取失败: ' + e.message);
    }
  };

  // 连接后: 有勾选自动下载的匹配配置则直接下载(不读键盘)，否则读取键盘配置
  const afterConnected = (info) => {
    // 旧协议需要手动选型 → 不自动读取
    if (info.protocol === 'old' && info.needModelSelect) {
      showToast('请选择设备型号');
      return;
    }
    const targetKey = getModelKey(info);
    const list = savedConfigsRef.current[targetKey] || [];
    const autoCfg = info?.keyCount && list.find(c => {
      if (!c.autoDownload) return false;
      const cfgKeys = (c.layers?.[0]?.length) || (c.keyConfigs?.length) || 0;
      return cfgKeys === info.keyCount;
    });
    if (autoCfg) {
      const layers = (Array.isArray(autoCfg.layers) && autoCfg.layers.length > 0)
        ? autoCfg.layers : [autoCfg.keyConfigs];
      allLayerConfigsRef.current = layers;
      setKeyConfigs(layers[autoCfg.layer ?? 0] || layers[0]);
      setCurrentLayer(autoCfg.layer ?? 0);
      (async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        try {
          await new Promise(r => setTimeout(r, 500));
          for (let l = layers.length - 1; l >= 0; l--) {
            setProgress({ current: layers.length - 1 - l, total: layers.length, label: `自动下载 层${l + 1}/${layers.length}...` });
            await window.quickConfig.saveAll(layers[l], l);
          }
          setCurrentLayer(0);
          setKeyConfigs(layers[0]);
          showSuccess(`自动下载完成: ${autoCfg.name} (${layers.length}层)`);
        } catch (e) {
          showToast('自动下载失败: ' + e.message);
        }
        setSaving(false);
        setProgress(null);
        savingRef.current = false;
      })();
    } else {
      autoRead(info);
    }
  };

  // 监听设备状态变化 (主进程自动连接)
  useEffect(() => {
    window.quickConfig.onDeviceStatus((data) => {
      if (data.status === 'connected') {
        setConnected(true);
        setDeviceInfo(data.info);
        setDeviceName(data.device?.product || '未知设备');
        setKeyConfigs([]);
        setStatusMsg('');
        afterConnected(data.info);
      } else if (data.status === 'disconnected') {
        setConnected(false);
        setDeviceInfo(null);
        setDeviceName('');
        setKeyConfigs([]);
        setLedState({ mode: 0, colors: Array.from({ length: 16 }, () => ({ r: 255, g: 255, b: 255 })), mode2: null, customColor: null, customColor2: null });
        setStatusMsg('设备已断开');
      } else if (data.status === 'error') {
        showToast('连接错误: ' + data.error);
      }
    });

    window.quickConfig.onProgress((data) => {
      setProgress(data);
    });

    window.quickConfig.getStatus().then(async status => {
      if (status.connected) {
        setConnected(true);
        setDeviceInfo(status.info);
        setStatusMsg('');
        await refreshSavedConfigs();
        afterConnected(status.info);
      }
    });
  }, []);

  // 自动扫描设备列表
  useEffect(() => {
    const doScan = async () => {
      try {
        const devs = await window.quickConfig.scan();
        setDevices(devs);
        if (devs.length === 0 && !connected) {
          setStatusMsg('正在扫描设备... 请连接键盘');
        }
      } catch {}
    };
    doScan();
    const timer = setInterval(doScan, 2000);
    return () => clearInterval(timer);
  }, [connected]);

  const refreshSavedConfigs = async () => {
    try {
      const all = await window.quickConfig.listConfigs();
      setSavedConfigs(all);
      savedConfigsRef.current = all;
    } catch {}
  };

  useEffect(() => {
    refreshSavedConfigs();
  }, []);

  useEffect(() => {
    if (connected) refreshSavedConfigs();
  }, [connected]);

  const handleConnect = async (devPath) => {
    try {
      await window.quickConfig.connect(devPath);
      showToast('连接中...');
    } catch (e) {
      showToast('连接失败: ' + e.message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.quickConfig.disconnect();
    } catch {}
    setConnected(false);
    setDeviceInfo(null);
    setDeviceName('');
    setKeyConfigs([]);
    setCurrentLayer(0);
    allLayerConfigsRef.current = [];
  };

  // 旧协议: 手动选型
  const handleSelectOldModel = async (modelId) => {
    try {
      const info = await window.quickConfig.setOldModel(modelId);
      setDeviceInfo(info);
      setKeyConfigs([]);
      autoRead(info);
    } catch (e) {
      showToast('设置型号失败: ' + e.message);
    }
  };

  const handleLayerChange = (newLayer) => {
    if (newLayer === currentLayer) return;
    setCurrentLayer(newLayer);
    if (allLayerConfigsRef.current[newLayer]) {
      setKeyConfigs(allLayerConfigsRef.current[newLayer]);
    } else {
      setKeyConfigs([]);
    }
  };

  const handleReadConfig = async () => {
    if (!deviceInfo) return;
    try {
      showToast(`读取层${currentLayer + 1}配置...`);
      const total = proto === 'bt' ? (deviceInfo.totalSlots || deviceInfo.keyCount) : deviceInfo.keyCount;
      const configs = await window.quickConfig.readAllKeys(currentLayer, total);
      if (proto === 'old' && configs && configs._led) {
        const led = configs._led;
        delete configs._led;
        setLedState(prev => ({ ...prev, mode: led.rgbMode ?? 0, mode2: led.rgbMode2 ?? null,
          customColor: led.customColor ? { r: led.customColor.r, g: led.customColor.g, b: led.customColor.b } : null,
          customColor2: led.customColor2 ? { r: led.customColor2.r, g: led.customColor2.g, b: led.customColor2.b } : null }));
      }
      setKeyConfigs(Array.isArray(configs) ? configs : []);
      const cached = [...allLayerConfigsRef.current];
      cached[currentLayer] = Array.isArray(configs) ? configs : [];
      allLayerConfigsRef.current = cached;
      showToast(`层${currentLayer + 1}读取完成`);
    } catch (e) {
      showToast('读取失败: ' + e.message);
    }
  };

  // ---- 配置导入 (兼容网页版三种协议导出的 JSON) ----
  // 蓝牙网页配置 → 通用配置
  const btWebToCanon = (cfg) => {
    const c = defaultCfg();
    if (!cfg) return c;
    c.modifier = cfg.modifierMask || 0;
    c.keyCode = cfg.keyCode || 0;
    c.delay = cfg.delay || null;
    switch (cfg.mode) {
      case 1: c.mode = 1; break;
      case 2: {
        c.mode = 3;
        const code = cfg.mediaCode || 0;
        c.mediaCode = [0x04, code & 0xFF, (code >> 8) & 0xFF, 0x00];
        break;
      }
      case 3: {
        c.mode = 2;
        if (cfg.mouse) {
          c.mouseMod = cfg.mouse.mod ?? 0;
          c.mouseButton = cfg.mouse.btn ?? 0;
          c.mouseWheel = cfg.mouse.wheel ?? 0;
          c.mouseBehavior = cfg.mouse.behavior ?? 0x01;
        }
        break;
      }
      case 5: c.mode = 6; break;
      default: c.mode = 0;
    }
    return c;
  };

  // 新协议/旧协议网页配置 → 通用配置 (结构基本一致, 补齐字段)
  const plainToCanon = (cfg) => {
    const c = defaultCfg();
    if (!cfg) return c;
    c.mode = cfg.mode === 5 ? 5 : (cfg.mode === 6 ? 6 : (cfg.mode || 0));
    c.modifier = cfg.modifier || 0;
    c.keyCode = cfg.keyCode || 0;
    c.mouseButton = cfg.mouseButton || 0;
    c.mouseX = cfg.mouseX || 0;
    c.mouseY = cfg.mouseY || 0;
    c.mouseScroll = cfg.mouseScroll || 0;
    c.mediaCode = Array.isArray(cfg.mediaCode) ? cfg.mediaCode : null;
    c.multiKeys = Array.isArray(cfg.multiKeys) ? cfg.multiKeys : [];
    c.macroSteps = Array.isArray(cfg.macroSteps) ? cfg.macroSteps : [];
    return c;
  };

  const normalizeLayerCfgs = (layerCfgs, proto) => {
    const conv = proto === 'bt' ? btWebToCanon : plainToCanon;
    return (Array.isArray(layerCfgs) ? layerCfgs : []).map(cfg => {
      // 网页版新协议 mode 与通用一致; 网页版旧协议 mode 0-4 一致
      const cc = conv(cfg);
      return cc;
    });
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          const configs = (Array.isArray(data) ? data : [data]).filter(c => c && (c.keyConfigs || c.layers));
          if (configs.length === 0) { showToast('无效的配置文件'); return; }

          // 推断每个配置所属协议 (键盘ID前缀)
          const inferProto = (cfg) => {
            const kid = String(cfg.keyboardId || cfg.modelId || '');
            if (kid.startsWith('BT-') || kid === 'BT') return 'bt';
            if (kid === 'AC632N') return 'new';
            if (MODEL_NAMES_OLD[kid]) return 'old';
            return proto || 'new';
          };

          const keyCountOf = (cfg) => (cfg.layers?.[0]?.length) || (cfg.keyConfigs?.length) || 0;
          const addedNames = new Set();
          let saved = 0, skipped = 0;
          for (const cfg of configs) {
            const n = keyCountOf(cfg);
            if (!n) { skipped++; continue; }
            const cfgProto = inferProto(cfg);
            // 目标型号 key: 优先当前设备
            let mk;
            if (connected) {
              mk = currentModelKey;
            } else if (cfgProto === 'bt') {
              const m = String(cfg.keyboardId || '').match(/BT-(\d+)\+(\d+)/);
              mk = m ? `BT-${m[1]}+${m[2]}` : `BT-${n}+0`;
            } else if (cfgProto === 'old' && MODEL_NAMES_OLD[cfg.keyboardId]) {
              mk = cfg.keyboardId;
            } else {
              mk = cfg.keyboardId || `${n}K`;
            }
            const name = cfg.configName || cfg.name || `导入_${new Date(cfg.createdAt || Date.now()).toLocaleString('zh-CN')}`;
            const existing = savedConfigsRef.current[mk] || [];
            if (existing.some(c => c.name === name) || addedNames.has(mk + '|' + name)) { skipped++; continue; }
            addedNames.add(mk + '|' + name);

            // 提取各层配置并归一化
            let layers = (Array.isArray(cfg.layers) && cfg.layers.length > 0) ? cfg.layers : [cfg.keyConfigs];
            if (cfgProto === 'bt' && cfg.extra?.layers && Array.isArray(cfg.extra.layers) && cfg.extra.layers.length > 0) {
              layers = cfg.extra.layers;
            }
            const normalized = layers.map(l => normalizeLayerCfgs(l, cfgProto));
            // 蓝牙单层款只保留第一层
            if (cfgProto === 'bt') {
              const isV10 = cfg.extra?.layers?.length > 1 || normalized.length > 1;
              if (!isV10 && normalized.length > 1) normalized.splice(1);
            }
            try {
              await window.quickConfig.saveConfig(mk, name, normalized[0], { layer: cfg.layer ?? 0, layers: normalized });
              saved++;
            } catch (e) { skipped++; }
          }

          const first = configs[0];
          const firstProto = inferProto(first);
          let firstLayers = (Array.isArray(first.layers) && first.layers.length > 0) ? first.layers : [first.keyConfigs];
          if (firstProto === 'bt' && first.extra?.layers && Array.isArray(first.extra.layers) && first.extra.layers.length > 0) {
            firstLayers = first.extra.layers;
          }
          const normFirst = firstLayers.map(l => normalizeLayerCfgs(l, firstProto));
          if (connected && firstProto === proto) {
            allLayerConfigsRef.current = normFirst;
            setKeyConfigs(normFirst[first.layer ?? 0] || normFirst[0]);
            setCurrentLayer(first.layer ?? 0);
          }
          showToast(`已导入 ${saved} 个配置到列表${skipped ? `，跳过 ${skipped} 个(同名或无效)` : ''}`);
          refreshSavedConfigs();
        } catch (err) {
          showToast('解析失败: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExport = () => {
    const allLayers = allLayerConfigsRef.current.length > 0 ? allLayerConfigsRef.current : [keyConfigs];
    const config = {
      configName: '快速配置',
      keyboardId: currentModelKey || 'unknown',
      proto: proto || 'new',
      keyConfigs: allLayers[0] || keyConfigs,
      layers: allLayers,
      layer: currentLayer,
      createdAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keyboard-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${allLayers.length} 层配置`);
  };

  const handleSave = async () => {
    if (!connected || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const cached = [...allLayerConfigsRef.current];
      cached[currentLayer] = keyConfigs;
      allLayerConfigsRef.current = cached;
      const totalLayers = cached.length || 1;
      for (let l = totalLayers - 1; l >= 0; l--) {
        const layerCfgs = cached[l] || keyConfigs;
        setProgress({ current: totalLayers - 1 - l, total: totalLayers, label: `下载到层${l + 1}/${totalLayers}...` });
        await window.quickConfig.saveAll(layerCfgs, l);
      }
      if (totalLayers > 1) {
        setCurrentLayer(0);
        setKeyConfigs(cached[0] || keyConfigs);
      }
      showSuccess(`${totalLayers > 1 ? `${totalLayers}层配置` : '配置'}保存成功!`);
    } catch (e) {
      showToast('保存失败: ' + e.message);
    }
    setSaving(false);
    setProgress(null);
    savingRef.current = false;
  };

  const handleKeySave = (idx, cfg) => {
    setKeyConfigs(prev => {
      const next = [...prev];
      next[idx] = cfg;
      const cached = [...allLayerConfigsRef.current];
      cached[currentLayer] = next;
      allLayerConfigsRef.current = cached;
      return next;
    });
    setEditing(null);
  };

  const handleOpenSaveDialog = () => {
    if (keyConfigs.length === 0) { showToast('没有可保存的配置'); return; }
    if (!currentModelKey) { showToast('请先连接设备'); return; }
    setSaveName('配置1');
    setSaveDialogOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!saveName.trim()) { showToast('请输入名称'); return; }
    try {
      const allLayers = allLayerConfigsRef.current.length > 0 ? allLayerConfigsRef.current : [keyConfigs];
      await window.quickConfig.saveConfig(currentModelKey, saveName.trim(), keyConfigs, { layer: currentLayer, layers: allLayers });
      showToast(`已保存 ${allLayers.length} 层配置`);
      setSaveDialogOpen(false);
      setSaveName('');
      refreshSavedConfigs();
    } catch (e) {
      showToast('保存失败: ' + e.message);
    }
  };

  const handleLoadConfig = (cfg) => {
    const targetLayer = cfg.layer ?? 0;
    if (cfg.layers && Array.isArray(cfg.layers) && cfg.layers.length > 1) {
      allLayerConfigsRef.current = cfg.layers;
      setKeyConfigs(cfg.layers[targetLayer] || cfg.layers[0]);
      setCurrentLayer(targetLayer);
      showToast(`已加载: ${cfg.name} (${cfg.layers.length}层)`);
    } else {
      setKeyConfigs(cfg.keyConfigs);
      setCurrentLayer(targetLayer);
      const cached = [...allLayerConfigsRef.current];
      cached[targetLayer] = cfg.keyConfigs;
      allLayerConfigsRef.current = cached;
      showToast(`已加载: ${cfg.name} (层${targetLayer + 1})`);
    }
  };

  const handleToggleAuto = async (modelKey, configId, enabled) => {
    try {
      await window.quickConfig.setConfigAuto(modelKey, configId, enabled);
      refreshSavedConfigs();
      if (enabled) showToast('已设置: 连接设备时自动下载此配置');
    } catch (e) {
      showToast('设置失败: ' + e.message);
    }
  };

  const handleDeleteConfig = async (modelKey, configId) => {
    try {
      await window.quickConfig.deleteConfig(modelKey, configId);
      showToast('已删除');
      refreshSavedConfigs();
    } catch (e) {
      showToast('删除失败: ' + e.message);
    }
  };

  const handleApplyConfig = async (cfg) => {
    if (!connected) { showToast('请先连接设备'); return; }
    if (savingRef.current) return;
    const targetLayer = cfg.layer ?? 0;
    setDownloadingId(cfg.id);

    if (cfg.layers && Array.isArray(cfg.layers) && cfg.layers.length > 1) {
      allLayerConfigsRef.current = cfg.layers;
      setKeyConfigs(cfg.layers[targetLayer] || cfg.layers[0]);
      setCurrentLayer(targetLayer);
      setProgress({ current: 0, total: cfg.layers.length, label: '下载多层配置...' });
      try {
        for (let l = cfg.layers.length - 1; l >= 0; l--) {
          setProgress({ current: cfg.layers.length - 1 - l, total: cfg.layers.length, label: `下载到层${l + 1}/${cfg.layers.length}...` });
          await window.quickConfig.saveAll(cfg.layers[l], l);
        }
        setCurrentLayer(0);
        setKeyConfigs(cfg.layers[0]);
        showSuccess(`"${cfg.name}" 已下载 ${cfg.layers.length} 层配置`);
        refreshSavedConfigs();
      } catch (e) {
        showToast('下载失败: ' + e.message);
      }
    } else {
      setKeyConfigs(cfg.keyConfigs);
      setCurrentLayer(targetLayer);
      const cached = [...allLayerConfigsRef.current];
      cached[targetLayer] = cfg.keyConfigs;
      allLayerConfigsRef.current = cached;
      setProgress({ current: 0, total: cfg.keyConfigs.length, label: `下载到层${targetLayer + 1}...` });
      try {
        await window.quickConfig.saveAll(cfg.keyConfigs, targetLayer);
        showSuccess(`"${cfg.name}" 已下载到层${targetLayer + 1}`);
        refreshSavedConfigs();
      } catch (e) {
        showToast('下载失败: ' + e.message);
      }
    }
    setDownloadingId(null);
    setProgress(null);
  };

  // ---- 灯光处理 (按协议) ----
  const applyLed = async (next) => {
    try {
      showToast('正在设置灯光...');
      if (proto === 'old') {
        await window.quickConfig.writeLedLayer(0, next.mode, null, {
          mode2: next.mode2,
          customColor: next.customColor,
          customColor2: next.customColor2,
        });
      } else {
        await window.quickConfig.writeLedLayer(0, next.mode, next.colors || ledState.colors);
      }
      setLedState(next);
      showToast('灯光已保存');
    } catch (err) {
      showToast('灯光设置失败: ' + err.message);
    }
  };

  const handleLedModeChange = async (newMode) => {
    await applyLed({ ...ledState, mode: newMode });
  };

  const handleLedColorPick = async (rgb) => {
    const colors = Array.from({ length: 16 }, () => ({ r: rgb[0], g: rgb[1], b: rgb[2] }));
    await applyLed({ ...ledState, colors });
  };

  const s = {
    app: { fontFamily:'"Microsoft YaHei","Segoe UI",sans-serif',background:'#f8fafc',minHeight:'100vh',padding:24 },
    header: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 },
    title: { fontSize:20,fontWeight:700,color:'#1e293b' },
    card: { background:'#fff',borderRadius:12,padding:20,marginBottom:16,boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
    row: { display:'flex',gap:12,alignItems:'center',flexWrap:'wrap' },
    btn: (color) => ({ padding:'8px 16px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:500,fontSize:14,background:color||'#6366f1',color:'#fff' }),
    btnOutline: { padding:'8px 16px',borderRadius:8,border:'1px solid #e2e8f0',cursor:'pointer',fontWeight:500,fontSize:14,background:'#fff',color:'#475569' },
    badge: (color) => ({ display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:12,fontWeight:500,background:color||'#ccc',color:'#fff' }),
    keyGrid: { display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10 },
    keyItem: { padding:12,borderRadius:8,border:'1px solid #e2e8f0',cursor:'pointer',textAlign:'center',transition:'all 0.15s' },
    info: { fontSize:13,color:'#64748b' },
    toast: { position:'fixed',top:20,right:20,padding:'12px 20px',borderRadius:8,background:'#1e293b',color:'#fff',fontSize:14,zIndex:200,boxShadow:'0 4px 12px rgba(0,0,0,0.15)' },
  };

  const protoLabel = proto === 'bt' ? '蓝牙无线款' : proto === 'old' ? '经典款' : proto === 'new' ? '新协议款' : '';

  return (
    <div style={s.app}>
      <div style={s.header}>
        <div style={s.title}>YYWL 快速配置工具</div>
        <div style={s.row}>
          <span style={{fontSize:12,color:'#94a3b8'}}>{appVersion ? `v${appVersion}` : ''}</span>
          <button style={s.btnOutline} onClick={handleCheckUpdate}>检查更新</button>
          <button style={s.btnOutline} onClick={handleImport}>导入配置</button>
          {keyConfigs.length > 0 && <button style={s.btnOutline} onClick={handleExport}>导出配置</button>}
          {keyConfigs.length > 0 && <button style={s.btn('#6366f1')} onClick={handleOpenSaveDialog}>保存配置</button>}
        </div>
      </div>

      {updateInfo && (
        <div style={{
          display:'flex',alignItems:'center',gap:12,marginBottom:16,padding:'10px 16px',
          borderRadius:10,background:'#eef2ff',border:'1px solid #c7d2fe',
        }}>
          <span style={{flex:1,fontSize:13,color:'#3730a3'}}>
            发现新版本 <b>{updateInfo.version}</b>
            {updateInfo.description ? `：${updateInfo.description}` : ''}
            {updateProgress && updateProgress.total > 0 && ` (下载中 ${updateProgress.current}/${updateProgress.total})`}
          </span>
          <button
            style={updating ? {...s.btn('#c7d2fe'),cursor:'default'} : s.btn('#6366f1')}
            onClick={handleApplyUpdate}
            disabled={updating}
          >{updating ? '更新中...' : '立即更新'}</button>
        </div>
      )}

      <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
        {/* ===== 左栏 ===== */}
        <div style={{flex:1,minWidth:0}}>
          {/* 设备列表 */}
          <div style={s.card}>
            <div style={{fontWeight:600,marginBottom:12}}>设备</div>
            {!connected && devices.length === 0 && (
              <div style={s.info}>{statusMsg}</div>
            )}
            <div style={s.row}>
              {devices.map((d, i) => (
                <div key={i} style={{...s.row,gap:8}}>
                  <span style={s.info}>{d.product || `VID:${d.vendorId.toString(16)} PID:${d.productId.toString(16)}`}</span>
                  {!connected && <button style={s.btn('#10b981')} onClick={() => handleConnect(d.path)}>连接</button>}
                </div>
              ))}
              {connected && (
                <div style={s.row}>
                  <span style={{color:'#10b981',fontWeight:500}}>已连接: {deviceName}</span>
                  <button style={s.btnOutline} onClick={handleDisconnect}>断开</button>
                </div>
              )}
            </div>
          </div>

          {/* 设备信息 */}
          {connected && deviceInfo && (
            <div style={s.card}>
              <div style={{fontWeight:600,marginBottom:8}}>设备信息</div>
              <div style={s.row}>
                {protoLabel && <span style={{...s.badge(proto === 'bt' ? '#8b5cf6' : proto === 'old' ? '#0ea5e9' : '#6366f1')}}>{protoLabel}</span>}
                <span style={s.info}>按键数: {deviceInfo.keyCount}</span>
                {deviceInfo.encoderCount !== undefined && <span style={s.info}>编码器: {deviceInfo.encoderCount || 0}</span>}
                {deviceInfo.knobCount !== undefined && <span style={s.info}>旋钮: {deviceInfo.knobCount || 0}</span>}
                <span style={s.info}>层数: {deviceInfo.layerCount}</span>
                {deviceInfo.modelName && <span style={s.info}>型号: {deviceInfo.modelName}</span>}
                {deviceInfo.hardwareVersion !== undefined && <span style={s.info}>硬件版本: {deviceInfo.hardwareVersion}</span>}
                {deviceInfo.layoutId !== undefined && <span style={s.info}>布局: {deviceInfo.layoutId}</span>}
              </div>
              {/* 旧协议手动选型 */}
              {proto === 'old' && deviceInfo.needModelSelect && (
                <div style={{...s.row,marginTop:10}}>
                  <span style={{fontSize:13,color:'#475569',fontWeight:500}}>选择型号:</span>
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && handleSelectOldModel(e.target.value)}
                    style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',color:'#334155',cursor:'pointer',outline:'none'}}
                  >
                    <option value="" disabled>请选择设备型号</option>
                    {Object.entries(MODEL_NAMES_OLD).map(([key, name]) => (
                      <option key={key} value={key}>{name} ({key})</option>
                    ))}
                  </select>
                </div>
              )}
              {layerCount > 1 && (
                <div style={{...s.row,marginTop:10}}>
                  <span style={{fontSize:13,color:'#475569',fontWeight:500}}>配置层:</span>
                  {Array.from({ length: layerCount }, (_, i) => (
                    <button key={i} onClick={() => handleLayerChange(i)} style={{
                      padding:'6px 16px',borderRadius:6,border:'none',cursor:'pointer',
                      fontWeight:600,fontSize:14,
                      background:currentLayer === i ? '#6366f1' : '#f1f5f9',
                      color:currentLayer === i ? '#fff' : '#475569',
                      transition:'all 0.15s',
                    }}>层{i + 1}</button>
                  ))}
                </div>
              )}
              {/* 灯光 — 按协议 */}
              {proto === 'new' && (
                <div style={{...s.row,marginTop:10}}>
                  <span style={{fontSize:13,color:'#475569',fontWeight:500}}>灯光模式:</span>
                  <select
                    value={ledState.mode}
                    onChange={(e) => handleLedModeChange(Number(e.target.value))}
                    style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',color:'#334155',cursor:'pointer',outline:'none'}}
                  >
                    {NEW_LED_MODES.map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
              {proto === 'bt' && (
                <div style={{marginTop:10}}>
                  <div style={{fontSize:13,color:'#475569',fontWeight:500,marginBottom:8}}>灯光:</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
                    {BT_LED_MODES.map((m, i) => (
                      <button key={i} onClick={() => handleLedModeChange(i)} style={{
                        padding:'6px 14px',borderRadius:6,border:'none',cursor:'pointer',fontWeight:500,fontSize:13,
                        background:ledState.mode === i ? '#6366f1' : '#f1f5f9',
                        color:ledState.mode === i ? '#fff' : '#475569',
                      }}>{m}</button>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontSize:13,color:'#475569'}}>颜色:</span>
                    {BT_LED_COLORS.map((c, i) => {
                      const sel = ledState.colors.length > 0 &&
                        ledState.colors.every(cl => cl.r === c.rgb[0] && cl.g === c.rgb[1] && cl.b === c.rgb[2]);
                      return (
                        <button key={i} title={c.label} onClick={() => handleLedColorPick(c.rgb)} style={{
                          width:34,height:34,borderRadius:8,cursor:'pointer',border:sel ? '3px solid #6366f1' : '1px solid #e2e8f0',
                          background:`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`,boxShadow:sel ? '0 0 0 3px rgba(99,102,241,0.25)' : 'none',
                        }} />
                      );
                    })}
                  </div>
                  {layerCount > 1 && <div style={{fontSize:12,color:'#94a3b8',marginTop:8}}>灯光保存时应用到所有层。</div>}
                </div>
              )}
              {proto === 'old' && deviceInfo.backlightType > 0 && (
                <div style={{marginTop:10}}>
                  <div style={{...s.row,marginBottom:8}}>
                    <span style={{fontSize:13,color:'#475569',fontWeight:500}}>灯光模式:</span>
                    <select
                      value={ledState.mode}
                      onChange={(e) => handleLedModeChange(Number(e.target.value))}
                      style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',color:'#334155',cursor:'pointer',outline:'none'}}
                    >
                      {(deviceInfo.rgbModes || []).map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                      ))}
                    </select>
                  </div>
                  {deviceInfo.dualZone && deviceInfo.rgbModes2 && (
                    <div style={{...s.row,marginBottom:8}}>
                      <span style={{fontSize:13,color:'#475569',fontWeight:500}}>灯光2模式:</span>
                      <select
                        value={ledState.mode2 ?? 0}
                        onChange={async (e) => {
                          const next = { ...ledState, mode2: Number(e.target.value) };
                          await applyLed(next);
                        }}
                        style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',color:'#334155',cursor:'pointer',outline:'none'}}
                      >
                        {deviceInfo.rgbModes2.map((m, i) => (
                          <option key={i} value={i}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{...s.row}}>
                    <span style={{fontSize:13,color:'#475569',fontWeight:500}}>自定义颜色:</span>
                    <input
                      type="color"
                      value={ledState.customColor ? `#${[ledState.customColor.r, ledState.customColor.g, ledState.customColor.b].map(v => v.toString(16).padStart(2, '0')).join('')}` : '#ffffff'}
                      onChange={async (e) => {
                        const hex = e.target.value.replace('#', '');
                        const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
                        const next = { ...ledState, customColor: { r, g, b } };
                        await applyLed(next);
                      }}
                      style={{width:40,height:30,borderRadius:6,border:'1px solid #e2e8f0',cursor:'pointer',padding:0,background:'#fff'}}
                    />
                    {deviceInfo.dualZone && (
                      <>
                        <span style={{fontSize:13,color:'#475569',fontWeight:500}}>颜色2:</span>
                        <input
                          type="color"
                          value={ledState.customColor2 ? `#${[ledState.customColor2.r, ledState.customColor2.g, ledState.customColor2.b].map(v => v.toString(16).padStart(2, '0')).join('')}` : '#ffffff'}
                          onChange={async (e) => {
                            const hex = e.target.value.replace('#', '');
                            const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
                            const next = { ...ledState, customColor2: { r, g, b } };
                            await applyLed(next);
                          }}
                          style={{width:40,height:30,borderRadius:6,border:'1px solid #e2e8f0',cursor:'pointer',padding:0,background:'#fff'}}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
              <div style={{...s.row,marginTop:12}}>
                <button style={s.btn('#10b981')} onClick={handleReadConfig}>读取层{currentLayer + 1}</button>
              </div>
            </div>
          )}

          {/* 按键配置网格 */}
          {keyConfigs.length > 0 && (
            <div style={s.card}>
              <div style={{fontWeight:600,marginBottom:12}}>按键配置 · 层{currentLayer + 1} ({keyConfigs.length} 键)</div>
              <div style={s.keyGrid}>
                {keyConfigs.map((cfg, i) => (
                  <div key={i} style={s.keyItem} onClick={() => setEditing(i)}>
                    <div style={{fontSize:12,color:'#94a3b8',marginBottom:4}}>按键 {i+1}</div>
                    <div style={s.badge(MODE_COLORS[cfg?.mode || 0])}>
                      {MODE_LABELS[cfg?.mode || 0]}
                    </div>
                    <div style={{fontSize:13,marginTop:6,color:'#334155',fontWeight:500}}>
                      {getConfigLabel(cfg, proto)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 下载按钮 */}
          {connected && keyConfigs.length > 0 && (
            <div style={s.card}>
              <div style={s.row}>
                <button
                  style={{...s.btn(saving ? '#94a3b8' : '#6366f1'),padding:'12px 32px',fontSize:16}}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? '下载中...' : '下载到键盘'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ===== 右栏: 本地配置列表 ===== */}
        <div style={{width:300,flexShrink:0,position:'sticky',top:24}}>
          <div style={s.card}>
            <div style={{fontWeight:600,marginBottom:12}}>本地配置</div>
            {Object.keys(savedConfigs).length === 0 && (
              <div style={{fontSize:13,color:'#94a3b8'}}>暂无保存的配置</div>
            )}
            {Object.entries(savedConfigs).map(([mk, configs]) => {
              if (!configs || configs.length === 0) return null;
              const isCurrent = mk === currentModelKey;
              return (
                <div key={mk} style={{marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:500,color:'#334155'}}>{getModelName(mk)}</span>
                    {isCurrent && <span style={{...s.badge('#10b981'),fontSize:10,padding:'1px 6px'}}>当前</span>}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {configs.map(cfg => (
                      <div key={cfg.id} style={{
                        padding:'10px 12px',borderRadius:8,
                        border: isCurrent ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                        background: isCurrent ? '#eef2ff' : '#f8fafc',
                      }}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
                          <div style={{fontSize:13,fontWeight:500,color:'#1e293b'}}>{cfg.name}</div>
                          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:cfg.autoDownload ? '#4f46e5' : '#94a3b8',cursor:'pointer',flexShrink:0}} title="设备连接时自动下载此配置（不读取键盘）">
                            <input
                              type="checkbox"
                              checked={!!cfg.autoDownload}
                              onChange={(e) => handleToggleAuto(mk, cfg.id, e.target.checked)}
                              style={{width:14,height:14,cursor:'pointer'}}
                            />
                            自动下载
                          </label>
                        </div>
                        <div style={{fontSize:11,color:'#94a3b8',marginBottom:8}}>
                          {(cfg.keyConfigs?.length || 0)} 键{cfg.layers && cfg.layers.length > 1 ? ` · ${cfg.layers.length}层` : ` · 层${(cfg.layer ?? 0) + 1}`} · {new Date(cfg.savedAt).toLocaleString('zh-CN')}
                        </div>
                        <div style={{display:'flex',gap:6}}>
                          {isCurrent && connected && (
                            <button
                              style={{
                                ...s.btn(downloadingId === cfg.id ? '#94a3b8' : '#6366f1'),
                                padding:'5px 10px',fontSize:12,borderRadius:6,flex:1,
                              }}
                              onClick={() => handleApplyConfig(cfg)}
                              disabled={downloadingId === cfg.id}
                            >
                              {downloadingId === cfg.id ? '下载中...' : '下载到键盘'}
                            </button>
                          )}
                          <button
                            style={{padding:'5px 10px',fontSize:12,borderRadius:6,border:'none',cursor:'pointer',background:isCurrent ? '#e0e7ff' : '#f1f5f9',color:isCurrent ? '#4f46e5' : '#475569'}}
                            onClick={() => handleLoadConfig(cfg)}
                          >加载</button>
                          <button
                            style={{padding:'5px 8px',fontSize:12,borderRadius:6,border:'none',cursor:'pointer',background:'#fee2e2',color:'#ef4444'}}
                            onClick={() => handleDeleteConfig(mk, cfg.id)}
                          >删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 保存配置对话框 */}
      {saveDialogOpen && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,width:380,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:16}}>保存配置</div>
            <div style={{marginBottom:8,fontSize:13,color:'#64748b'}}>
              保存到型号: {currentModelKey ? getModelName(currentModelKey) : '未知'}
            </div>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmSave()}
              placeholder="输入配置名称"
              style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,boxSizing:'border-box',outline:'none'}}
              autoFocus
            />
            <div style={{display:'flex',justifyContent:'flex-end',gap:12,marginTop:20}}>
              <button style={{padding:'8px 20px',borderRadius:8,border:'none',cursor:'pointer',fontSize:14,background:'#f1f5f9',color:'#475569'}}
                onClick={() => setSaveDialogOpen(false)}>取消</button>
              <button style={{padding:'8px 20px',borderRadius:8,border:'none',cursor:'pointer',fontSize:14,background:'#6366f1',color:'#fff'}}
                onClick={handleConfirmSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑器弹窗 */}
      {editing !== null && (
        <KeyEditor
          config={keyConfigs[editing] || defaultCfg()}
          proto={proto || 'new'}
          multiKeyOnly={!!deviceInfo?.multiKeyOnly}
          onSave={(cfg) => handleKeySave(editing, cfg)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 下载进度弹窗 */}
      {progress && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:150}}>
          <div style={{background:'#fff',borderRadius:16,padding:'36px 48px',minWidth:380,textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}}>
            <div style={{fontSize:22,fontWeight:700,color:'#1e293b',marginBottom:8}}>{progress.label}</div>
            <div style={{fontSize:15,color:'#6366f1',fontWeight:600,marginBottom:16}}>
              {progress.current} / {progress.total}
            </div>
            <div style={{height:10,background:'#e2e8f0',borderRadius:5,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${progress.total > 0 ? (progress.current / progress.total * 100) : 0}%`,background:'linear-gradient(90deg,#6366f1,#818cf8)',borderRadius:5,transition:'width 0.3s'}} />
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div style={s.toast}>{toast}</div>}

      {/* 居中醒目成功提示 */}
      {successMsg && (
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,pointerEvents:'none'}}>
          <div style={{
            background:'#10b981',color:'#fff',padding:'26px 44px',borderRadius:16,
            fontSize:24,fontWeight:700,letterSpacing:1,
            boxShadow:'0 10px 40px rgba(16,185,129,0.5)',
            display:'flex',alignItems:'center',gap:14,
          }}>
            <span style={{width:42,height:42,borderRadius:'50%',background:'rgba(255,255,255,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>✓</span>
            {successMsg}
          </div>
        </div>
      )}
    </div>
  );
}
