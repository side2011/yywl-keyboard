// ============================================================
// protocols/bt-protocol.js — 蓝牙无线款 QT KEY_PRO 协议独立模块 (node-hid)
// 传输层: 输出报告 reportId=0x03 + 64B body; 输入报告 node-hid data[0]=reportId(0x03), payload=data.slice(1)
// 命令:
//   0xFB 0xFB 0xFB          读按键数/型号 → payload[1]=键数 [2]=旋钮数 [3]=版本(>=10为V10) [4]=子型号
//   0xFA KeyNum KNNum Layer 读按键配置 (V10: KeyNum=25 KN=0; 旧: KeyNum=15 KN=3) 连续返回N个报告
//   0xFA 0xB0 Layer(0..2)   读灯光 → payload[1]=模式 payload[2..49]=48B RGB (响应不回显0xB0)
//   0xFD + 64B记录(V10)/50B(旧)  写按键
//   0xFE 0xB0 Layer Mode +48B     写灯光
//   0xFD 0xFE 0xFF          写Flash确认
// ============================================================
'use strict';

const REPORT_ID = 0x03;

// ---- 蓝牙无线款 VID/PID ----
const BT_VIDS = [0x1189, 0x514C];
const BT_CLASSIC_PIDS = [0x8842, 0x8840, 0x8830, 0x8831, 0x8832, 0x8833];

// ---- 修饰键 token (V10) ----
const BT_MOD_TOKENS = [
  { label: '左Ctrl', token: 0xF1, bit: 0x01 },
  { label: '左Shift', token: 0xF2, bit: 0x02 },
  { label: '左Alt', token: 0xF3, bit: 0x04 },
  { label: '左Win', token: 0xF4, bit: 0x08 },
  { label: '右Ctrl', token: 0xF5, bit: 0x10 },
  { label: '右Shift', token: 0xF6, bit: 0x20 },
  { label: '右Alt', token: 0xF7, bit: 0x40 },
  { label: '右Win', token: 0xF8, bit: 0x80 },
];
const TOKEN_TO_BIT = {};
BT_MOD_TOKENS.forEach(m => { TOKEN_TO_BIT[m.token] = m.bit; });
const BIT_TO_TOKEN = {};
BT_MOD_TOKENS.forEach(m => { BIT_TO_TOKEN[m.bit] = m.token; });

// ---- 多媒体键 (Consumer Usage 16bit) ----
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

// ---- 鼠标动作 (mod 为 V10 token; 旧协议序列化时转位掩码) ----
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

// ---- 灯光 ----
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

// ---- 键码标签 (独立副本) ----
const BT_KEYCODE_LABELS = {
  0x00: '无',
  0x04: 'A', 0x05: 'B', 0x06: 'C', 0x07: 'D', 0x08: 'E',
  0x09: 'F', 0x0A: 'G', 0x0B: 'H', 0x0C: 'I', 0x0D: 'J',
  0x0E: 'K', 0x0F: 'L', 0x10: 'M', 0x11: 'N', 0x12: 'O',
  0x13: 'P', 0x14: 'Q', 0x15: 'R', 0x16: 'S', 0x17: 'T',
  0x18: 'U', 0x19: 'V', 0x1A: 'W', 0x1B: 'X', 0x1C: 'Y',
  0x1D: 'Z',
  0x1E: '1', 0x1F: '2', 0x20: '3', 0x21: '4', 0x22: '5',
  0x23: '6', 0x24: '7', 0x25: '8', 0x26: '9', 0x27: '0',
  0x28: 'Enter', 0x29: 'Esc', 0x2A: 'Backspace', 0x2B: 'Tab',
  0x2C: 'Space', 0x2D: '-', 0x2E: '=', 0x2F: '[', 0x30: ']',
  0x31: '\\', 0x32: '#', 0x33: ';', 0x34: "'", 0x35: '`',
  0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'CapsLock',
  0x3A: 'F1', 0x3B: 'F2', 0x3C: 'F3', 0x3D: 'F4',
  0x3E: 'F5', 0x3F: 'F6', 0x40: 'F7', 0x41: 'F8',
  0x42: 'F9', 0x43: 'F10', 0x44: 'F11', 0x45: 'F12',
  0x46: 'PrtSc', 0x47: 'ScrLk', 0x48: 'Pause',
  0x49: 'Insert', 0x4A: 'Home', 0x4B: 'PgUp', 0x4C: 'Delete',
  0x4D: 'End', 0x4E: 'PgDn',
  0x4F: '→', 0x50: '←', 0x51: '↓', 0x52: '↑',
  0x53: 'NumLock', 0x54: 'Num/', 0x55: 'Num*', 0x56: 'Num-',
  0x57: 'Num+', 0x58: 'NumEnter', 0x59: 'Num1', 0x5A: 'Num2',
  0x5B: 'Num3', 0x5C: 'Num4', 0x5D: 'Num5', 0x5E: 'Num6',
  0x5F: 'Num7', 0x60: 'Num8', 0x61: 'Num9', 0x62: 'Num0',
  0x63: 'Num.', 0x65: 'Menu',
  0x68: 'F13', 0x69: 'F14', 0x6A: 'F15', 0x6B: 'F16',
  0x6C: 'F17', 0x6D: 'F18', 0x6E: 'F19', 0x6F: 'F20',
  0x70: 'F21', 0x71: 'F22', 0x72: 'F23', 0x73: 'F24',
};

// ---- 通用配置 (渲染层标准) 与线格式互转 ----
// 线模式: 1=基础/组合 2=多媒体 3=鼠标 5=延时 (V10 与旧协议相同)
// 通用模式: 0未设置 1键盘 2鼠标 3多媒体 4多键 5宏 6延时(蓝牙)
const WIRE_MODE = { KEY: 1, MEDIA: 2, MOUSE: 3, DELAY: 5 };
const CANON_MODE = { KEY: 1, MOUSE: 2, MEDIA: 3, DELAY: 6 };

function wireToCanon(cfg) {
  // wire cfg: { mode, modifierMask, keyCode, mediaCode(16bit), mouse:{mod,btn,wheel,behavior}, delay, groups }
  const c = { mode: 0, modifier: 0, keyCode: 0, mediaCode: null, multiKeys: [], macroSteps: [],
    mouseButton: 0, mouseMod: null, mouseWheel: null, mouseBehavior: null, delay: null };
  if (!cfg) return c;
  c.modifier = cfg.modifierMask || 0;
  c.keyCode = cfg.keyCode || 0;
  c.delay = cfg.delay || null;
  switch (cfg.mode) {
    case WIRE_MODE.KEY: c.mode = CANON_MODE.KEY; break;
    case WIRE_MODE.MEDIA: {
      c.mode = CANON_MODE.MEDIA;
      const code = cfg.mediaCode || 0;
      c.mediaCode = [0x04, code & 0xFF, (code >> 8) & 0xFF, 0x00];
      break;
    }
    case WIRE_MODE.MOUSE: {
      c.mode = CANON_MODE.MOUSE;
      if (cfg.mouse) {
        c.mouseMod = cfg.mouse.mod ?? 0;
        c.mouseButton = cfg.mouse.btn ?? 0;
        c.mouseWheel = cfg.mouse.wheel ?? 0;
        c.mouseBehavior = cfg.mouse.behavior ?? 0x01;
      }
      break;
    }
    case WIRE_MODE.DELAY: c.mode = CANON_MODE.DELAY; break;
    default: c.mode = 0;
  }
  return c;
}

function canonToWire(cfg) {
  // 通用 → wire 配置
  const w = { mode: 0, modifierMask: 0, keyCode: 0, mediaCode: 0, mouse: null, delay: 0 };
  if (!cfg || cfg.mode === 0) return w;
  w.modifierMask = cfg.modifier || 0;
  w.keyCode = cfg.keyCode || 0;
  switch (cfg.mode) {
    case CANON_MODE.KEY: w.mode = WIRE_MODE.KEY; break;
    case CANON_MODE.MEDIA: {
      w.mode = WIRE_MODE.MEDIA;
      const mc = cfg.mediaCode || [0x04, 0, 0, 0];
      w.mediaCode = (mc[1] || 0) | ((mc[2] || 0) << 8);
      break;
    }
    case CANON_MODE.MOUSE: {
      w.mode = WIRE_MODE.MOUSE;
      w.mouse = {
        mod: cfg.mouseMod ?? 0,
        btn: cfg.mouseButton ?? 0,
        wheel: cfg.mouseWheel ?? 0,
        behavior: cfg.mouseBehavior ?? 0x01,
      };
      break;
    }
    case CANON_MODE.DELAY: w.mode = WIRE_MODE.DELAY; w.delay = cfg.delay || 0; break;
    default: w.mode = 0;
  }
  return w;
}

// ---- 序列化: wire config → 写报告 body (64B, 不含reportId) ----
function buildGroupsFromWire(cfg, isV10) {
  const groups = [];
  if (cfg.mode === 1) {
    if (isV10) {
      const mask = cfg.modifierMask || 0;
      BT_MOD_TOKENS.forEach(m => {
        if (mask & m.bit) groups.push({ delay: 0, value: m.token });
      });
      if (cfg.keyCode) groups.push({ delay: 0, value: cfg.keyCode });
      if (groups.length === 0) groups.push({ delay: 0, value: 0x00 });
    } else {
      if (cfg.modifierMask) groups.push({ mask: cfg.modifierMask, value: cfg.keyCode || 0x00 });
      else groups.push({ mask: 0x00, value: cfg.keyCode || 0x00 });
    }
  } else if (cfg.mode === 2) {
    const code = cfg.mediaCode || 0;
    if (isV10) {
      groups.push({ delay: 0, value: code & 0xFF });
      groups.push({ delay: 0, value: (code >> 8) & 0xFF });
    } else {
      // 旧协议多媒体: 低字节在掩码槽, 高字节在值槽 — 由 serialize 特殊处理, 这里占位
      groups.push({ mask: code & 0xFF, value: (code >> 8) & 0xFF });
    }
  } else if (cfg.mode === 3) {
    if (isV10) {
      groups.push({ delay: 0, value: cfg.mouse?.mod || 0x00 });
      groups.push({ delay: 0, value: cfg.mouse?.btn || 0x00 });
      groups.push({ delay: 0, value: 0x00 }); // X
      groups.push({ delay: 0, value: 0x00 }); // Y
      groups.push({ delay: 0, value: cfg.mouse?.wheel || 0x00 });
    } else {
      groups.push({ mask: 0x00, value: cfg.mouse?.mod || 0x00 });
      groups.push({ mask: 0x00, value: cfg.mouse?.btn || 0x00 });
      groups.push({ mask: 0x00, value: cfg.mouse?.wheel || 0x00 });
    }
  } else if (cfg.mode === 5) {
    if (isV10) {
      groups.push({ delay: cfg.delay || 0, value: 0x00 });
    }
  }
  return groups;
}

function serializeBtKeyRecord(wireCfg, keyNo, layer /* 1..3 */, isV10) {
  if (!wireCfg || wireCfg.mode === 0) return null;
  if (isV10) {
    const rec = new Uint8Array(64);
    rec[0] = 0xFD;
    rec[1] = keyNo & 0xFF;
    rec[2] = layer & 0xFF;
    rec[3] = wireCfg.mode & 0xFF;
    rec[4] = (wireCfg.mode === 3 ? (wireCfg.mouse?.behavior || 0x01) : 0x01) & 0xFF;
    const groups = buildGroupsFromWire(wireCfg, true);
    rec[5] = Math.min(groups.length, 18);
    for (let j = 0; j < 18 && j < groups.length; j++) {
      const g = groups[j];
      rec[6 + j * 3] = ((g.delay || 0) >> 8) & 0xFF;
      rec[7 + j * 3] = (g.delay || 0) & 0xFF;
      rec[8 + j * 3] = g.value & 0xFF;
    }
    return rec;
  }
  const rec = new Uint8Array(50);
  rec[0] = 0xFD;
  rec[1] = keyNo & 0xFF;
  rec[2] = layer & 0xFF;
  rec[3] = wireCfg.mode & 0xFF;
  if (wireCfg.mode === 5) {
    rec[4] = (wireCfg.delay || 0) & 0xFF;
    rec[5] = ((wireCfg.delay || 0) >> 8) & 0xFF;
  } else if (wireCfg.mode === 2) {
    // 旧协议多媒体: [9]=2, [10]=低字节, [11]=高字节 (QT SetMulKey 旧分支)
    const code = wireCfg.mediaCode || 0;
    rec[9] = 2;
    rec[10] = code & 0xFF;
    rec[11] = (code >> 8) & 0xFF;
  } else if (wireCfg.mode === 3) {
    // 旧协议鼠标: [9]=1, [10]=修饰位掩码, [11]=按键, [14]=滚轮 (QT SetMousePage 旧分支)
    const modToken = wireCfg.mouse?.mod || 0;
    const oldMod = modToken === 0xF1 ? 0x01 : modToken === 0xF2 ? 0x02 : modToken === 0xF3 ? 0x04 : 0x00;
    rec[9] = 1;
    rec[10] = oldMod & 0xFF;
    rec[11] = wireCfg.mouse?.btn || 0;
    rec[14] = wireCfg.mouse?.wheel || 0;
  } else {
    const groups = buildGroupsFromWire(wireCfg, false);
    rec[9] = Math.min(groups.length, 18);
    for (let j = 0; j < 18 && j < groups.length; j++) {
      const g = groups[j];
      rec[10 + j * 2] = g.mask & 0xFF;
      rec[11 + j * 2] = g.value & 0xFF;
    }
  }
  return rec;
}

function serializeBtClearRecord(keyNo, layer, isV10) {
  if (isV10) {
    const rec = new Uint8Array(64);
    rec[0] = 0xFD;
    rec[1] = keyNo & 0xFF;
    rec[2] = layer & 0xFF;
    rec[3] = 0x01;
    rec[4] = 0x01;
    rec[5] = 1;
    rec[8] = 0x00;
    return rec;
  }
  const rec = new Uint8Array(50);
  rec[0] = 0xFD;
  rec[1] = keyNo & 0xFF;
  rec[2] = layer & 0xFF;
  rec[3] = 0x01;
  rec[9] = 1;
  rec[10] = 0x00;
  rec[11] = 0x00;
  return rec;
}

// ---- 反序列化: 读回报告 payload (不含reportId) → wire config ----
// payload: [0]=0xFA回显 [1]=键号 [2]=层 [3]=模式 ...
function parseBtKeyRecord(payload, isV10) {
  const cfg = { mode: 0, modifierMask: 0, keyCode: 0, mediaCode: 0, mouse: null, delay: 0, groups: [] };
  if (!payload || payload.length < 4) return cfg;
  cfg.mode = payload[3];
  if (isV10) {
    cfg.behavior = payload[4];
    const groupCount = payload[5] || 0;
    cfg.groups = [];
    for (let j = 0; j < groupCount && j < 18; j++) {
      cfg.groups.push({
        delay: (payload[6 + j * 3] << 8) | payload[7 + j * 3],
        value: payload[8 + j * 3],
      });
    }
  } else {
    cfg.groups = [];
    if (cfg.mode === 5) {
      cfg.delay = payload[4] | (payload[5] << 8);
    } else if (cfg.mode === 2) {
      // 旧协议多媒体: 低字节在[10](掩码槽), 高字节在[11](值槽) — QT Dsp case2 比较 [10]
      const lo = payload[10] || 0;
      const hi = payload[11] || 0;
      cfg.mediaCode = lo | (hi << 8);
    } else if (cfg.mode === 3) {
      // 旧协议鼠标: [10]=修饰位掩码(0x01/0x02/0x04), [11]=按键, [14]=滚轮 (QT Dsp case3)
      const oldMod = payload[10] || 0;
      cfg.mouse = {
        mod: oldMod === 0x01 ? 0xF1 : oldMod === 0x02 ? 0xF2 : oldMod === 0x04 ? 0xF3 : oldMod,
        btn: payload[11] || 0,
        wheel: payload[14] || 0,
        behavior: 0x01,
      };
    } else {
      const count = payload[9] || 0;
      for (let j = 0; j < count && j < 18; j++) {
        cfg.groups.push({ mask: payload[10 + j * 2], value: payload[11 + j * 2] });
      }
    }
  }
  // 归一化
  if (cfg.mode === 1) {
    let mask = 0;
    let keyCode = 0;
    if (isV10) {
      for (const g of cfg.groups) {
        if (TOKEN_TO_BIT[g.value] !== undefined) mask |= TOKEN_TO_BIT[g.value];
        else if (g.value) keyCode = g.value;
      }
    } else {
      for (const g of cfg.groups) {
        mask |= g.mask || 0;
        if (g.value && !g.mask) keyCode = g.value;
        if (!mask && g.value) keyCode = g.value;
      }
    }
    cfg.modifierMask = mask;
    cfg.keyCode = keyCode;
  } else if (cfg.mode === 2 && isV10) {
    const lo = cfg.groups[0]?.value || 0;
    const hi = cfg.groups[1]?.value || 0;
    cfg.mediaCode = lo | (hi << 8);
  } else if (cfg.mode === 3 && isV10) {
    cfg.mouse = {
      mod: cfg.groups[0]?.value || 0,
      btn: cfg.groups[1]?.value || 0,
      x: cfg.groups[2]?.value || 0,
      y: cfg.groups[3]?.value || 0,
      wheel: cfg.groups[4]?.value || 0,
      behavior: cfg.behavior || 0x01,
    };
  }
  return cfg;
}

// ============================================================
// 处理器
// ============================================================
class BtProtocolHandler {
  constructor(device, debugLog = () => {}) {
    this.device = device;
    this.log = debugLog;
    this.waiters = [];
    this._isV10 = true;
    this._info = null;
    this._onData = (data) => this._handleData(data);
    device.on('data', this._onData);
  }

  destroy() {
    if (this._onData) {
      try { this.device.removeListener('data', this._onData); } catch {}
      this._onData = null;
    }
    for (const w of this.waiters) { clearTimeout(w.timer); w.reject(new Error('Handler stopped')); }
    this.waiters = [];
  }

  _handleData(data) {
    if (data[0] !== REPORT_ID) return;
    const payload = Buffer.from(data).slice(1);
    if (payload.length < 2) return;
    for (let i = 0; i < this.waiters.length; i++) {
      const w = this.waiters[i];
      if (w.match(payload)) {
        clearTimeout(w.timer);
        this.waiters.splice(i, 1)[0].resolve(payload);
        return;
      }
    }
  }

  _waitFor(matchFn, timeout = 1000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex(w => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error('Response timeout'));
      }, timeout);
      this.waiters.push({ match: matchFn, resolve, reject, timer });
    });
  }

  async _send(body) {
    const data = Buffer.alloc(65);
    data[0] = REPORT_ID;
    Buffer.from(body).copy(data, 1);
    this.device.write(Array.from(data));
  }

  _mk(cmd, params = []) {
    const b = new Uint8Array(64);
    b[0] = cmd;
    params.forEach((v, i) => { b[1 + i] = v & 0xFF; });
    return b;
  }

  get isV10() { return this._isV10; }
  get info() { return this._info; }
  set info(v) { this._info = v; if (v) this._isV10 = !!(v.isV10 ?? (v.version >= 10)); }

  // 读设备信息: 0xFB 0xFB 0xFB
  // node-hid data: [0]=reportId(0x03) [1]=0xFB回显 [2]=键数 [3]=旋钮数 [4]=版本 [5]=子型号
  async readDeviceInfo() {
    await this._send(this._mk(0xFB, [0xFB, 0xFB]));
    try {
      const payload = await this._waitFor(d => d.length >= 5, 2000);
      this.log(`[BT] 0xFB 响应 raw: ${Buffer.from(payload.slice(0, 12)).toString('hex')}`);
      const info = {
        keyCount: payload[1] || 0,
        knobCount: payload[2] || 0,
        version: payload[3] || 0,
        subModel: payload[4] || 0,
      };
      info.isV10 = info.version >= 10;
      this._isV10 = info.isV10;
      this._info = info;
      return info;
    } catch (e) {
      throw new Error('读取设备信息超时，请确认连接的是蓝牙无线款键盘');
    }
  }

  _actionIdxToKeyNo(actionIdx) {
    const keyCount = this._info?.keyCount || 0;
    if (actionIdx < keyCount) return actionIdx + 1;
    return 16 + (actionIdx - keyCount);
  }

  // 读整层按键配置: 发 0xFA KeyNum KNNum Layer(1..3), 连续收 N 个报告
  async readLayer(layer /* 0..2 */, totalSlots) {
    if (!this._info) {
      try { await this.readDeviceInfo(); } catch { /* ignore */ }
    }
    const l = layer + 1;
    const keyNum = this._isV10 ? 25 : 15;
    const knNum = this._isV10 ? 0 : 3;
    await this._send(this._mk(0xFA, [keyNum, knNum, l]));
    const configs = new Array(totalSlots).fill(null);
    const totalReports = this._isV10 ? keyNum : keyNum + knNum * 3;
    for (let i = 0; i < totalReports; i++) {
      try {
        const payload = await this._waitFor(d => d.length >= 4 && d[0] === 0xFA, 300);
        const keyNo = payload[1];
        const wireCfg = parseBtKeyRecord(payload, this._isV10);
        const keyCount = this._info?.keyCount || 0;
        const knobCount = this._info?.knobCount || 0;
        let idx = -1;
        if (keyNo >= 1 && keyNo <= keyCount) {
          idx = keyNo - 1;
        } else if (keyNo >= 16 && keyNo < 16 + knobCount * 3) {
          idx = keyCount + (keyNo - 16);
        }
        if (idx >= 0 && idx < totalSlots) {
          configs[idx] = wireToCanon(wireCfg);
        }
      } catch (e) {
        break; // 无更多报告
      }
    }
    // 补齐未设置的槽位
    for (let i = 0; i < totalSlots; i++) {
      if (!configs[i]) configs[i] = wireToCanon(null);
    }
    return configs;
  }

  // 写单个按键 (通用配置 → 线格式)
  async writeKey(layer, actionIdx, canonCfg) {
    const wireCfg = canonToWire(canonCfg);
    const keyNo = this._actionIdxToKeyNo(actionIdx);
    const rec = serializeBtKeyRecord(wireCfg, keyNo, layer + 1, this._isV10);
    if (rec) await this._send(rec);
    await new Promise(r => setTimeout(r, 15));
  }

  // 清除单个按键
  async clearKey(layer, actionIdx) {
    const keyNo = this._actionIdxToKeyNo(actionIdx);
    const rec = serializeBtClearRecord(keyNo, layer + 1, this._isV10);
    await this._send(rec);
    await new Promise(r => setTimeout(r, 15));
  }

  // 读灯光: 0xFA 0xB0 Layer(0..2)
  // 响应 payload: [0]=0xFA回显 [1]=模式 [2..49]=48B RGB (不回显0xB0, 模式在payload[1])
  async readLedLayer(layer) {
    await this._send(this._mk(0xFA, [0xB0, layer]));
    try {
      const payload = await this._waitFor(d => d.length >= 50 && d[0] === 0xFA, 1000);
      this.log(`[BT] 读灯光响应 layer=${layer} raw: ${Buffer.from(payload.slice(0, 12)).toString('hex')}`);
      const mode = payload[1] || 0;
      const colors = [];
      for (let i = 0; i < 16; i++) {
        colors.push({ r: payload[2 + i * 3] || 0, g: payload[3 + i * 3] || 0, b: payload[4 + i * 3] || 0 });
      }
      return { mode, sleepAllow: 1, colors };
    } catch (e) {
      this.log('[BT] 读灯光无响应, 返回默认:', e.message);
      return { mode: 0, sleepAllow: 1, colors: Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0 })) };
    }
  }

  // 写灯光: 0xFE 0xB0 Layer(0..2) Mode + 48B RGB
  async writeLedLayer(layer, mode, colors, sleepAllow = 1) {
    const b = new Uint8Array(64);
    b[0] = 0xFE;
    b[1] = 0xB0;
    b[2] = layer & 0xFF;
    b[3] = mode & 0xFF;
    for (let i = 0; i < 16; i++) {
      const c = colors[i] || { r: 0, g: 0, b: 0 };
      b[4 + i * 3] = c.r & 0xFF;
      b[5 + i * 3] = c.g & 0xFF;
      b[6 + i * 3] = c.b & 0xFF;
    }
    await this._send(b);
    await new Promise(r => setTimeout(r, 100));
  }

  // 写Flash确认
  async writeFlash() {
    await this._send(this._mk(0xFD, [0xFE, 0xFF]));
    await new Promise(r => setTimeout(r, 200));
  }

  // 整层保存 (通用配置数组)
  async saveAll(keyConfigs, layer = 0, onProgress) {
    const total = keyConfigs.length;
    for (let i = 0; i < total; i++) {
      if (onProgress) onProgress(i, total);
      const cfg = keyConfigs[i];
      if (cfg && cfg.mode !== 0) {
        await this.writeKey(layer, i, cfg);
      } else {
        await this.clearKey(layer, i);
      }
    }
    await this.writeFlash();
  }
}

module.exports = {
  BtProtocolHandler,
  BT_VIDS,
  BT_CLASSIC_PIDS,
  BT_MOD_TOKENS,
  BT_MEDIA_KEYS,
  BT_MOUSE_ACTIONS,
  BT_LED_MODES,
  BT_LED_COLORS,
  BT_KEYCODE_LABELS,
  wireToCanon,
  canonToWire,
};
