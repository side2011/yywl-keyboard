// ============================================================
// new-protocol.js — AC104/AC632N 新 VM 重构协议通信层
// 协议版本 1.0 — reportId=0x03, 63 字节 body, XOR 校验
// ============================================================

import { KEY_MODE } from './hid-constants';

// ============================================================
// 新协议设备定义 — 与 hid-constants.js 的旧协议设备完全独立
// ============================================================

// 新协议 VID/PID → 型号映射
export const NEW_PID_TO_MODEL = {
  0x8850: 'AC632N',
  0x8851: 'AC632N',
};

// 新协议 WebHID 设备过滤器
export const NEW_DEVICE_FILTERS = [
  { vendorId: 0x514C, productId: 0x8850 },
  { vendorId: 0x514C, productId: 0x8851 },
];

// 新协议型号名称
export const NEW_MODEL_NAMES = {
  'AC632N': '版本2.0',
};

// 新协议 RGB 灯光模式 (10 modes) — 与上位机软件一致
export const RGB_MODES_J = [
  '关闭灯光',     // 0
  '灯光常量',     // 1
  '流光',         // 2
  '按键触发',     // 3
  '彩虹流光',     // 4
  '波浪',         // 5
  '彩虹跑马',     // 6
  '呼吸',         // 7
  '涟漪',         // 8
  '交叉涟漪',     // 9
];

// 新协议获取灯光模式列表
export function getNewProtoRgbModes() {
  return RGB_MODES_J;
}

const REPORT_ID = 0x03;
const BODY_SIZE = 63;
const CMD = {
  WRITE_KEY: 0x01,
  WRITE_MACRO: 0x02,
  READ_KEY: 0x03,
  READ_LAYER: 0x04,
  CLEAR_KEY: 0x05,
  ACK: 0x06,
  NAK: 0x07,
  READ_MACRO: 0x08,
  WRITE_LED_LAYER: 0x09,
  READ_LED_LAYER: 0x0A,
  READ_DEVICE_INFO: 0x0B,
  READ_EXT_DEVICE_INFO: 0x0C,
  READ_MIC_INFO: 0x0D,       // 麦克风扩展信息 (用于检测是否为麦克风设备)
  WRITE_MIC_INFO: 0x0E,      // 麦克风扩展设置
  SAVE_LAYER: 0x12,
  SET_ACTIVE_LAYER: 0x14,
};

const KEY_TYPE = { SIMPLE: 0x00, MACRO: 0x01, MEDIA: 0x02, MOUSE: 0x03, COMBO: 0x04, NONE: 0xFF };

// 新协议鼠标动作表 (比旧协议更丰富)
export const NEW_MOUSE_ACTIONS = [
  { label: '左键',     code: 0x00 },
  { label: '右键',     code: 0x01 },
  { label: '中键',     code: 0x02 },
  { label: '滚轮上',   code: 0x03 },
  { label: '滚轮下',   code: 0x04 },
  { label: 'Ctrl+滚轮上', code: 0x05 },
  { label: 'Ctrl+滚轮下', code: 0x06 },
  { label: 'Shift+滚轮上', code: 0x07 },
  { label: 'Shift+滚轮下', code: 0x08 },
  { label: 'Alt+滚轮上',  code: 0x09 },
  { label: 'Alt+滚轮下',  code: 0x0A },
  { label: '左滑',     code: 0x0B },
  { label: '右滑',     code: 0x0C },
  { label: '上滑',     code: 0x0D },
  { label: '下滑',     code: 0x0E },
  { label: '点赞',     code: 0x0F },
];

// 新协议多媒体按键表 — 使用标准 USB HID Consumer Usage ID
// 与老协议 MEDIA_KEYS (hid-constants.js) 分开，因为新固件按标准 HID 解析
// 老协议音量+/-等码值来自 C# 项目，不能改动；新协议使用标准值
export const NEW_MEDIA_KEYS = [
  { label: '播放/暂停', code: [0x04, 0xCD, 0x00, 0x00] },
  { label: '停止播放',  code: [0x04, 0xB7, 0x00, 0x00] },
  { label: '上一首',    code: [0x04, 0xB6, 0x00, 0x00] },
  { label: '下一首',    code: [0x04, 0xB5, 0x00, 0x00] },
  { label: '我的电脑',  code: [0x04, 0x94, 0x01, 0x00] },
  { label: '亮度+',     code: [0x04, 0x6F, 0x00, 0x00] },
  { label: '亮度-',     code: [0x04, 0x70, 0x00, 0x00] },
  { label: '打开媒体',  code: [0x04, 0x83, 0x01, 0x00] },
  { label: '系统静音',  code: [0x04, 0xE2, 0x00, 0x00] },
  { label: '音量+',     code: [0x04, 0xE9, 0x00, 0x00] },  // 标准: 0x00E9 = Volume Increment
  { label: '音量-',     code: [0x04, 0xEA, 0x00, 0x00] },  // 标准: 0x00EA = Volume Decrement
  { label: '打开计算器', code: [0x04, 0x92, 0x01, 0x00] },
  { label: '打开浏览器', code: [0x04, 0x23, 0x02, 0x00] },
  { label: '打开邮件',  code: [0x04, 0x8A, 0x01, 0x00] },
  { label: '网页刷新',  code: [0x04, 0x53, 0x01, 0x00] },
  { label: '网页前进',  code: [0x04, 0x52, 0x01, 0x00] },
  { label: '网页后退',  code: [0x04, 0x55, 0x01, 0x00] },
  { label: '低音+',     code: [0x04, 0x54, 0x01, 0x00] },  // 标准: 0x0154 = Bass Boost
  { label: '低音-',     code: [0x04, 0x25, 0x02, 0x00] },  // 标准: 0x0225 = Bass Increment
  { label: '高音+',     code: [0x04, 0x27, 0x02, 0x00] },  // 标准: 0x0227 = Treble Increment
  { label: '高音-',     code: [0x04, 0x24, 0x02, 0x00] },  // 标准: 0x0224 = Treble Decrement
];

// 宏录制步骤动作类型
export const MACRO_STEP = { PRESS: 0x01, DOWN: 0x02, UP: 0x03, DELAY: 0x04 };
export const MACRO_STEP_LABELS = { 0x01: '按下', 0x02: '长按', 0x03: '松开', 0x04: '延时' };

// ---- 宏数据序列化/反序列化 ----
// UI 录制的 step.action 使用 MACRO_STEP 枚举:
//   PRESS=1 (快速按下), DOWN=2 (按下保持), UP=3 (释放), DELAY=4 (延时)
// 协议 Section 5.2 的 MacroStep.act 只有两个值:
//   0x00 = 按下 (press), 0x01 = 释放 (release)
// DELAY 步骤不单独发送, 其 delay 值吸收为下一步的 delay_before
// PRESS (快速点击) 展开为 press + release 两步, 中间插入 50ms 延迟

const PROTO_ACT = { PRESS: 0x00, RELEASE: 0x01 };
const PRESS_HOLD_MS = 50; // PRESS 展开时 press→release 之间的保持时间

export function serializeMacro(steps) {
  // 第一遍: 将 UI 步骤转换为协议步骤 (展开 PRESS, 吸收 DELAY)
  const protoSteps = [];
  let pendingDelay = 0;

  for (const step of steps) {
    if (step.action === MACRO_STEP.DELAY) {
      pendingDelay += (step.delay || 0);
      continue;
    }

    const delayBefore = pendingDelay + (step.delay || 0);
    pendingDelay = 0;

    if (step.action === MACRO_STEP.PRESS) {
      // 快速点击 → press + release
      protoSteps.push({ act: PROTO_ACT.PRESS, keyCode: step.keyCode, delay: delayBefore });
      protoSteps.push({ act: PROTO_ACT.RELEASE, keyCode: step.keyCode, delay: PRESS_HOLD_MS });
    } else if (step.action === MACRO_STEP.DOWN) {
      protoSteps.push({ act: PROTO_ACT.PRESS, keyCode: step.keyCode, delay: delayBefore });
    } else if (step.action === MACRO_STEP.UP) {
      protoSteps.push({ act: PROTO_ACT.RELEASE, keyCode: step.keyCode, delay: delayBefore });
    }
  }
  // 末尾 DELAY: 用 press+release (keyCode=0) 承载延时, 防止丢失
  if (pendingDelay > 0) {
    protoSteps.push({ act: PROTO_ACT.PRESS, keyCode: 0, delay: pendingDelay });
    protoSteps.push({ act: PROTO_ACT.RELEASE, keyCode: 0, delay: 0 });
  }

  // 序列化: [stepCount(1B)] + N × [act(1B), keyCode(1B), delayMs(2B LE)]
  const data = new Uint8Array(1 + protoSteps.length * 4);
  data[0] = protoSteps.length & 0xFF;
  protoSteps.forEach((ps, i) => {
    const off = 1 + i * 4;
    data[off] = ps.act;
    data[off + 1] = ps.keyCode;
    data[off + 2] = ps.delay & 0xFF;
    data[off + 3] = (ps.delay >> 8) & 0xFF;
  });
  return data;
}

// 从协议格式反序列化为 UI 格式
// 协议 act: 0x00=press, 0x01=release
// UI action: PRESS=1 (快速按下), DOWN=2 (按下保持), UP=3 (释放), DELAY=4 (延时)
// 序列化时 PRESS 被展开为 press+release (delay≤PRESS_HOLD_MS), 反序列化时需还原
// DELAY 步骤在序列化时被吸收为 delay_before, 反序列化时需重建为独立 DELAY 步骤
export function deserializeMacro(data) {
  if (!data || data.length < 1) return [];
  const count = data[0];

  // 第一遍: 协议步骤 → 临时 UI 步骤, 从 delay_before 提取 DELAY
  const raw = [];
  for (let i = 0; i < count && (1 + (i + 1) * 4) <= data.length; i++) {
    const off = 1 + i * 4;
    const act = data[off];
    const keyCode = data[off + 1];
    const delay = data[off + 2] | (data[off + 3] << 8);

    // 检测末尾 keyCode=0 的 press+release → 这是序列化时承载尾部延时的占位
    const isTrailingDelay = (keyCode === 0 && act === PROTO_ACT.PRESS &&
      i + 1 < count &&
      data[off + 4] === PROTO_ACT.RELEASE && data[off + 5] === 0);

    if (isTrailingDelay) {
      // 尾部延时: 添加 DELAY 步骤, 跳过占位的 press+release
      if (delay > 0) {
        raw.push({ action: MACRO_STEP.DELAY, keyCode: 0, delay });
      }
      i++; // 跳过对应的 release
      continue;
    }

    // delay_before > 30ms → 创建 DELAY 步骤 (与录制时 >30ms 阈值一致)
    if (delay > 30) {
      raw.push({ action: MACRO_STEP.DELAY, keyCode: 0, delay });
      raw.push({
        action: act === PROTO_ACT.RELEASE ? MACRO_STEP.UP : MACRO_STEP.DOWN,
        keyCode,
        delay: 0,
      });
    } else {
      // 小延时 (≤30ms): 保留在按键步骤上, 不创建 DELAY
      raw.push({
        action: act === PROTO_ACT.RELEASE ? MACRO_STEP.UP : MACRO_STEP.DOWN,
        keyCode,
        delay,
      });
    }
  }

  // 第二遍: 吸收 DOWN→DELAY→UP (同键) 中的 DELAY — 这是按键保持时间, 不是间隔延时
  // 例如 PRESS 展开的 press(50ms)release, 50ms 是保持时间不应变成 DELAY
  const absorbed = [];
  let j = 0;
  while (j < raw.length) {
    if (
      j + 2 < raw.length &&
      raw[j].action === MACRO_STEP.DOWN &&
      raw[j + 1].action === MACRO_STEP.DELAY &&
      raw[j + 2].action === MACRO_STEP.UP &&
      raw[j].keyCode === raw[j + 2].keyCode
    ) {
      // 吸收 DELAY 到 UP 的 delay 中
      absorbed.push(raw[j]);
      absorbed.push({ ...raw[j + 2], delay: (raw[j + 2].delay || 0) + (raw[j + 1].delay || 0) });
      j += 3;
    } else {
      absorbed.push(raw[j]);
      j++;
    }
  }

  // 第三遍: 合并 press+release 配对 → PRESS (快速点击)
  // 判定条件: DOWN 后面紧跟同 keyCode 的 UP, 且 UP 的 delay ≤ 100ms
  const steps = [];
  let i = 0;
  while (i < absorbed.length) {
    if (
      absorbed[i].action === MACRO_STEP.DOWN &&
      i + 1 < absorbed.length &&
      absorbed[i + 1].action === MACRO_STEP.UP &&
      absorbed[i].keyCode === absorbed[i + 1].keyCode &&
      absorbed[i + 1].delay <= 100
    ) {
      // 合并为 PRESS, 保留 DOWN 的 delay
      steps.push({ action: MACRO_STEP.PRESS, keyCode: absorbed[i].keyCode, delay: absorbed[i].delay });
      i += 2;
    } else {
      steps.push(absorbed[i]);
      i++;
    }
  }
  return steps;
}

// ---- 工具函数 ----
function xorChecksum(bytes, len) {
  let v = 0;
  for (let i = 0; i < len; i++) v ^= bytes[i];
  return v;
}

export function isNewProtocolDevice(device) {
  return device && device.vendorId === 0x514C && (device.productId === 0x8850 || device.productId === 0x8851);
}

// ---- UI config → Action bytes ----
export function configToActionBytes(config) {
  if (!config || config.mode === 0 || (config.mode === KEY_MODE.KEYBOARD && !config.keyCode && !config.modifier)) {
    return null; // None → 用 CLEAR_KEY (注意: 仅修饰键如单Ctrl不算None)
  }

  switch (config.mode) {
    case KEY_MODE.KEYBOARD: {
      // 有修饰键 → Combo; 无修饰键 → Simple
      if (config.modifier) {
        const modCodes = [];
        if (config.modifier & 0x01) modCodes.push(0xE0);
        if (config.modifier & 0x02) modCodes.push(0xE1);
        if (config.modifier & 0x04) modCodes.push(0xE2);
        if (config.modifier & 0x08) modCodes.push(0xE3);
        if (config.modifier & 0x10) modCodes.push(0xE4);
        if (config.modifier & 0x20) modCodes.push(0xE5);
        if (config.modifier & 0x40) modCodes.push(0xE6);
        if (config.modifier & 0x80) modCodes.push(0xE7);
        const allKeys = [...modCodes, config.keyCode].filter(k => k);
        const payload = new Uint8Array(2 + allKeys.length);
        payload[0] = config.modifier;
        payload[1] = allKeys.length;
        allKeys.forEach((k, i) => { payload[2 + i] = k; });
        return makeActionHeader(KEY_TYPE.COMBO, payload);
      }
      // Simple
      const payload = new Uint8Array([config.keyCode || 0]);
      return makeActionHeader(KEY_TYPE.SIMPLE, payload);
    }
    case KEY_MODE.MOUSE: {
      const payload = new Uint8Array([config.mouseButton || 0]);
      return makeActionHeader(KEY_TYPE.MOUSE, payload);
    }
    case KEY_MODE.MEDIA: {
      if (!config.mediaCode) return null;
      // mediaCode = [reportId, usageLo, usageHi, 0x00]
      // 协议文档 §5.1: payload = [usage_lo][usage_hi]，16 位小端 Usage
      const payload = new Uint8Array([config.mediaCode[1], config.mediaCode[2]]);
      return makeActionHeader(KEY_TYPE.MEDIA, payload);
    }
    case KEY_MODE.MULTI: {
      const modKeys = [];
      const regKeys = [];
      (config.multiKeys || []).forEach(k => {
        if (k >= 0xE0 && k <= 0xE7) modKeys.push(k);
        else if (k) regKeys.push(k);
      });
      let modMask = 0;
      modKeys.forEach(k => { modMask |= (1 << (k - 0xE0)); });
      // 兼容旧配置: 也检查 config.modifier
      if (config.modifier) modMask |= config.modifier;
      const allKeys = [...modKeys, ...regKeys];
      const payload = new Uint8Array(2 + allKeys.length);
      payload[0] = modMask;
      payload[1] = allKeys.length;
      allKeys.forEach((k, i) => { payload[2 + i] = k; });
      return makeActionHeader(KEY_TYPE.COMBO, payload);
    }
    case 5: { // KEY_MODE.MACRO
      // 宏通过 WRITE_MACRO 写入, 不走 WRITE_KEY
      // 这里返回带正确 dataLen 的 ActionHeader 供参考
      if (config.macroSteps && config.macroSteps.length > 0) {
        const stepData = serializeMacro(config.macroSteps);
        return makeActionHeader(KEY_TYPE.MACRO, stepData);
      }
      return makeActionHeader(KEY_TYPE.MACRO, new Uint8Array(0));
    }
    default:
      return null;
  }
}

function makeActionHeader(keyType, payload) {
  const data = new Uint8Array(9 + payload.length);
  data[0] = keyType;
  data[1] = 0; // flags
  data[2] = 0; // reserved
  data[3] = 0; data[4] = 0; // param1 LE
  data[5] = 0; data[6] = 0; // param2 LE
  data[7] = payload.length & 0xFF;
  data[8] = (payload.length >> 8) & 0xFF;
  data.set(payload, 9);
  return data;
}

// ---- Action bytes → UI config ----
export function actionBytesToConfig(actionBytes) {
  if (!actionBytes || actionBytes.length < 9) return { mode: 0 };
  const keyType = actionBytes[0];
  const dataLen = actionBytes[7] | (actionBytes[8] << 8);
  const payload = actionBytes.slice(9, 9 + dataLen);

  switch (keyType) {
    case KEY_TYPE.SIMPLE:
      return { mode: KEY_MODE.KEYBOARD, modifier: 0, keyCode: payload[0] || 0 };
    case KEY_TYPE.MEDIA: {
      // 协议文档 §5.1: payload = [usage_lo][usage_hi]，16 位小端 Usage
      // mediaCode 格式 = [reportId=0x04, usageLo, usageHi, 0x00]
      const mediaCode = [0x04, payload[0] || 0, payload[1] || 0, 0x00];
      return { mode: KEY_MODE.MEDIA, mediaCode };
    }
    case KEY_TYPE.MOUSE:
      return { mode: KEY_MODE.MOUSE, mouseButton: payload[0] || 0, mouseX: 0, mouseY: 0, mouseScroll: 0 };
    case KEY_TYPE.COMBO: {
      const modMask = payload[0] || 0;
      const count = payload[1] || 0;
      const keys = [];
      for (let i = 0; i < count && (2 + i) < payload.length; i++) {
        keys.push(payload[2 + i]);
      }
      // 分离修饰键和普通键
      const modKeys = keys.filter(k => k >= 0xE0 && k <= 0xE7);
      const regKeys = keys.filter(k => k < 0xE0 || k > 0xE7);
      // 修饰键 + 单个普通键 → KEYBOARD 模式 (与 configToActionBytes 写入对称)
      // 例如 Ctrl+C: modKeys=[0xE0], regKeys=[0x06] → KEYBOARD modifier=0x01 keyCode=0x06
      if (modKeys.length > 0 && regKeys.length === 1) {
        return {
          mode: KEY_MODE.KEYBOARD,
          modifier: modMask,
          keyCode: regKeys[0],
        };
      }
      // 多个普通键 → MULTI 模式 (保留修饰键信息)
      if (regKeys.length > 1) {
        return { mode: KEY_MODE.MULTI, modifier: modMask, multiKeys: regKeys };
      }
      // 仅修饰键或无键 → KEYBOARD 模式
      return {
        mode: KEY_MODE.KEYBOARD,
        modifier: modMask,
        keyCode: regKeys[0] || 0,
      };
    }
    case KEY_TYPE.MACRO: {
      const steps = deserializeMacro(payload);
      return { mode: 5, macroSteps: steps }; // mode 5 = MACRO
    }
    default:
      return { mode: 0 };
  }
}

// ---- 新协议处理器类 ----
export class NewProtocolHandler {
  constructor(device) {
    this.device = device;
    this._listener = null;
    this._waiters = [];
  }

  start() {
    this._listener = (event) => {
      if (event.reportId !== REPORT_ID) return;
      const body = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
      if (body.length < 8) return;
      const hex = Array.from(body.slice(0, Math.min(body.length, 63))).map(b => b.toString(16).padStart(2, '0')).join(' ');
      // 详细抓包日志
      const cmdNames = { 0x01: 'WRITE_KEY', 0x02: 'WRITE_MACRO', 0x03: 'READ_KEY', 0x04: 'READ_LAYER', 0x05: 'CLEAR_KEY', 0x06: 'ACK', 0x07: 'NAK', 0x08: 'READ_MACRO', 0x09: 'WRITE_LED', 0x0A: 'READ_LED', 0x0B: 'DEV_INFO', 0x0C: 'EXT_DEV_INFO', 0x0D: 'MIC_INFO', 0x0E: 'WRITE_MIC', 0x12: 'SAVE_LAYER', 0x14: 'SET_ACTIVE' };
      console.log(`[NewProto] RX [${body.length}B] cmd=0x${body[0].toString(16).padStart(2,'0')}(${cmdNames[body[0]] || '?'}) layer=${body[1]} keyIdx=0x${body[2].toString(16).padStart(2,'0')} dataLen=${body[3]} waiters=${this._waiters.length}`);
      console.log(`[NewProto] RX hex: ${hex}`);
      // 校验
      const expected = xorChecksum(body, 62);
      if (expected !== body[62]) {
        console.warn('[NewProto] 校验失败: expected=0x' + expected.toString(16).padStart(2, '0') +
          ' got=0x' + body[62].toString(16).padStart(2, '0') + ' body=[' + hex + ']');
        return;
      }
      console.log('[NewProto] RX [' + body.length + 'B]: ' + hex);
      // 分发给等待者
      let matched = false;
      for (let wi = 0; wi < this._waiters.length; wi++) {
        const w = this._waiters[wi];
        if (w.match(body)) {
          console.log('[NewProto]   → matched waiter #' + wi + ' (total ' + this._waiters.length + ' waiters)');
          clearTimeout(w.timer);
          this._waiters.splice(wi, 1);
          w.resolve(body);
          matched = true;
          return;
        }
      }
      if (!matched) {
        console.warn('[NewProto]  无匹配的waiter, 响应被丢弃: ' + hex);
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

  // ---- 底层发送/接收 ----
  async _sendPacket(cmd, layer = 0, keyIdx = 0xFF, payload = []) {
    const body = new Uint8Array(BODY_SIZE);
    body[0] = cmd;
    body[1] = layer;
    body[2] = keyIdx;
    body[3] = payload.length;
    if (payload.length > 0) body.set(payload, 4);
    body[62] = xorChecksum(body, 62);
    const cmdNames = { 0x01: 'WRITE_KEY', 0x02: 'WRITE_MACRO', 0x03: 'READ_KEY', 0x04: 'READ_LAYER', 0x05: 'CLEAR_KEY', 0x06: 'ACK', 0x07: 'NAK', 0x08: 'READ_MACRO', 0x09: 'WRITE_LED', 0x0A: 'READ_LED', 0x0B: 'DEV_INFO', 0x0C: 'EXT_DEV_INFO', 0x0D: 'MIC_INFO', 0x0E: 'WRITE_MIC', 0x12: 'SAVE_LAYER', 0x14: 'SET_ACTIVE' };
    const txHex = Array.from(body).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`[NewProto] TX cmd=0x${cmd.toString(16).padStart(2,'0')}(${cmdNames[cmd] || '?'}) layer=${layer} keyIdx=0x${keyIdx.toString(16).padStart(2,'0')} payloadLen=${payload.length}`);
    console.log(`[NewProto] TX hex: ${txHex}`);
    await this.device.sendReport(REPORT_ID, body);
  }

  // 宏分包发送 (HidMacroPacket 格式, 协议 Section 3.2)
  // 与通用包不同: pkt_idx@b3, total_pkts@b4, data_len@b5, data@b6
  async _sendMacroPacket(cmd, layer, keyIdx, pktIdx, totalPkts, data) {
    const body = new Uint8Array(BODY_SIZE);
    body[0] = cmd;
    body[1] = layer;
    body[2] = keyIdx;
    body[3] = pktIdx;
    body[4] = totalPkts;
    body[5] = data.length;
    if (data.length > 0) body.set(data, 6);
    body[62] = xorChecksum(body, 62);
    const cmdName = cmd === 0x02 ? 'WRITE_MACRO' : cmd === 0x08 ? 'READ_MACRO' : '?';
    const hex = Array.from(body).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`[NewProto] TX_MACRO cmd=0x${cmd.toString(16)}(${cmdName}) layer=${layer} keyIdx=0x${keyIdx.toString(16)} pkt=${pktIdx}/${totalPkts} dataLen=${data.length}`);
    console.log(`[NewProto] TX_MACRO hex: ${hex}`);
    await this.device.sendReport(REPORT_ID, body);
  }

  _waitFor(matchFn, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._waiters.findIndex(w => w.timer === timer);
        if (idx >= 0) this._waiters.splice(idx, 1);
        console.warn(`[NewProto] waiter 超时 (${timeout}ms), 剩余waiters: ${this._waiters.length}`);
        reject(new Error('Response timeout'));
      }, timeout);
      this._waiters.push({ match: matchFn, resolve, reject, timer });
      console.log(`[NewProto] waiter 创建 (timeout=${timeout}ms, 总waiters: ${this._waiters.length})`);
    });
  }

  // 清除过期响应: 等待一小段时间, 丢弃所有到达的响应
  // 用于在两次写操作之间清理设备可能发送的多余/过期响应
  async _drain(ms = 150) {
    const drained = [];
    // ⚠ 清空挂起的 waiter 时必须逐个 reject:
    //   旧实现只 clearTimeout 就把 waiter 从队列里 splice 掉, 既不 resolve 也不 reject,
    //   于是正在 await 的调用方(读键/读宏/等 ACK)会永久挂起, 整个流程卡死且无任何日志。
    //   这里统一抛可识别的错误, 让上层按"响应被丢弃、可重试"处理。
    const origWaiters = this._waiters.splice(0);
    for (const w of origWaiters) {
      clearTimeout(w.timer);
      drained.push('pending_waiter');
      try {
        w.reject(new Error('Response discarded by drain'));
      } catch {
        // 调用方已离开(或 reject 已被处理), 忽略
      }
    }
    await new Promise(resolve => {
      const drainHandler = (event) => {
        if (event.reportId !== REPORT_ID) return;
        const body = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        if (body.length >= 8) {
          const hex = Array.from(body.slice(0, Math.min(body.length, 20))).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`[NewProto] drain 丢弃: [0x${body[0].toString(16).padStart(2,'0')}] ${hex}`);
          drained.push(`0x${body[0].toString(16).padStart(2,'0')}`);
        }
      };
      this.device.addEventListener('inputreport', drainHandler);
      setTimeout(() => {
        this.device.removeEventListener('inputreport', drainHandler);
        resolve();
      }, ms);
    });
    if (drained.length > 0) {
      console.log(`[NewProto] drain 清除 ${drained.length} 项: ${drained.join(', ')}`);
    }
  }

  async _waitForAck(cmd, layer, keyIdx, timeout = 5000) {
    const tryAck = async (attempt) => {
      const body = await this._waitFor(b => {
        if (b[0] === CMD.ACK || b[0] === CMD.NAK) {
          // 格式A: [0x06, status, layer, keyIdx]  (ACK特有, 4字节)
          if (b.length >= 4 && b[2] === layer && b[3] === keyIdx) return true;
          // 格式B: [0x06, layer, keyIdx, ...]     (通用包格式)
          if (b.length >= 3 && b[1] === layer && b[2] === keyIdx) return true;
          // 格式C: 只匹配layer (keyIdx 可能不在固定位置)
          if (b.length >= 3 && b[2] === layer) return true;
          if (b.length >= 2 && b[1] === layer) return true;
          // 不再使用格式D (接受任何ACK/NAK) — 会导致过期响应误匹配!
          console.warn(`[NewProto] ACK 不匹配, 忽略: cmd=0x${b[0].toString(16)} b[1]=0x${b[1].toString(16).padStart(2,'0')} b[2]=0x${b[2].toString(16).padStart(2,'0')} 期望 layer=${layer} keyIdx=0x${keyIdx.toString(16).padStart(2,'0')}`);
          return false;
        }
        return false;
      }, timeout);
      if (body[0] === CMD.NAK) {
        let status = body[1];
        if (body.length >= 4 && body[2] !== layer && body[3] < 0x07) {
          status = body[3];
        }
        const statusNames = {
          0x01: '校验错误', 0x02: '参数不合法', 0x03: 'Flash读写失败',
          0x04: '容量不足', 0x05: '设备忙', 0x06: '层数据校验失败',
        };
        throw new Error(statusNames[status] || `NAK status 0x${status.toString(16)}`);
      }
      return body;
    };

    try {
      return await tryAck(1);
    } catch (e) {
      if (e.message.includes('timeout')) {
        // 超时后清除可能的过期响应, 然后重试一次
        console.warn(`[NewProto] ACK 超时 (cmd=0x${cmd.toString(16)} layer=${layer} keyIdx=0x${keyIdx.toString(16)}), 执行 drain 后重试...`);
        await this._drain(200);
        return await tryAck(2);
      }
      throw e;
    }
  }

  async _waitForResponse(cmd, layer, keyIdx, timeout = 2000) {
    return this._waitFor(b => b[0] === cmd && b[1] === layer && b[2] === keyIdx, timeout);
  }

  // ---- 设备信息 ----
  async readDeviceInfo() {
    // 重试机制: 部分 USB 款枚举初期未就绪, 0x0B 可能短暂超时或返回垃圾数据
    // (实测 4键新款拔插后恢复正常) — 超时/异常时 drain 后重试一次
    let lastTimeoutError = null;
    let lastGarbageResult = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) {
        console.warn(`[NewProto] 0x0B 第${attempt - 1}次异常, 清空残留响应后重试...`);
        await this._drain(200);
      }
      await this._sendPacket(CMD.READ_DEVICE_INFO, 0, 0, []);
      let body;
      try {
        body = await this._waitFor(b => b[0] === CMD.READ_DEVICE_INFO, 3000);
      } catch (e) {
        lastTimeoutError = e;
        console.warn(`[NewProto] 0x0B 第${attempt}次请求超时`);
        continue;
      }

      const dataLen = body[3];
      const data = body.slice(4, 4 + dataLen);
      console.log('[NewProto] readDeviceInfo raw: dataLen=' + dataLen + ' data=[' + Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ') + ']');
      // 解析前 7 个字节为基础字段
      const result = {
        keyCount: data[0],
        encoderCount: data[1],
        encoderDCount: data[2],
        layerCount: data[3],
        hardwareVersion: data[4],
        layoutId: data[5],
        backlightType: data[6],
      };
      // 如果 dataLen > 7，后续字节可能是型号字符串或其他字段
      if (dataLen > 7) {
        const extraData = data.slice(7);
        console.log('[NewProto] readDeviceInfo extra bytes (' + extraData.length + 'B): [' + Array.from(extraData).map(b => b.toString(16).padStart(2, '0')).join(' ') + ']');
        // 尝试将额外字节解析为 ASCII 字符串（型号名）
        const modelNameStr = Array.from(extraData).filter(b => b >= 0x20 && b < 0x7F).map(b => String.fromCharCode(b)).join('');
        if (modelNameStr.length > 0) {
          console.log('[NewProto] readDeviceInfo model name (ASCII): "' + modelNameStr + '"');
          result.modelName = modelNameStr;
        }
        result.extraData = Array.from(extraData);
      }

      // 垃圾数据判定: keyCount/layerCount 为 0 或超上限 (实测新芯片返回 keyCount=0, layerCount=221)
      const garbage = !result.keyCount || result.keyCount > 16 || !result.layerCount || result.layerCount > 16;
      if (!garbage) return result;

      lastGarbageResult = result;
      console.warn(`[NewProto] 0x0B 第${attempt}次返回异常数据 (keyCount=${result.keyCount} layerCount=${result.layerCount})`);
    }

    // 两次均返回垃圾数据: 净化 + 动态探测按键数
    if (lastGarbageResult) {
      const r = lastGarbageResult;
      console.warn('[NewProto] 0x0B 两次均异常, 执行数据净化...');
      if (!r.layerCount || r.layerCount > 16) {
        console.warn(`[NewProto] layerCount=${r.layerCount} 异常, 重置为 1`);
        r.layerCount = 1;
      }
      if (!r.keyCount || r.keyCount > 16) {
        console.warn(`[NewProto] keyCount=${r.keyCount} 异常, 开始动态探测实际按键数...`);
        r.keyCount = await this._probeKeyCount();
        console.warn(`[NewProto] 探测结果 keyCount=${r.keyCount}`);
      }
      console.warn('[NewProto] 0x0B 数据已净化:', JSON.stringify({ keyCount: r.keyCount, encoderCount: r.encoderCount, encoderDCount: r.encoderDCount, layerCount: r.layerCount, hardwareVersion: r.hardwareVersion, layoutId: r.layoutId, backlightType: r.backlightType }));
      return r;
    }

    throw lastTimeoutError || new Error('Response timeout');
  }

  // 动态探测实际按键数: 逐键 READ_KEY (layer 0), 直到 NAK/超时
  // 仅当 0x0B 返回的 keyCount 无效时调用 (正常设备不会走此路径)
  async _probeKeyCount() {
    const MAX_PROBE = 16;
    for (let i = 0; i < MAX_PROBE; i++) {
      try {
        await this._sendPacket(CMD.READ_KEY, 0, i, []);
        const body = await this._waitFor(b => {
          if (b[0] === CMD.READ_KEY && b[1] === 0 && b[2] === i) return true;
          if (b[0] === CMD.NAK) return true;
          return false;
        }, 800);
        if (body[0] === CMD.NAK) {
          console.log(`[NewProto] 探测: keyIdx=${i} NAK, 实际按键数=${i}`);
          return i;
        }
        console.log(`[NewProto] 探测: keyIdx=${i} 存在`);
      } catch (e) {
        console.log(`[NewProto] 探测: keyIdx=${i} 超时, 实际按键数=${i}`);
        return i;
      }
    }
    return MAX_PROBE;
  }

  // 探测设备是否存活: 发送 0x0C, 等待任何响应 (数据/ACK/NAK 均算存活)
  // 用于 0x0B 超时时区分「蓝牙无线款(完全无响应)」与「USB款异常状态(仍有响应)」
  async probeAlive(timeoutMs = 2000) {
    try {
      await this._sendPacket(CMD.READ_EXT_DEVICE_INFO, 0, 0, []);
      const body = await this._waitFor(b => b && b.length >= 2, timeoutMs);
      console.log('[NewProto] probeAlive 收到响应 cmd=0x' + body[0].toString(16));
      return true;
    } catch (e) {
      console.log('[NewProto] probeAlive 超时无任何响应');
      return false;
    }
  }

  async readExtDeviceInfo(timeoutMs = 1500) {
    await this._sendPacket(CMD.READ_EXT_DEVICE_INFO, 0, 0, []);
    const body = await this._waitFor(b => b[0] === CMD.READ_EXT_DEVICE_INFO, timeoutMs);
    const dataLen = body[3];
    const data = body.slice(4, 4 + dataLen);
    const magic = data[0];
    const version = data[1];
    const length = data[2];
    if (magic !== 0xA5 || version < 1 || length < 8) {
      return { valid: false, magic, version, capabilities: 0 };
    }
    const capabilities = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
    return { valid: true, magic, version, capabilities };
  }

  // 检测是否为麦克风设备
  // 检测麦克风设备: 依次尝试多种命令格式
  // 协议命令 0x0D (READ_MIC_INFO) / 0x0E (WRITE_MIC_INFO)
  // 返回 { hasMicrophone, method } — method 标识检测方式供调用方参考
  async detectMicrophone() {
    const attempts = [
      { cmd: CMD.READ_MIC_INFO, keyIdx: 0, label: '0x0D keyIdx=0' },
      { cmd: CMD.READ_MIC_INFO, keyIdx: 0xFF, label: '0x0D keyIdx=0xFF' },
      { cmd: CMD.WRITE_MIC_INFO, keyIdx: 0, label: '0x0E keyIdx=0' },
    ];

    for (const att of attempts) {
      const cmdName = att.cmd === CMD.READ_MIC_INFO ? 'READ_MIC_INFO' : 'WRITE_MIC_INFO';
      console.log(`[NewProto] 麦克风检测: 发送 ${att.label}...`);
      await this._sendPacket(att.cmd, 0, att.keyIdx, []);
      try {
        // 超时从 2000ms 缩短到 800ms: 麦克风设备响应很快(<100ms), 普通键盘对 0x0D/0x0E
        // 完全不响应, 3 种格式各等 2s 会白白拖慢连接流程 6s (客户反馈等待过久以为卡死)
        const body = await this._waitFor(b => {
          return b[0] === att.cmd || b[0] === CMD.ACK || b[0] === CMD.NAK;
        }, 800);

        if (body[0] === att.cmd) {
          const dataLen = body[3];
          const data = body.slice(4, 4 + dataLen);
          console.log(`[NewProto] ${att.label} 麦克风设备响应: dataLen=${dataLen} data=[${Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);
          return { hasMicrophone: true, method: `protocol:${att.label}` };
        } else if (body[0] === CMD.ACK) {
          console.log(`[NewProto] ${att.label} ACK (设备支持麦克风功能)`);
          return { hasMicrophone: true, method: `protocol-ack:${att.label}` };
        } else if (body[0] === CMD.NAK) {
          const status = body[1];
          console.log(`[NewProto] ${att.label} NAK status=0x${status.toString(16).padStart(2, '0')}`);
          // 继续尝试下一种格式
        }
      } catch (e) {
        console.log(`[NewProto] ${att.label} 超时`);
      }
    }

    // 所有协议命令尝试完毕, 均未得到肯定响应
    console.log('[NewProto] 协议命令未检测到麦克风, 返回 false');
    return { hasMicrophone: false, method: 'protocol:none' };
  }

  // ---- 读取整层按键配置 ----
  async readLayer(layer, totalActions) {
    const configs = Array.from({ length: totalActions }, () => ({
      mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0,
      mouseScroll: 0, mediaCode: null, multiKeys: [], macroSteps: [],
    }));

    console.log(`[NewProto] readLayer(${layer}, totalActions=${totalActions})`);

    // 对于按键数较少的设备 (≤8), 直接逐键读取, 避免 READ_LAYER 超时等待
    // READ_LAYER 在某些固件版本上可能不支持或响应很慢
    const useDirectRead = totalActions <= 8;

    if (!useDirectRead) {
      // 大量按键时尝试 READ_LAYER 批量读取
      await this._sendPacket(CMD.READ_LAYER, layer, 0xFF, []);
      await new Promise(r => setTimeout(r, 200));

      let macroBuffer = null;
      const deadline = Date.now() + 8000;
      let layerReadOk = false;
      while (Date.now() < deadline) {
        let body;
        try {
          body = await this._waitFor(b => {
            if (b[1] !== layer) return false;
            if (b[0] === CMD.ACK && b[2] === 0xFF) return true;
            if (b[0] === CMD.NAK) return true;
            if (b[0] === CMD.READ_KEY && b[2] !== 0xFF) return true;
            if (b[0] === CMD.READ_MACRO) return true;
            return false;
          }, 5000);
        } catch (e) {
          console.warn('[NewProto] READ_LAYER 超时, 降级逐键读取...');
          break;
        }

        if (body[0] === CMD.NAK) {
          const status = body[1];
          throw new Error(`读取层失败: NAK status 0x${status.toString(16)}`);
        }
        if (body[0] === CMD.ACK && body[2] === 0xFF) {
          layerReadOk = true;
          break;
        }
        if (body[0] === CMD.READ_KEY) {
          const actionIdx = body[2];
          const dataLen = body[3];
          const actionBytes = body.slice(4, 4 + dataLen);
          if (actionIdx >= 0 && actionIdx < totalActions) {
            configs[actionIdx] = actionBytesToConfig(actionBytes);
          }
          continue;
        }
        if (body[0] === CMD.READ_MACRO) {
          const keyIdx = body[2];
          const pktIdx = body[3];
          const totalPkts = body[4];
          const pktDataLen = body[5];
          const pktData = body.slice(6, 6 + pktDataLen);

          if (!macroBuffer || macroBuffer.keyIdx !== keyIdx) {
            macroBuffer = { keyIdx, totalPkts, packets: new Array(totalPkts), receivedCount: 0, totalDataLen: 0 };
          }
          if (pktIdx < macroBuffer.totalPkts && !macroBuffer.packets[pktIdx]) {
            macroBuffer.packets[pktIdx] = pktData;
            macroBuffer.receivedCount++;
            macroBuffer.totalDataLen += pktDataLen;
          }
          if (macroBuffer.receivedCount >= macroBuffer.totalPkts) {
            const allData = new Uint8Array(macroBuffer.totalDataLen);
            let offset = 0;
            for (let p = 0; p < macroBuffer.totalPkts; p++) {
              if (macroBuffer.packets[p]) { allData.set(macroBuffer.packets[p], offset); offset += macroBuffer.packets[p].length; }
            }
            if (keyIdx >= 0 && keyIdx < totalActions) {
              configs[keyIdx] = actionBytesToConfig(allData);
            }
            macroBuffer = null;
          }
          continue;
        }
      }
      if (layerReadOk) return configs;
    }

    // 逐键读取 (小按键数设备直接走这里, 大量按键 READ_LAYER 失败也降级到这里)
    console.log(`[NewProto] 逐键读取 ${totalActions} 个动作 (layer=${layer})...`);
    for (let i = 0; i < totalActions; i++) {
      try {
        console.log(`[NewProto] >>> 发送 READ_KEY: layer=${layer} keyIdx=${i}`);
        await this._sendPacket(CMD.READ_KEY, layer, i, []);
        // 精确匹配: cmd + layer + keyIdx
        // 注意: 宏按键设备可能直接返回 READ_MACRO (cmd=0x08) 而非 READ_KEY (cmd=0x03)
        const body = await this._waitFor(b => {
          if (b[0] === CMD.READ_KEY && b[1] === layer && b[2] === i) return true;
          if (b[0] === CMD.READ_MACRO && b[1] === layer && b[2] === i) return true;
          if (b[0] === CMD.NAK && b[1] === layer) return true;
          return false;
        }, 1500);

        const bodyHex = Array.from(body.slice(0, Math.min(body.length, 20))).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`[NewProto] <<< 键${i} 原始响应 [${body.length}B]: ${bodyHex}`);
        console.log(`[NewProto]   body[0]=0x${body[0].toString(16)} body[1]=0x${body[1].toString(16)} body[2]=0x${body[2].toString(16)} body[3]=0x${body[3].toString(16)}`);

        if (body[0] === CMD.NAK) {
          console.warn(`[NewProto] 键${i} 读取返回 NAK, status=0x${body[1].toString(16)}, 跳过`);
          continue;
        }

        // 设备直接返回 READ_MACRO (HidMacroPacket 格式)
        // pktData 已经包含 ActionHeader(9B) + stepData, 不需要再 wrap
        if (body[0] === CMD.READ_MACRO) {
          console.log(`[NewProto]   设备直接返回 READ_MACRO, 直接解析宏数据`);
          const pktIdx = body[3];
          const totalPkts = body[4];
          const pktDataLen = body[5];
          const pktData = body.slice(6, 6 + pktDataLen);
          console.log(`[NewProto]   READ_MACRO pktIdx=${pktIdx} totalPkts=${totalPkts} pktDataLen=${pktDataLen}`);

          if (totalPkts <= 1) {
            // 单包: pktData 已包含完整 ActionHeader + stepData, 直接解析
            configs[i] = actionBytesToConfig(pktData);
          } else {
            // 多包: 第一包包含 ActionHeader(9B) + 部分 stepData
            // 后续包只包含剩余 stepData
            const packets = new Array(totalPkts);
            packets[pktIdx] = pktData;
            let received = 1;

            while (received < totalPkts) {
              const nextBody = await this._waitFor(b => {
                if (b[0] === CMD.READ_MACRO && b[1] === layer && b[2] === i) return true;
                return false;
              }, 1500);
              const pIdx = nextBody[3];
              const pDataLen = nextBody[5];
              const pData = nextBody.slice(6, 6 + pDataLen);
              packets[pIdx] = pData;
              received++;
            }

            // 拼接所有包的数据
            const allData = new Uint8Array(packets.reduce((sum, p) => sum + (p ? p.length : 0), 0));
            let offset = 0;
            for (let p = 0; p < totalPkts; p++) {
              if (packets[p]) { allData.set(packets[p], offset); offset += packets[p].length; }
            }
            // allData 已包含完整 ActionHeader + stepData, 直接解析
            configs[i] = actionBytesToConfig(allData);
          }
        } else if (body[0] === CMD.READ_KEY) {
          // 标准 READ_KEY 响应
          const respKeyIdx = body[2];
          const dataLen = body[3];
          const actionBytes = body.slice(4, 4 + dataLen);
          console.log(`[NewProto]   解析: respKeyIdx=${respKeyIdx} dataLen=${dataLen} actionBytes(${actionBytes.length})=[${Array.from(actionBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);

          // 检查是否是宏类型 (keyType=0x01)
          if (dataLen >= 9 && actionBytes[0] === KEY_TYPE.MACRO) {
            // 宏按键: 还需要通过 READ_MACRO 读取宏数据
            await this._sendPacket(CMD.READ_MACRO, layer, i, []);
            const macroBody = await this._waitFor(b => {
              if (b[0] === CMD.READ_MACRO && b[1] === layer && b[2] === i) return true;
              if (b[0] === CMD.NAK && b[1] === layer) return true;
              return false;
            }, 1500);

            if (macroBody[0] === CMD.READ_MACRO) {
              const pktIdx = macroBody[3];
              const totalPkts = macroBody[4];
              const pktDataLen = macroBody[5];
              const pktData = macroBody.slice(6, 6 + pktDataLen);

              // READ_MACRO 返回的是宏 step 原始数据 (step_count + steps),
              // 需要包裹 ActionHeader 才能传给 actionBytesToConfig
              // actionBytes (来自 READ_KEY) 包含 ActionHeader (9字节)
              const wrapWithHeader = (stepData) => {
                const full = new Uint8Array(9 + stepData.length);
                full.set(actionBytes.slice(0, 9), 0); // ActionHeader (keyType=0x01, dataLen 等)
                full[7] = stepData.length & 0xFF;
                full[8] = (stepData.length >> 8) & 0xFF;
                full.set(stepData, 9);
                return full;
              };

              if (totalPkts <= 1) {
                // 单包宏数据
                configs[i] = actionBytesToConfig(wrapWithHeader(pktData));
              } else {
                // 多包宏数据, 继续接收剩余包
                const packets = new Array(totalPkts);
                packets[pktIdx] = pktData;
                let received = 1;
                let totalLen = pktDataLen;

                while (received < totalPkts) {
                  const nextBody = await this._waitFor(b => {
                    if (b[0] === CMD.READ_MACRO && b[1] === layer && b[2] === i) return true;
                    return false;
                  }, 1500);
                  const pIdx = nextBody[3];
                  const pDataLen = nextBody[5];
                  const pData = nextBody.slice(6, 6 + pDataLen);
                  packets[pIdx] = pData;
                  received++;
                  totalLen += pDataLen;
                }

                const allStepData = new Uint8Array(totalLen);
                let offset = 0;
                for (let p = 0; p < totalPkts; p++) {
                  if (packets[p]) { allStepData.set(packets[p], offset); offset += packets[p].length; }
                }
                configs[i] = actionBytesToConfig(wrapWithHeader(allStepData));
              }
            } else {
              // READ_MACRO 返回 NAK, 使用基础 action bytes
              configs[i] = actionBytesToConfig(actionBytes);
            }
          } else {
            configs[i] = actionBytesToConfig(actionBytes);
          }
        }
        console.log(`[NewProto] 键${i} 解析结果: mode=${configs[i].mode} keyCode=${configs[i].keyCode || 0} modifier=${configs[i].modifier || 0}${configs[i].macroSteps ? ' macroSteps=' + configs[i].macroSteps.length : ''}`);
      } catch (e) {
        console.warn(`[NewProto] 键${i} 读取超时:`, e.message);
      }
    }
    console.log('[NewProto] 逐键读取完成, configs:', configs.map((c, i) => `K${i + 1}:mode=${c.mode}`).join(', '));
    return configs;
  }

  // ---- 写入单个按键 ----
  async writeKey(layer, actionIdx, config) {
    const actionBytes = configToActionBytes(config);
    if (!actionBytes) {
      // mode=0 → 清除
      return this.clearKey(layer, actionIdx);
    }
    if (actionBytes.length > 58) {
      throw new Error('Action data too long');
    }
    await this._sendPacket(CMD.WRITE_KEY, layer, actionIdx, Array.from(actionBytes));
    await this._waitForAck(CMD.WRITE_KEY, layer, actionIdx, 20000);
  }

  // ---- 清除单个按键 ----
  async clearKey(layer, actionIdx) {
    await this._sendPacket(CMD.CLEAR_KEY, layer, actionIdx, []);
    await this._waitForAck(CMD.CLEAR_KEY, layer, actionIdx, 20000);
  }

  // ---- 写入宏数据 ----
  async writeMacro(layer, actionIdx, macroSteps) {
    // 构建完整宏动作字节流: ActionHeader + step_count + MacroStep[]
    const stepData = serializeMacro(macroSteps); // [stepCount(1B)] + N×[act,keyCode,delay(2B)]
    const dataLen = stepData.length; // = 1 + steps.length * 4
    const actionBytes = new Uint8Array(9 + dataLen);
    actionBytes[0] = KEY_TYPE.MACRO; // key_type = 0x01
    // bytes[1..6] = 0 (flags, reserved, param1, param2)
    actionBytes[7] = dataLen & 0xFF;
    actionBytes[8] = (dataLen >> 8) & 0xFF;
    actionBytes.set(stepData, 9);

    console.log(`[NewProto] writeMacro: ${macroSteps.length} steps, actionBytes=${actionBytes.length}B (header=9 + dataLen=${dataLen})`);

    // 按 HidMacroPacket 格式分包, 每包 data 最大 56 字节 (body[6..61])
    const MAX_MACRO_DATA = 56;
    const totalPkts = Math.ceil(actionBytes.length / MAX_MACRO_DATA);

    for (let pktIdx = 0; pktIdx < totalPkts; pktIdx++) {
      const start = pktIdx * MAX_MACRO_DATA;
      const end = Math.min(start + MAX_MACRO_DATA, actionBytes.length);
      const chunk = actionBytes.slice(start, end);
      await this._sendMacroPacket(CMD.WRITE_MACRO, layer, actionIdx, pktIdx, totalPkts, chunk);
      await this._waitForAck(CMD.WRITE_MACRO, layer, actionIdx, 20000);
    }
  }

  // ---- 保存层到 VM ----
  async saveLayer(layer) {
    await this._sendPacket(CMD.SAVE_LAYER, layer, 0xFF, []);
    await this._waitForAck(CMD.SAVE_LAYER, layer, 0xFF, 10000);
  }

  // ---- 设置活动层 ----
  async setActiveLayer(layer) {
    await this._sendPacket(CMD.SET_ACTIVE_LAYER, layer, 0xFF, []);
    await this._waitForAck(CMD.SET_ACTIVE_LAYER, layer, 0xFF, 8000);
  }

  // ---- 写入灯光配置 ----
  async writeLedLayer(layer, mode, colors, sleepAllow = 1) {
    const data = new Uint8Array(52);
    data[0] = mode;
    data[1] = sleepAllow;
    data[2] = 0; data[3] = 0; // reserved
    for (let i = 0; i < 16; i++) {
      const c = colors[i] || { r: 0, g: 0, b: 0 };
      data[4 + i * 3] = c.r;
      data[5 + i * 3] = c.g;
      data[6 + i * 3] = c.b;
    }
    await this._sendPacket(CMD.WRITE_LED_LAYER, layer, 0xFE, Array.from(data));
    await this._waitForAck(CMD.WRITE_LED_LAYER, layer, 0xFE, 8000);
    // 保存到 flash, 确保灯光模式持久化
    await this._drain(200);
    await this.saveLayer(layer);
  }

  // ---- 读取灯光配置 ----
  async readLedLayer(layer) {
    await this._sendPacket(CMD.READ_LED_LAYER, layer, 0xFE, []);
    const body = await this._waitFor(
      b => b[0] === CMD.READ_LED_LAYER && b[1] === layer && b[2] === 0xFE,
      5000
    );
    const data = body.slice(4, 4 + 52);
    const mode = data[0];
    const sleepAllow = data[1];
    const colors = [];
    for (let i = 0; i < 16; i++) {
      colors.push({ r: data[4 + i * 3], g: data[5 + i * 3], b: data[6 + i * 3] });
    }
    return { mode, sleepAllow, colors };
  }

  // ---- 完整保存流程 (匹配协议 8.2 节) ----
  async saveAll(layer, keyConfigs, currentLayer) {
    console.log(`[NewProto] saveAll 开始: layer=${layer}, keys=${keyConfigs.length}, currentLayer=${currentLayer}`);
    // 初始 drain: 清除之前操作可能遗留的过期响应
    await this._drain(200);
    // 1. 逐个写入按键
    for (let i = 0; i < keyConfigs.length; i++) {
      const cfg = keyConfigs[i];
      const stepLabel = `键${i + 1}/${keyConfigs.length}`;
      try {
        // 每次写入前 drain, 清除设备可能发送的多余响应
        await this._drain(100);
        if (!cfg || cfg.mode === 0) {
          console.log(`[NewProto] saveAll ${stepLabel}: 清除`);
          await this.clearKey(layer, i);
        } else if (cfg.mode === 5) {
          if (cfg.macroSteps && cfg.macroSteps.length > 0) {
            // 宏按键: 协议 Section 5.1 规定 Macro 类型仅可使用 0x02 宏分包命令
            console.log(`[NewProto] saveAll ${stepLabel}: 写入宏 (steps=${cfg.macroSteps.length}) via WRITE_MACRO`);
            await this.writeMacro(layer, i, cfg.macroSteps);
          } else {
            // mode=5 但 macroSteps 为空 → 视为清除 (避免通过 WRITE_KEY 发送空 MACRO 导致 NAK)
            console.log(`[NewProto] saveAll ${stepLabel}: mode=5 但 macroSteps 为空, 清除该键`);
            await this.clearKey(layer, i);
          }
        } else {
          console.log(`[NewProto] saveAll ${stepLabel}: mode=${cfg.mode} keyCode=${cfg.keyCode || 0} modifier=${cfg.modifier || 0}`);
          await this.writeKey(layer, i, cfg);
        }
      } catch (e) {
        throw new Error(`${stepLabel} 写入失败: ${e.message}`);
      }
      // 键间延迟, 给设备 flash 写入处理时间 (4键设备实测需要 500ms+)
      if (i < keyConfigs.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    // 2. 保存层到 VM
    console.log('[NewProto] saveAll: 保存层到 VM...');
    await this._drain(200);
    try {
      await this.saveLayer(layer);
    } catch (e) {
      throw new Error(`保存层失败: ${e.message}`);
    }
    // 3. 设置活动层
    if (currentLayer !== undefined) {
      console.log(`[NewProto] saveAll: 设置活动层=${currentLayer}...`);
      await this._drain(100);
      try {
        await this.setActiveLayer(currentLayer);
      } catch (e) {
        throw new Error(`设置活动层失败: ${e.message}`);
      }
    }
    console.log('[NewProto] saveAll 完成');
  }
}
