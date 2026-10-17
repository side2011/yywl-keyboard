// ============================================================
// protocols/old-protocol.js — CH55x 旧协议独立模块 (node-hid)
// 传输层 (对照 C# HidLibrary): 写报告 = [reportId(0 或 3), 长度, ...数据]
//   输入报告 64B: reportId=0 的型号 data[0]=长度; reportId=3 (10KDZ1) data[0]=0x03, payload=data.slice(1)
// 按键配置帧: [长度, 键位, 模式, ...]
// 读配置: 发 [0x55] (10KDZ1: [0xFA,0x08,0x01]), 设备逐个回传 64B 报告
// 灯光: [0x57, 模式] / [0x57, z1, z2]; 自定义颜色 [0x70, G,R,B...]; 延时 [0x58+键位, 高, 低]
// ============================================================
'use strict';

// ---- PID → 型号映射 (VID 0x8808) ----
const PID_TO_MODEL = {
  0x6600: '1K', 0x6601: '2K', 0x6602: '2K-mini', 0x6603: '3K',
  0x6604: '4K', 0x6605: '5K', 0x6606: '6K', 0x6607: '7K-noled',
  0x6608: '7K', 0x6609: '8K', 0x660A: '9K', 0x660B: '12K',
  0x660C: 'DXN', 0x660D: '2KPlus', 0x660E: '3KPlus', 0x660F: 'FOOT',
  0x6610: '4K-side', 0x6611: 'FXJ', 0x6612: 'DIY10K', 0x6613: 'xnAnd4K',
  0x6614: '8KDZ6', 0x6615: '4K-side-new', 0x6616: '5K-touch',
  0x6617: '8K-new', 0x6618: '3KDZ15',
};

// ---- 型号定义 (对应 C# buding.KeyIDToDataLen) ----
const DEVICE_MODELS = {
  '1K':           { keyCount: 1,  dataLen: 0x35, multiKeyLen: 50, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '2K':           { keyCount: 2,  dataLen: 0x35, multiKeyLen: 50, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '2K-mini':      { keyCount: 2,  dataLen: 0x35, multiKeyLen: 50, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '3K':           { keyCount: 3,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '4K':           { keyCount: 4,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '5K':           { keyCount: 5,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '6K':           { keyCount: 6,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '7K-noled':     { keyCount: 7,  dataLen: 0x11, multiKeyLen: 15, hasRgb: false, hasDelay: false, reportId: 0 },
  '7K':           { keyCount: 7,  dataLen: 0x11, multiKeyLen: 15, hasRgb: true,  hasDelay: false, reportId: 0 },
  '8K':           { keyCount: 8,  dataLen: 0x0F, multiKeyLen: 12, hasRgb: true,  hasDelay: false, reportId: 0 },
  '9K':           { keyCount: 9,  dataLen: 0x0D, multiKeyLen: 10, hasRgb: true,  hasDelay: false, reportId: 0 },
  '12K':          { keyCount: 12, dataLen: 0x0A, multiKeyLen: 7,  hasRgb: true,  hasDelay: false, reportId: 0 },
  'DXN':          { keyCount: 1,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: false, reportId: 0 },
  '2KPlus':       { keyCount: 5,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0, layout: 'pad', dualZone: true },
  '3KPlus':       { keyCount: 6,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0, layout: 'pad', dualZone: true },
  'FOOT':         { keyCount: 1,  dataLen: 0x35, multiKeyLen: 50, hasRgb: false, hasDelay: false, reportId: 0 },
  '4K-side':      { keyCount: 4,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: false, reportId: 0 },
  'FXJ':          { keyCount: 4,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  'DIY10K':       { keyCount: 10, dataLen: 0x0A, multiKeyLen: 7,  hasRgb: true,  hasDelay: false, reportId: 0 },
  'xnAnd4K':      { keyCount: 7,  dataLen: 0x10, multiKeyLen: 12, hasRgb: true,  hasDelay: false, reportId: 0, layout: 'knob', dualZone: true },
  '8KDZ6':        { keyCount: 8,  dataLen: 0x10, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0, multiKeyOnly: true },
  '4K-side-new':  { keyCount: 4,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: false, reportId: 0 },
  '5K-touch':     { keyCount: 5,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '8K-new':       { keyCount: 8,  dataLen: 0x0C, multiKeyLen: 9,  hasRgb: true,  hasDelay: true,  reportId: 0 },
  '3KDZ15':       { keyCount: 3,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '10KDZ1':       { keyCount: 8,  dataLen: 0x15, multiKeyLen: 20, hasRgb: false, hasDelay: true,  reportId: 3, multiKeyOnly: true },
};

const MODEL_NAMES = {
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

// ---- 多媒体键 (C# KeyMediaForm) ----
const MEDIA_KEYS = [
  { label: '播放/暂停', code: [0x04, 0xCD, 0x00, 0x00] },
  { label: '停止播放',  code: [0x04, 0xB7, 0x00, 0x00] },
  { label: '上一首',    code: [0x04, 0xB6, 0x00, 0x00] },
  { label: '下一首',    code: [0x04, 0xB5, 0x00, 0x00] },
  { label: '我的电脑',  code: [0x04, 0x94, 0x01, 0x00] },
  { label: '亮度+',     code: [0x04, 0x6F, 0x00, 0x00] },
  { label: '亮度-',     code: [0x04, 0x70, 0x00, 0x00] },
  { label: '打开媒体',  code: [0x04, 0x83, 0x01, 0x00] },
  { label: '系统静音',  code: [0x04, 0xE2, 0x00, 0x00] },
  { label: '音量+',     code: [0x04, 0xEA, 0x00, 0x00] },
  { label: '音量-',     code: [0x04, 0xE9, 0x00, 0x00] },
  { label: '打开计算器', code: [0x04, 0x92, 0x01, 0x00] },
  { label: '打开浏览器', code: [0x04, 0x23, 0x02, 0x00] },
  { label: '打开邮件',  code: [0x04, 0x8A, 0x01, 0x00] },
  { label: '网页刷新',  code: [0x04, 0x53, 0x01, 0x00] },
  { label: '网页前进',  code: [0x04, 0x52, 0x01, 0x00] },
  { label: '网页后退',  code: [0x04, 0x55, 0x01, 0x00] },
  { label: '低音+',     code: [0x04, 0x27, 0x02, 0x00] },
  { label: '低音-',     code: [0x04, 0x25, 0x02, 0x00] },
  { label: '高音+',     code: [0x04, 0x24, 0x02, 0x00] },
];

// ---- 鼠标 (C# buding.IndexToMouse) ----
const MOUSE_BUTTONS = ['无', '左键', '右键', '中键'];
function mouseIndexToDevice(index) { return index === 3 ? 4 : index; }
function mouseDeviceToIndex(val)  { return val === 4 ? 3 : val; }

// ---- RGB 灯光模式表 ----
const RGB_MODES_A = ['灯光关闭','按下亮-随机色','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白','按下双呼吸','按下双闪','按下单闪','常亮模式','台灯模式','自定义颜色'];
const RGB_MODES_B = ['灯光关闭','流水模式1','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白','流水模式2','流水模式3','放射灯光','常亮模式','台灯模式','自定义颜色'];
const RGB_MODES_BP = ['灯光关闭','流水模式1','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白','流水模式2','流水模式3','放射灯光','常亮模式','台灯模式','自定义颜色','自定义颜色2'];
const RGB_MODES_C = ['灯光关闭','流水模式1','流水模式2','流水模式3','放射灯光','常亮模式','台灯模式','自定义颜色','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白'];
const RGB_MODES_D = ['灯光关闭','流水模式1','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白','流水模式2','流水模式3','放射灯光','常亮模式','台灯模式'];
const RGB_MODES_E = ['灯光关闭','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白','常亮模式','台灯模式','自定义颜色'];
const RGB_MODES_F = ['灯光关闭','常亮模式','台灯模式','自定义颜色'];
const RGB_MODES_G = ['灯光关闭','常亮模式','台灯模式','按下单闪','按下双闪','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白','按下亮-随机色','自定义颜色'];
const RGB_MODES_H = ['灯光关闭','常亮模式','台灯模式','按下单闪','按下双闪','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白','按下亮-随机色'];
const RGB_MODES_I = ['灯光关闭','常亮模式','自定义颜色'];
const RGB_MODES_G2 = ['灯光关闭','按下亮-随机色','按下亮-红','按下亮-绿','按下亮-蓝','按下亮-黄','按下亮-青','按下亮-紫','按下亮-白','流水模式1','常亮模式','自定义颜色'];
const RGB_MODES_I2 = ['灯光关闭','流水模式1','常亮模式','自定义颜色','按下亮指定颜色'];

function getRgbModesForModel(modelId) {
  const map = {
    '1K': 'A', '2K': 'A', '2K-mini': 'A',
    '3K': 'B', '4K': 'B', '5K': 'B', '6K': 'B', '7K': 'B',
    '9K': 'B', '10KDZ1': 'B', 'FXJ': 'B', '5K-touch': 'B',
    '8K': 'C', '8K-new': 'C',
    '8KDZ6': 'D',
    '12K': 'E',
    'DXN': 'F',
    '2KPlus': 'G',
    '3KPlus': 'H',
    'xnAnd4K': 'I', '4K-side': 'I', '4K-side-new': 'I',
    '3KDZ15': 'BP',
  };
  const lookup = {
    A: RGB_MODES_A, B: RGB_MODES_B, BP: RGB_MODES_BP,
    C: RGB_MODES_C, D: RGB_MODES_D, E: RGB_MODES_E,
    F: RGB_MODES_F, G: RGB_MODES_G, H: RGB_MODES_H, I: RGB_MODES_I,
  };
  return lookup[map[modelId] || 'B'];
}

function getRgbModes2ForModel(modelId) {
  const map = { '2KPlus': RGB_MODES_G2, '3KPlus': RGB_MODES_G2, 'xnAnd4K': RGB_MODES_I2 };
  return map[modelId] || null;
}

// LED 模式下标转换 (C# buding.IndexToLedLoc)
function ledIndexToDevice(dropdownIndex, modelId) {
  if (modelId === '12K') {
    const map = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 12, 9: 13, 10: 14 };
    return map[dropdownIndex] ?? dropdownIndex;
  }
  if (modelId === 'DXN') {
    const map = { 1: 12, 2: 13, 3: 14 };
    return map[dropdownIndex] ?? dropdownIndex;
  }
  return dropdownIndex;
}
function ledDeviceToIndex(deviceLed, modelId) {
  if (modelId === '12K') {
    const map = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 12: 8, 13: 9, 14: 10 };
    return map[deviceLed] ?? deviceLed;
  }
  if (modelId === 'DXN') {
    const map = { 12: 1, 13: 2, 14: 3 };
    return map[deviceLed] ?? deviceLed;
  }
  return deviceLed;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// 输入报告解析 (对照 web hid-service.js parseReport)
// ============================================================
function parseReport(bytes, modelId) {
  const model = DEVICE_MODELS[modelId];
  if (!model) return null;
  const data0 = bytes[0];
  const data1 = bytes[1];
  if (data0 === 0x02 && data1 === 0x08) {
    const raw = bytes[2];
    return { type: 'rgb_mode', modeIndex: raw === 0xFF ? 0 : ledDeviceToIndex(raw, modelId) };
  }
  if (data0 === 0x02 && data1 === 0x63) {
    const raw = bytes[2];
    return { type: 'rgb_mode', modeIndex: raw === 0xFF ? 0 : ledDeviceToIndex(raw, modelId) };
  }
  if (data0 === 0x03 && data1 === 0x08) {
    const raw1 = bytes[2];
    const raw2 = bytes[3];
    const result = { type: 'rgb_mode', modeIndex: raw1 === 0xFF ? 0 : ledDeviceToIndex(raw1, modelId) };
    if (model.dualZone) {
      result.mode2Index = raw2 === 0xFF ? 0 : ledDeviceToIndex(raw2, modelId);
    }
    return result;
  }
  if (data0 === 0x04) {
    const subType = data1;
    const color = { g: bytes[2], r: bytes[3], b: bytes[4] };
    if (model.dualZone) {
      if (modelId === '3KPlus') return { type: 'custom_color2', ...color };
      if (subType === 0x65) return { type: 'custom_color2', ...color };
      return { type: 'custom_color', ...color };
    }
    return { type: 'custom_color', ...color };
  }
  if (data0 === 0x03 && data1 >= 0x58 && data1 <= 0x5F) {
    const keyIndex = data1 - 0x58;
    const delayMs = ((bytes[2] & 0xFF) << 8) | bytes[3];
    return { type: 'key_delay', keyIndex, delayMs };
  }
  if (data0 === model.dataLen && data1 >= 0x01 && data1 <= model.keyCount) {
    const keyPos = data1;
    const rawData = bytes.slice(0, model.dataLen);
    if (model.multiKeyOnly) {
      const keys = [];
      for (let i = 1; i < model.dataLen; i++) {
        if (bytes[i] === 0x00 || bytes[i] === 0xFF) break;
        keys.push(bytes[i]);
      }
      return { type: 'key_config', keyPos, cfg: { mode: 4, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: keys, macroSteps: [] }, rawData };
    }
    const mode = bytes[2];
    if (mode === 0xFF) {
      return { type: 'key_config', keyPos, cfg: { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: [], macroSteps: [] }, rawData };
    }
    const cfg = { mode, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
    switch (mode) {
      case 1:
        cfg.modifier = bytes[3];
        cfg.keyCode = bytes[4];
        break;
      case 2:
        cfg.mouseButton = bytes[3];
        cfg.mouseX = bytes[4];
        cfg.mouseY = bytes[5];
        cfg.mouseScroll = bytes[6];
        break;
      case 3:
        cfg.mediaCode = [bytes[3], bytes[4], bytes[5], bytes[6]];
        break;
      case 4:
        cfg.modifier = bytes[3];
        for (let i = 4; i < model.dataLen; i++) {
          if (bytes[i] === 0x00 || bytes[i] === 0xFF) break;
          cfg.multiKeys.push(bytes[i]);
        }
        break;
    }
    return { type: 'key_config', keyPos, cfg, rawData };
  }
  return null;
}

// ============================================================
// 处理器
// ============================================================
class OldProtocolHandler {
  constructor(device, modelId, debugLog = () => {}) {
    this.device = device;
    this.modelId = modelId;
    this.log = debugLog;
    this._listener = null;
  }

  get model() { return DEVICE_MODELS[this.modelId]; }

  destroy() {
    if (this._listener) {
      try { this.device.removeListener('data', this._listener); } catch {}
      this._listener = null;
    }
  }

  // 写帧: [reportId, 长度, ...数据] — 连发两次 (对照 C#/网页行为)
  async _write(byData) {
    if (!this.model) throw new Error('未知设备型号');
    const frame = Buffer.alloc(byData.length + 1);
    frame[0] = byData.length;
    Buffer.from(byData).copy(frame, 1);
    const out = Buffer.concat([Buffer.from([this.model.reportId]), frame]);
    await sleep(20);
    this.device.write(Array.from(out));
    await sleep(20);
    try { this.device.write(Array.from(out)); } catch {}
  }

  // 读配置: 发 0x55 (10KDZ1: 0xFA 0x08 0x01), 收集输入报告
  async readConfig() {
    const collected = { keyConfigs: [], rgbMode: null, rgbMode2: null, customColor: null, customColor2: null, delays: {} };
    return new Promise((resolve) => {
      const onData = (data) => {
        let bytes = Buffer.from(data);
        if (this.model.reportId === 3) {
          if (bytes[0] !== 3) return;
          bytes = bytes.slice(1);
        } else if (bytes[0] === 0 || bytes.length < 2) {
          return;
        }
        if (bytes.length < 2) return;
        const parsed = parseReport(bytes, this.modelId);
        if (!parsed) return;
        if (parsed.type === 'key_config') {
          if (!collected.keyConfigs.some(k => k.keyPos === parsed.keyPos)) {
            collected.keyConfigs.push(parsed);
          }
        } else if (parsed.type === 'rgb_mode') {
          collected.rgbMode = parsed.modeIndex;
          if (parsed.mode2Index !== undefined) collected.rgbMode2 = parsed.mode2Index;
        } else if (parsed.type === 'custom_color') {
          collected.customColor = parsed;
        } else if (parsed.type === 'custom_color2') {
          collected.customColor2 = parsed;
        } else if (parsed.type === 'key_delay') {
          collected.delays[parsed.keyIndex] = parsed.delayMs;
        }
        // 收齐所有按键配置后提前结束
        if (collected.keyConfigs.length >= this.model.keyCount) {
          clearTimeout(timer);
          this.device.removeListener('data', onData);
          this._listener = null;
          resolve(collected);
        }
      };
      const timer = setTimeout(() => {
        this.device.removeListener('data', onData);
        this._listener = null;
        resolve(collected);
      }, 1500);
      this._listener = onData;
      this.device.on('data', onData);
      // 发读取命令
      (async () => {
        try {
          if (this.model.reportId === 3) {
            const padded = Buffer.alloc(64);
            Buffer.from([0xFA, 0x08, 0x01]).copy(padded, 0);
            const out = Buffer.concat([Buffer.from([0x03]), padded]);
            await sleep(20);
            this.device.write(Array.from(out));
            await sleep(20);
            this.device.write(Array.from(out));
          } else {
            await this._write([0x55]);
          }
        } catch (e) {
          clearTimeout(timer);
          this.device.removeListener('data', onData);
          this._listener = null;
          resolve(collected);
        }
      })();
    });
  }

  // 写按键配置 (通用配置 → 帧)
  async writeKeyConfig(keyPos, config) {
    const model = this.model;
    if (!model) throw new Error('未知设备型号');
    const dataLen = model.dataLen;
    const data = new Uint8Array(dataLen);
    data[0] = dataLen;
    data[1] = keyPos;
    if (model.multiKeyOnly) {
      const keys = config.multiKeys || [];
      for (let i = 0; i < keys.length && i < dataLen - 2; i++) {
        data[2 + i] = keys[i];
      }
    } else {
      data[2] = config.mode;
      switch (config.mode) {
        case 1:
          data[3] = config.modifier || 0;
          data[4] = config.keyCode || 0;
          break;
        case 2:
          data[3] = config.mouseButton || 0;
          data[4] = config.mouseX || 0;
          data[5] = config.mouseY || 0;
          data[6] = config.mouseScroll || 0;
          break;
        case 3:
          if (config.mediaCode) {
            data[3] = config.mediaCode[0];
            data[4] = config.mediaCode[1];
            data[5] = config.mediaCode[2];
            data[6] = config.mediaCode[3];
          }
          break;
        case 4:
          data[3] = config.modifier || 0;
          const keys = config.multiKeys || [];
          for (let i = 0; i < keys.length && i < dataLen - 4; i++) {
            data[4 + i] = keys[i];
          }
          break;
      }
    }
    await this._write(data.slice(1));
  }

  // 灯光模式
  async setRGBMode(modeIndex, mode2Index) {
    const model = this.model;
    if (model?.dualZone && mode2Index !== undefined) {
      await this._write(new Uint8Array([0x57, ledIndexToDevice(modeIndex, this.modelId), ledIndexToDevice(mode2Index, this.modelId)]));
    } else {
      await this._write(new Uint8Array([0x57, ledIndexToDevice(modeIndex, this.modelId)]));
    }
  }

  // 自定义颜色 [0x70, G, R, B...]
  async setCustomColor(r, g, b, color2) {
    const model = this.model;
    if (model?.dualZone) {
      const c2 = color2 || { r: 0, g: 0, b: 0 };
      if (this.modelId === '3KPlus') {
        await this._write(new Uint8Array([0x70, c2.g, c2.r, c2.b]));
      } else {
        await this._write(new Uint8Array([0x70, g, r, b, c2.g, c2.r, c2.b]));
      }
    } else {
      await this._write(new Uint8Array([0x70, g, r, b]));
    }
  }

  // 延时 [0x58+键位, 高, 低]
  async setKeyDelay(keyIndex, delayMs) {
    const cmdByte = 0x58 + keyIndex;
    await this._write(new Uint8Array([cmdByte, (delayMs >> 8) & 0xFF, delayMs & 0xFF]));
  }

  // 整层保存 (通用配置数组)
  async saveAll(keyConfigs, layer = 0, onProgress, ledCfg) {
    const total = keyConfigs.length;
    for (let i = 0; i < total; i++) {
      if (onProgress) onProgress(i, total);
      await this.writeKeyConfig(i + 1, keyConfigs[i] || { mode: 0 });
      await sleep(20);
    }
    if (ledCfg) {
      await this.applyLed(ledCfg);
    }
  }

  // 应用灯光配置 { mode, mode2, customColor, customColor2 }
  async applyLed(ledCfg) {
    const model = this.model;
    if (!model?.hasRgb || ledCfg.mode === undefined || ledCfg.mode < 0) return;
    await this.setRGBMode(ledCfg.mode, ledCfg.mode2);
    // 修复: 下面几处曾引用一个不存在的变量（旧写法以 "mode" 开头、以 "1Name" 结尾），
    //       导致旧协议只要带灯光保存就抛 ReferenceError（键已下发、界面报错）。
    //       变量名统一为 modeName（= Zone1 模式名）。
    const modeName = getRgbModesForModel(this.modelId)[ledCfg.mode] || '';
    const mode2Name = (ledCfg.mode2 !== undefined && getRgbModes2ForModel(this.modelId)) ? getRgbModes2ForModel(this.modelId)[ledCfg.mode2] || '' : '';
    const c1 = ledCfg.customColor || { r: 255, g: 255, b: 255 };
    const c2 = ledCfg.customColor2 || { r: 255, g: 255, b: 255 };
    if (model.dualZone) {
      if (this.modelId === '3KPlus') {
        if (mode2Name.includes('自定义')) await this.setCustomColor(c1.r, c1.g, c1.b, c2);
      } else if (this.modelId === 'xnAnd4K') {
        if (modeName.includes('自定义') || mode2Name.includes('自定义') || mode2Name.includes('按下亮指定颜色')) await this.setCustomColor(c1.r, c1.g, c1.b, c2);
      } else {
        if (modeName.includes('自定义')) await this.setCustomColor(c1.r, c1.g, c1.b, c2);
      }
    } else {
      if (modeName.includes('自定义') && ledCfg.customColor) {
        await this.setCustomColor(ledCfg.customColor.r, ledCfg.customColor.g, ledCfg.customColor.b);
      }
    }
  }
}

// 设备判定
function detectOldModel(vendorId, productId) {
  if (vendorId === 0x8808 && PID_TO_MODEL[productId]) return PID_TO_MODEL[productId];
  if (vendorId === 0x1189 && productId === 0x8834) return '10KDZ1';
  return null; // 0x413D 等需要手动选择
}

module.exports = {
  OldProtocolHandler,
  PID_TO_MODEL,
  DEVICE_MODELS,
  MODEL_NAMES,
  MEDIA_KEYS,
  MOUSE_BUTTONS,
  mouseIndexToDevice,
  mouseDeviceToIndex,
  getRgbModesForModel,
  getRgbModes2ForModel,
  parseReport,
  detectOldModel,
};
