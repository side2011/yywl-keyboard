// ============================================================
// bt-protocol.js — 蓝牙无线款小键盘协议 (逆向自 QT9/KEY_PRO 桌面软件)
// 传输层: 输出报告 reportId=0x03 + 64B body; 输入报告 64B (不含reportId)
// 命令:
//   0xFB 0xFB 0xFB          读按键数/型号 → data[1]=键数 data[2]=旋钮数 data[3]=版本(>=10为V10) data[4]=子型号
//   0xFA KeyNum KNNum Layer 读按键配置 (V10: KeyNum=25 KN=0; 旧: KeyNum=15 KN=3) 连续返回N个报告
//   0xFA 0xB0 Layer(0..2)   读灯光 → data[1]=模式 data[2..49]=48B RGB
//   0xFD + 64B记录(V10)/50B(旧)  写按键
//   0xFE 0xB0 Layer Mode +48B     写灯光
//   0xFD 0xFE 0xFF          写Flash确认
// ============================================================

export const BT_VIDS = [0x1189, 0x514C];
// 蓝牙无线款 PID 集合 (QT KEY_PRO 轮询顺序)
export const BT_PIDS = [0x8842, 0x8840, 0x8830, 0x8831, 0x8832, 0x8833, 0x8850, 0x8851];
// 纯蓝牙款 PID (0x8850/0x8851 与 AC632N 新协议重叠, 不在此列)
export const BT_CLASSIC_PIDS = [0x8842, 0x8840, 0x8830, 0x8831, 0x8832, 0x8833];

export function isBtWirelessDevice(device) {
  if (!device) return false;
  const vid = device.vendorId;
  const pid = device.productId;
  // 经典蓝牙款: 任意 VID 下 0x8842/0x8840/0x8830-0x8833
  if (BT_CLASSIC_PIDS.includes(pid)) return BT_VIDS.includes(vid);
  // 0x8850/0x8851 属于 AC632N 新协议, 不算蓝牙款
  return false;
}

const REPORT_ID = 0x03;

// ---- 命令常量 ----
const CMD_READ_INFO = 0xFB;      // 读按键数/型号
const CMD_READ_KEYS = 0xFA;      // 读按键配置
const CMD_READ_LED = 0xFA;       // 读灯光 (buf[2]=0xB0)
const CMD_WRITE_KEY = 0xFD;      // 写按键 (记录头)
const CMD_WRITE_LED = 0xFE;      // 写灯光 (buf[2]=0xB0)
const CMD_FLASH = 0xFD;          // 写Flash: 0xFD 0xFE 0xFF

// ---- 修饰键 token (V10 新协议) ----
export const BT_MOD_TOKENS = [
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

// ---- HID 键码标签 (蓝牙模块独立副本, 不依赖 hid-constants) ----
export const BT_KEYCODE_LABELS = {
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

// ---- 多媒体键 (QT m_order index 41..81, Consumer Usage 16bit 小端) ----
export const BT_MEDIA_KEYS = [
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

// ---- 鼠标动作 (QT SetMousePage V10) ----
export const BT_MOUSE_ACTIONS = [
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

// ---- 灯光模式 (QT UI 仅 0..5) ----
export const BT_LED_MODES = ['灯光关闭', '模式1', '模式2', '模式3', '模式4', '模式5'];
// QT 颜色表: 红橙黄绿青蓝紫 (合成字节 高4位)
export const BT_LED_COLORS = [
  { label: '红', rgb: [0xFF, 0x00, 0x00] },
  { label: '橙', rgb: [0xFF, 0x80, 0x00] },
  { label: '黄', rgb: [0xFF, 0xFF, 0x00] },
  { label: '绿', rgb: [0x00, 0xFF, 0x00] },
  { label: '青', rgb: [0x00, 0xFF, 0xFF] },
  { label: '蓝', rgb: [0x00, 0x00, 0xFF] },
  { label: '紫', rgb: [0x80, 0x00, 0xFF] },
];

// ---- 蓝牙按键配置对象结构 ----
// { mode: 1=基础 2=多媒体 3=鼠标 5=延时 0=未设置,
//   behavior: 0x01/0x04 (鼠标),
//   modifierMask: 旧协议位掩码 / V10由tokens推导,
//   keyCode: 基础键HID值,
//   mediaCode: 16bit consumer usage,
//   mouse: {mod, btn, wheel, behavior},
//   delay: 单键延时ms (模式5或每组延时),
//   groups: [{delay, value}] V10组 / 旧协议 [{mask, value}],
//   multiKeys: [{delay, token|hid|mediaLo, mediaHi?...}] }

// 从 HID keyCode + modifierMask 构建 V10 组列表
function buildGroupsFromConfig(cfg, isV10) {
  const groups = [];
  if (cfg.mode === 1) {
    // 基础/组合键: 修饰token组 + 键值组
    if (isV10) {
      const mask = cfg.modifierMask || 0;
      BT_MOD_TOKENS.forEach(m => {
        if (mask & m.bit) groups.push({ delay: 0, value: m.token });
      });
      if (cfg.keyCode) groups.push({ delay: 0, value: cfg.keyCode });
      // 无修饰无键 → 清空
      if (groups.length === 0) groups.push({ delay: 0, value: 0x00 });
    } else {
      if (cfg.modifierMask) groups.push({ mask: cfg.modifierMask, value: cfg.keyCode || 0x00 });
      else groups.push({ mask: 0x00, value: cfg.keyCode || 0x00 });
    }
  } else if (cfg.mode === 2) {
    // 多媒体: 16bit 小端 → 低字节槽 + 高字节槽
    const code = cfg.mediaCode || 0;
    const lo = code & 0xFF;
    const hi = (code >> 8) & 0xFF;
    if (isV10) {
      groups.push({ delay: 0, value: lo });
      groups.push({ delay: 0, value: hi });
    } else {
      groups.push({ mask: 0x00, value: lo });
      groups.push({ mask: 0x00, value: hi });
    }
  } else if (cfg.mode === 3) {
    // 鼠标
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
    // 延时
    if (isV10) {
      groups.push({ delay: cfg.delay || 0, value: 0x00 });
    } else {
      // 旧协议延时走 [4][5] 字段, 无组
    }
  }
  return groups;
}

// ============================================================
// 序列化: UI config → 写报告 body (64B, 不含reportId)
// ============================================================
export function serializeBtKeyRecord(cfg, keyNo, layer /* 1..3 */, isV10) {
  if (!cfg || cfg.mode === 0) return null; // 未设置 → 不发(清空键需特殊处理, 见clear)
  if (isV10) {
    const rec = new Uint8Array(64);
    rec[0] = 0xFD;
    rec[1] = keyNo & 0xFF;
    rec[2] = layer & 0xFF;
    rec[3] = cfg.mode & 0xFF;
    rec[4] = (cfg.mode === 3 ? (cfg.mouse?.behavior || 0x01) : (cfg.mode === 5 ? 0x01 : 0x01)) & 0xFF;
    const groups = buildGroupsFromConfig(cfg, true);
    rec[5] = Math.min(groups.length, 18);
    for (let j = 0; j < 18 && j < groups.length; j++) {
      const g = groups[j];
      rec[6 + j * 3] = ((g.delay || 0) >> 8) & 0xFF;
      rec[7 + j * 3] = (g.delay || 0) & 0xFF;
      rec[8 + j * 3] = g.value & 0xFF;
    }
    return rec;
  } else {
    const rec = new Uint8Array(50);
    rec[0] = 0xFD;
    rec[1] = keyNo & 0xFF;
    rec[2] = layer & 0xFF;
    rec[3] = cfg.mode & 0xFF;
    if (cfg.mode === 5) {
      rec[4] = (cfg.delay || 0) & 0xFF;
      rec[5] = ((cfg.delay || 0) >> 8) & 0xFF;
    } else if (cfg.mode === 2) {
      // 旧协议多媒体: [9]=2, [10]=低字节, [11]=高字节 (QT SetMulKey 旧分支:
      // [10+Cur*2]=m_order[index], [10+Cur*2+1]=m_order[index+1], 个数+=2)
      const code = cfg.mediaCode || 0;
      rec[9] = 2;
      rec[10] = code & 0xFF;
      rec[11] = (code >> 8) & 0xFF;
    } else if (cfg.mode === 3) {
      // 旧协议鼠标: [9]=1, [10]=修饰位掩码, [11]=按键, [14]=滚轮 (QT SetMousePage 旧分支)
      // UI 用 V10 token (0xF1-0xF3) 表示修饰, 旧协议需转位掩码 0x01/0x02/0x04
      const modToken = cfg.mouse?.mod || 0;
      const oldMod = modToken === 0xF1 ? 0x01 : modToken === 0xF2 ? 0x02 : modToken === 0xF3 ? 0x04 : 0x00;
      rec[9] = 1;
      rec[10] = oldMod & 0xFF;
      rec[11] = cfg.mouse?.btn || 0;
      rec[14] = cfg.mouse?.wheel || 0;
    } else {
      const groups = buildGroupsFromConfig(cfg, false);
      rec[9] = Math.min(groups.length, 18);
      for (let j = 0; j < 18 && j < groups.length; j++) {
        const g = groups[j];
        rec[10 + j * 2] = g.mask & 0xFF;
        rec[11 + j * 2] = g.value & 0xFF;
      }
    }
    return rec;
  }
}

// 清空键记录: 模式1 无修饰 键值0
export function serializeBtClearRecord(keyNo, layer, isV10) {
  if (isV10) {
    const rec = new Uint8Array(64);
    rec[0] = 0xFD;
    rec[1] = keyNo & 0xFF;
    rec[2] = layer & 0xFF;
    rec[3] = 0x01;
    rec[4] = 0x01;
    rec[5] = 1;
    rec[8] = 0x00; // 键值 0
    return rec;
  } else {
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
}

// ============================================================
// 反序列化: 读回报告 → UI config
// ============================================================
export function parseBtKeyRecord(data, isV10) {
  // data: WebHID inputreport 数据 (不含reportId), data[0]=命令回显0xFA
  // data[1]=键号 data[2]=层 data[3]=模式 ...
  const cfg = { mode: 0, modifierMask: 0, keyCode: 0, mediaCode: 0, mouse: null, delay: 0, groups: [] };
  if (!data || data.length < 4) return cfg;
  cfg.mode = data[3];
  if (isV10) {
    cfg.behavior = data[4];
    cfg.groups = [];
    // 原厂 Qt 源码 (Traversal_Key_Txt) 是**遍历 18 个组槽位**、不看"组数量"字节的。
    // 之前我们信 data[5] 的组数量，某些固件把它填成 1，导致「Ctrl+A」只读出 Ctrl、
    // 键码读成 0（客户看到的"左Ctrl+无"就是这个）。改成固定扫 18 个槽位。
    for (let j = 0; j < 18; j += 1) {
      const base = 8 + j * 3;
      if (base >= data.length) break;
      const value = data[base] || 0;
      if (!value) continue;
      cfg.groups.push({
        delay: ((data[base - 2] || 0) << 8) | (data[base - 1] || 0),
        value,
      });
    }
  } else {
    cfg.groups = [];
    if (cfg.mode === 5) {
      cfg.delay = data[4] | (data[5] << 8);
    } else if (cfg.mode === 2) {
      // 旧协议多媒体: 低字节在[10](掩码槽), 高字节在[11](值槽) — QT Dsp case2 直接比较 [10]
      const lo = data[10] || 0;
      const hi = data[11] || 0;
      cfg.mediaCode = lo | (hi << 8);
    } else if (cfg.mode === 3) {
      // 旧协议鼠标: [10]=修饰位掩码(0x01/0x02/0x04), [11]=按键, [14]=滚轮 (QT Dsp case3)
      // 位掩码转回 UI 使用的 V10 token (0xF1-0xF3) 以便选中态匹配
      const oldMod = data[10] || 0;
      cfg.mouse = {
        mod: oldMod === 0x01 ? 0xF1 : oldMod === 0x02 ? 0xF2 : oldMod === 0x04 ? 0xF3 : oldMod,
        btn: data[11] || 0,
        wheel: data[14] || 0,
        behavior: 0x01,
      };
    } else {
      // 同样按原厂逻辑扫 18 个槽位（每槽 2 字节：修饰位掩码 + 键码），不依赖数量字节
      for (let j = 0; j < 18; j += 1) {
        const base = 10 + j * 2;
        if (base >= data.length) break;
        const mask = data[base] || 0;
        const value = data[base + 1] || 0;
        if (!mask && !value) continue;
        cfg.groups.push({ mask, value });
      }
    }
  }
  // 归一化为 UI 结构
  if (cfg.mode === 1) {
    let mask = 0;
    let keyCode = 0;
    if (isV10) {
      for (const g of cfg.groups) {
        if (TOKEN_TO_BIT[g.value] !== undefined) mask |= TOKEN_TO_BIT[g.value];
        else if (g.value) keyCode = g.value;
      }
    } else {
      // 旧协议: 同一个组里 [mask]=修饰位掩码、[value]=键码，两者互不排斥。
      // 原厂 Qt 解码也是分别按位取 mask、按值取键码 —— 之前这里写成
      // "value && !mask 才算键码"，导致「Ctrl+A」只读出 Ctrl、键码被丢掉。
      for (const g of cfg.groups) {
        mask |= g.mask || 0;
        if (g.value) keyCode = g.value;
      }
    }
    cfg.modifierMask = mask;
    cfg.keyCode = keyCode;
  } else if (cfg.mode === 2 && isV10) {
    // V10 多媒体: 低字节/高字节各占一个 3 字节组
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
// 蓝牙协议处理器 (镜像 NewProtocolHandler 接口, 供配置页复用)
// ============================================================
export class BtProtocolHandler {
  constructor(device) {
    this.device = device;
    this._listener = null;
    this._waiters = [];
    this._isV10 = true;
    this._info = null;
  }

  start() {
    this._listener = (event) => {
      const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
      if (data.length < 2) return;
      // 分发给等待者
      for (let i = 0; i < this._waiters.length; i++) {
        const w = this._waiters[i];
        if (w.match(data)) {
          clearTimeout(w.timer);
          this._waiters.splice(i, 1);
          w.resolve(data);
          return;
        }
      }
    };
    this.device.addEventListener('inputreport', this._listener);
  }

  stop() {
    if (this._listener) {
      this.device.removeEventListener('inputreport', this._listener);
      this._listener = null;
    }
    for (const w of this._waiters) w.reject(new Error('Handler stopped'));
    this._waiters = [];
  }

  _waitFor(matchFn, timeout = 1000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._waiters.findIndex(w => w.timer === timer);
        if (idx >= 0) this._waiters.splice(idx, 1);
        reject(new Error('Response timeout'));
      }, timeout);
      this._waiters.push({ match: matchFn, resolve, reject, timer });
    });
  }

  async _send(body) {
    const data = new Uint8Array(64);
    data.set(body.subarray ? body : body, 0);
    await this.device.sendReport(0x03, data);
  }

  _mk(cmd, params = []) {
    const b = new Uint8Array(64);
    b[0] = cmd;
    params.forEach((v, i) => { b[1 + i] = v & 0xFF; });
    return b;
  }

  // 读设备信息: 0xFB 0xFB 0xFB
  // 响应 (WebHID data 不含 reportId): data[0]=命令回显 data[1]=键数 data[2]=旋钮数 data[3]=版本 data[4]=子型号
  async readDeviceInfo() {
    await this._send(this._mk(0xFB, [0xFB, 0xFB]));
    try {
      const data = await this._waitFor(d => d.length >= 5, 2000);
      const hex = Array.from(data.slice(0, Math.min(data.length, 16))).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log('[BtProto] 0xFB 响应 raw:', hex);
      const info = {
        keyCount: data[1] || 0,
        knobCount: data[2] || 0,
        version: data[3] || 0,
        subModel: data[4] || 0,
      };
      info.isV10 = info.version >= 10;
      this._isV10 = info.isV10;
      this._info = info;
      console.log('[BtProto] 设备信息:', JSON.stringify(info));
      return info;
    } catch (e) {
      throw new Error('读取设备信息超时，请确认连接的是蓝牙无线款键盘');
    }
  }

  // UI 动作序号 → 协议键序号 (旋钮位从 16 开始: 旋钮1左/中/右=16,17,18 ...)
  _actionIdxToKeyNo(actionIdx) {
    const keyCount = this._info?.keyCount || 0;
    if (actionIdx < keyCount) return actionIdx + 1;
    return 16 + (actionIdx - keyCount);
  }

  get isV10() { return this._isV10; }

  // 读整层按键配置: 发 0xFA KeyNum KNNum Layer(1..3), 连续收 KeyNum 个报告
  async readLayer(layer /* 0..2 UI层 */, totalActions) {
    // 自愈: 若 handler 未持有设备信息 (如切换协议时未传入), 先补读
    if (!this._info) {
      try { await this.readDeviceInfo(); } catch { /* ignore */ }
    }
    const l = layer + 1; // 记录层号 1..3
    const keyNum = this._isV10 ? 25 : 15;
    const knNum = this._isV10 ? 0 : 3;
    await this._send(this._mk(0xFA, [keyNum, knNum, l]));
    const configs = [];
    // 连续收集报告: V10 每键1报告; 旧协议 键报告 + 旋钮报告
    const totalReports = this._isV10 ? keyNum : keyNum + knNum * 3;
    for (let i = 0; i < totalReports; i++) {
      try {
        const data = await this._waitFor(d => d.length >= 4 && d[0] === 0xFA, 300);
        // data[1]=键序号 data[2]=层 data[3..]=记录
        const keyNo = data[1];
        const recLayer = data[2];
        const hex = Array.from(data.slice(0, Math.min(data.length, 14))).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`[BtProto] 读键报告 #${i}: ${hex} → keyNo=${keyNo} layer=${recLayer}`);
        const cfg = parseBtKeyRecord(data, this._isV10);
        // 键序号 → UI 槽位:
        //   1..keyCount → 按键槽位 0..keyCount-1
        //   16..16+旋钮数*3-1 → 旋钮槽位 (旋钮1左/中/右=16/17/18 ...)
        //   其余键号 (如 7..15、19..25) 是 15键款的历史残留存储, 本机不用 → 丢弃
        const keyCount = this._info?.keyCount || 0;
        const knobCount = this._info?.knobCount || 0;
        let idx = -1;
        if (keyNo >= 1 && keyNo <= keyCount) {
          idx = keyNo - 1;
        } else if (keyNo >= 16 && keyNo < 16 + knobCount * 3) {
          idx = keyCount + (keyNo - 16);
        }
        if (idx >= 0 && idx < 40) {
          configs[idx] = cfg;
        }
      } catch (e) {
        break; // 无更多报告
      }
    }
    return configs;
  }

  // 写单个按键
  async writeKey(layer, actionIdx, cfg) {
    // 自愈: 没有设备信息就拿不到正确键号（会把键写错槽位，表现为"这层没保存"），先补读一次
    if (!this._info) {
      try { await this.readDeviceInfo(); } catch { /* 拿不到就用兜底逻辑 */ }
    }
    const keyNo = this._actionIdxToKeyNo(actionIdx);
    const rec = serializeBtKeyRecord(cfg, keyNo, layer + 1, this._isV10);
    if (rec) await this._send(rec);
  }

  // 清除单个按键
  async clearKey(layer, actionIdx) {
    if (!this._info) {
      try { await this.readDeviceInfo(); } catch { /* 忽略 */ }
    }
    const keyNo = this._actionIdxToKeyNo(actionIdx);
    const rec = serializeBtClearRecord(keyNo, layer + 1, this._isV10);
    await this._send(rec);
  }

  // 读灯光: 0xFA 0xB0 Layer(0..2)
  // 响应 (WebHID data 不含 reportId): [0]=0xFA回显 [1]=模式 [2..49]=48B RGB
  // (QT Read_RgbLed_DataDsp: Rec_buf[0]=reportId, 模式=Rec_buf[2], 颜色=Rec_buf[3..50] — 响应不回显0xB0)
  async readLedLayer(layer) {
    await this._send(this._mk(0xFA, [0xB0, layer]));
    try {
      const data = await this._waitFor(d => d.length >= 50 && d[0] === 0xFA, 1000);
      const hex = Array.from(data.slice(0, Math.min(data.length, 16))).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`[BtProto] 读灯光响应 layer=${layer} raw:`, hex);
      const mode = data[1] || 0;
      const colors = [];
      for (let i = 0; i < 16; i++) {
        colors.push({ r: data[2 + i * 3] || 0, g: data[3 + i * 3] || 0, b: data[4 + i * 3] || 0 });
      }
      console.log(`[BtProto] 灯光 layer=${layer} mode=${mode}`);
      return { mode, sleepAllow: 1, colors };
    } catch (e) {
      // 设备无响应时返回默认
      console.warn('[BtProto] 读灯光无响应, 返回默认:', e.message);
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
  async _writeFlash() {
    await this._send(this._mk(0xFD, [0xFE, 0xFF]));
    await new Promise(r => setTimeout(r, 200));
  }

  // 完整保存: 写所有修改的键 + 灯光 + Flash确认
  // 简化实现: 全量写所有键 (每层), 保证一致性
  async saveAll(layer, keyConfigs, currentLayer) {
    // 写当前层所有键
    for (let i = 0; i < keyConfigs.length; i++) {
      const cfg = keyConfigs[i];
      if (cfg && cfg.mode !== 0) {
        await this.writeKey(layer, i, cfg);
        await new Promise(r => setTimeout(r, 20));
      } else if (cfg && cfg.mode === 0) {
        await this.clearKey(layer, i);
        await new Promise(r => setTimeout(r, 20));
      }
    }
    // 写Flash确认 (V10在最后一次性; 旧协议每层)
    await this._writeFlash();
  }

  async detectMicrophone() { return { hasMicrophone: false, method: 'bt:none' }; }
}
