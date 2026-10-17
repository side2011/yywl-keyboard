// ============================================================
// protocols/new-protocol.js — AC632N 新协议独立模块 (node-hid)
// 传输层: 输出报告 reportId=0x03 + 63B body, body[62]=XOR校验
// 仅负责协议通讯与线格式转换, 不依赖任何 UI 逻辑
// ============================================================
'use strict';

const REPORT_ID = 0x03;
const BODY_SIZE = 63;

const CMD = {
  WRITE_KEY: 0x01, WRITE_MACRO: 0x02, READ_KEY: 0x03,
  READ_LAYER: 0x04, CLEAR_KEY: 0x05, ACK: 0x06, NAK: 0x07,
  READ_MACRO: 0x08, WRITE_LED_LAYER: 0x09, READ_LED_LAYER: 0x0A,
  READ_DEVICE_INFO: 0x0B, READ_EXT_DEVICE_INFO: 0x0C, SAVE_LAYER: 0x12, SET_ACTIVE_LAYER: 0x14,
};

const KEY_TYPE = { SIMPLE: 0x00, MACRO: 0x01, MEDIA: 0x02, MOUSE: 0x03, COMBO: 0x04, NONE: 0xFF };
const MACRO_STEP = { PRESS: 0x01, DOWN: 0x02, UP: 0x03, DELAY: 0x04 };
const PROTO_ACT = { PRESS: 0x00, RELEASE: 0x01 };
const PRESS_HOLD_MS = 50;

// ---- 通用配置结构 (渲染层标准): { mode 0-5, modifier(8位掩码), keyCode,
//   mouseButton, mouseX, mouseY, mouseScroll, mediaCode:[0x04,lo,hi,0], multiKeys, macroSteps } ----

function xorChecksum(bytes, len) {
  let v = 0;
  for (let i = 0; i < len; i++) v ^= bytes[i];
  return v;
}

function serializeMacro(steps) {
  const protoSteps = [];
  let pendingDelay = 0;
  for (const step of steps) {
    if (step.action === MACRO_STEP.DELAY) { pendingDelay += (step.delay || 0); continue; }
    const delayBefore = pendingDelay + (step.delay || 0);
    pendingDelay = 0;
    if (step.action === MACRO_STEP.PRESS) {
      protoSteps.push({ act: PROTO_ACT.PRESS, keyCode: step.keyCode, delay: delayBefore });
      protoSteps.push({ act: PROTO_ACT.RELEASE, keyCode: step.keyCode, delay: PRESS_HOLD_MS });
    } else if (step.action === MACRO_STEP.DOWN) {
      protoSteps.push({ act: PROTO_ACT.PRESS, keyCode: step.keyCode, delay: delayBefore });
    } else if (step.action === MACRO_STEP.UP) {
      protoSteps.push({ act: PROTO_ACT.RELEASE, keyCode: step.keyCode, delay: delayBefore });
    }
  }
  if (pendingDelay > 0) {
    protoSteps.push({ act: PROTO_ACT.PRESS, keyCode: 0, delay: pendingDelay });
    protoSteps.push({ act: PROTO_ACT.RELEASE, keyCode: 0, delay: 0 });
  }
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

function deserializeMacro(data) {
  if (!data || data.length < 1) return [];
  const count = data[0];
  const raw = [];
  for (let i = 0; i < count && (1 + (i + 1) * 4) <= data.length; i++) {
    const off = 1 + i * 4;
    const act = data[off];
    const keyCode = data[off + 1];
    const delay = data[off + 2] | (data[off + 3] << 8);
    const isTrailingDelay = (keyCode === 0 && act === PROTO_ACT.PRESS &&
      i + 1 < count &&
      data[off + 4] === PROTO_ACT.RELEASE && data[off + 5] === 0);
    if (isTrailingDelay) {
      if (delay > 0) raw.push({ action: MACRO_STEP.DELAY, keyCode: 0, delay });
      i++;
      continue;
    }
    if (delay > 30) {
      raw.push({ action: MACRO_STEP.DELAY, keyCode: 0, delay });
      raw.push({ action: act === PROTO_ACT.RELEASE ? MACRO_STEP.UP : MACRO_STEP.DOWN, keyCode, delay: 0 });
    } else {
      raw.push({ action: act === PROTO_ACT.RELEASE ? MACRO_STEP.UP : MACRO_STEP.DOWN, keyCode, delay });
    }
  }
  const absorbed = [];
  let j = 0;
  while (j < raw.length) {
    if (j + 2 < raw.length && raw[j].action === MACRO_STEP.DOWN && raw[j + 1].action === MACRO_STEP.DELAY &&
        raw[j + 2].action === MACRO_STEP.UP && raw[j].keyCode === raw[j + 2].keyCode) {
      absorbed.push(raw[j]);
      absorbed.push({ ...raw[j + 2], delay: (raw[j + 2].delay || 0) + (raw[j + 1].delay || 0) });
      j += 3;
    } else { absorbed.push(raw[j]); j++; }
  }
  const steps = [];
  let i = 0;
  while (i < absorbed.length) {
    if (absorbed[i].action === MACRO_STEP.DOWN && i + 1 < absorbed.length &&
        absorbed[i + 1].action === MACRO_STEP.UP && absorbed[i].keyCode === absorbed[i + 1].keyCode &&
        absorbed[i + 1].delay <= 100) {
      steps.push({ action: MACRO_STEP.PRESS, keyCode: absorbed[i].keyCode, delay: absorbed[i].delay });
      i += 2;
    } else { steps.push(absorbed[i]); i++; }
  }
  return steps;
}

function configToActionBytes(config) {
  if (!config || config.mode === 0 || (config.mode === 1 && !config.keyCode && !config.modifier)) return null;
  function makeActionHeader(keyType, payload) {
    const data = new Uint8Array(9 + payload.length);
    data[0] = keyType;
    data[7] = payload.length & 0xFF;
    data[8] = (payload.length >> 8) & 0xFF;
    data.set(payload, 9);
    return data;
  }
  switch (config.mode) {
    case 1: {
      if (config.modifier) {
        const modCodes = [];
        for (let b = 0; b < 8; b++) if (config.modifier & (1 << b)) modCodes.push(0xE0 + b);
        const allKeys = [...modCodes, config.keyCode].filter(k => k);
        const payload = new Uint8Array(2 + allKeys.length);
        payload[0] = config.modifier;
        payload[1] = allKeys.length;
        allKeys.forEach((k, i) => { payload[2 + i] = k; });
        return makeActionHeader(KEY_TYPE.COMBO, payload);
      }
      return makeActionHeader(KEY_TYPE.SIMPLE, new Uint8Array([config.keyCode || 0]));
    }
    case 2:
      return makeActionHeader(KEY_TYPE.MOUSE, new Uint8Array([config.mouseButton || 0]));
    case 3: {
      if (!config.mediaCode) return null;
      return makeActionHeader(KEY_TYPE.MEDIA, new Uint8Array([config.mediaCode[1], config.mediaCode[2]]));
    }
    case 4: {
      const modKeys = [], regKeys = [];
      (config.multiKeys || []).forEach(k => { if (k >= 0xE0 && k <= 0xE7) modKeys.push(k); else if (k) regKeys.push(k); });
      let modMask = 0;
      modKeys.forEach(k => { modMask |= (1 << (k - 0xE0)); });
      if (config.modifier) modMask |= config.modifier;
      const allKeys = [...modKeys, ...regKeys];
      const payload = new Uint8Array(2 + allKeys.length);
      payload[0] = modMask;
      payload[1] = allKeys.length;
      allKeys.forEach((k, i) => { payload[2 + i] = k; });
      return makeActionHeader(KEY_TYPE.COMBO, payload);
    }
    case 5: {
      if (config.macroSteps?.length > 0) {
        return makeActionHeader(KEY_TYPE.MACRO, serializeMacro(config.macroSteps));
      }
      return makeActionHeader(KEY_TYPE.MACRO, new Uint8Array(0));
    }
    default: return null;
  }
}

function actionBytesToConfig(ab) {
  if (!ab || ab.length < 9) return { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
  const keyType = ab[0];
  const dataLen = ab[7] | (ab[8] << 8);
  const payload = Array.from(ab.slice(9, 9 + dataLen));
  switch (keyType) {
    case KEY_TYPE.SIMPLE:
      return { mode: 1, modifier: 0, keyCode: payload[0] || 0, mouseButton: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
    case KEY_TYPE.MEDIA:
      return { mode: 3, modifier: 0, keyCode: 0, mouseButton: 0, mediaCode: [0x04, payload[0] || 0, payload[1] || 0, 0x00], multiKeys: [], macroSteps: [] };
    case KEY_TYPE.MOUSE:
      return { mode: 2, modifier: 0, keyCode: 0, mouseButton: payload[0] || 0, mediaCode: null, multiKeys: [], macroSteps: [] };
    case KEY_TYPE.COMBO: {
      const modMask = payload[0] || 0, count = payload[1] || 0, keys = [];
      for (let i = 0; i < count && (2 + i) < payload.length; i++) keys.push(payload[2 + i]);
      const modKeys = keys.filter(k => k >= 0xE0 && k <= 0xE7);
      const regKeys = keys.filter(k => k < 0xE0 || k > 0xE7);
      if (modKeys.length > 0 && regKeys.length === 1) return { mode: 1, modifier: modMask, keyCode: regKeys[0], mouseButton: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
      if (regKeys.length > 1) return { mode: 4, modifier: modMask, keyCode: 0, mouseButton: 0, mediaCode: null, multiKeys: regKeys, macroSteps: [] };
      return { mode: 1, modifier: modMask, keyCode: regKeys[0] || 0, mouseButton: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
    }
    case KEY_TYPE.MACRO: {
      const steps = deserializeMacro(payload);
      return { mode: 5, modifier: 0, keyCode: 0, mouseButton: 0, mediaCode: null, multiKeys: [], macroSteps: steps };
    }
    default:
      return { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
  }
}

// ============================================================
// 处理器
// ============================================================
class NewProtocolHandler {
  constructor(device, debugLog = () => {}) {
    this.device = device;
    this.log = debugLog;
    this.waiters = [];
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
    // node-hid: [reportId, body0..body62] = 64字节
    if (data[0] !== REPORT_ID) { this.log(`[NEW] skip: reportId=0x${data[0].toString(16)}`); return; }
    const body = Buffer.from(data).slice(1);
    if (body.length < BODY_SIZE) { this.log(`[NEW] skip: body too short ${body.length}`); return; }
    const expected = xorChecksum(body, 62);
    if (expected !== body[62]) {
      this.log(`[NEW] checksum FAIL: calc=0x${expected.toString(16)} vs 0x${body[62].toString(16)}`);
      return;
    }
    let matched = false;
    for (let i = 0; i < this.waiters.length; i++) {
      if (this.waiters[i].match(body)) {
        clearTimeout(this.waiters[i].timer);
        const w = this.waiters.splice(i, 1)[0];
        w.resolve(body);
        matched = true;
        break;
      }
    }
    if (!matched) this.log(`[NEW] unmatched response cmd=0x${body[0].toString(16)}`);
  }

  _sendPacket(cmd, layer, keyIdx, payload) {
    return new Promise((resolve, reject) => {
      if (!this.device) return reject(new Error('未连接'));
      const body = Buffer.alloc(BODY_SIZE);
      body[0] = cmd;
      body[1] = layer;
      body[2] = keyIdx;
      body[3] = payload.length;
      if (payload.length > 0) Buffer.from(payload).copy(body, 4);
      body[62] = xorChecksum(body, 62);
      const data = Buffer.alloc(1 + BODY_SIZE);
      data[0] = REPORT_ID;
      body.copy(data, 1);
      try {
        this.device.write(Array.from(data));
        resolve();
      } catch (err) {
        this.log('[NEW] write FAILED:', err.message);
        reject(err);
      }
    });
  }

  _waitFor(matchFn, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex(w => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        this.log(`[NEW] WAITER TIMEOUT after ${timeout}ms`);
        reject(new Error('超时'));
      }, timeout);
      this.waiters.push({ match: matchFn, resolve, reject, timer });
    });
  }

  _waitForAck(layer, keyIdx, timeout = 5000) {
    return this._waitFor(b => {
      if (b[0] !== CMD.ACK && b[0] !== CMD.NAK) return false;
      if (b.length >= 4 && b[2] === layer && b[3] === keyIdx) return true;
      if (b.length >= 3 && b[1] === layer && b[2] === keyIdx) return true;
      if (b.length >= 3 && b[2] === layer) return true;
      return false;
    }, timeout);
  }

  _waitForResponse(cmd, timeout = 5000) {
    return this._waitFor(b => b[0] === cmd, timeout);
  }

  // ---- 设备信息 (0x0B, 含垃圾数据净化与重试) ----
  async readDeviceInfo() {
    let lastError = null;
    let lastGarbage = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) {
        this.log(`[NEW] 0x0B 第${attempt - 1}次异常, 等待300ms后重试...`);
        await new Promise(r => setTimeout(r, 300));
      }
      await this._sendPacket(CMD.READ_DEVICE_INFO, 0, 0, []);
      let body;
      try {
        body = await this._waitForResponse(CMD.READ_DEVICE_INFO, 3000);
      } catch (e) {
        lastError = e;
        this.log(`[NEW] 0x0B 第${attempt}次请求超时`);
        continue;
      }
      const dataLen = body[3];
      const data = body.slice(4, 4 + dataLen);
      const result = {
        keyCount: data[0],
        encoderCount: data[1],
        encoderDCount: data[2],
        layerCount: data[3],
        hardwareVersion: data[4],
        layoutId: data[5],
        backlightType: data[6],
      };
      const garbage = !result.keyCount || result.keyCount > 16 || !result.layerCount || result.layerCount > 16;
      if (!garbage) return result;
      lastGarbage = result;
      this.log(`[NEW] 0x0B 第${attempt}次返回异常数据 keyCount=${result.keyCount} layerCount=${result.layerCount}`);
    }
    if (lastGarbage) {
      this.log('[NEW] 0x0B 两次均异常, 执行数据净化...');
      if (!lastGarbage.layerCount || lastGarbage.layerCount > 16) {
        this.log(`[NEW] layerCount=${lastGarbage.layerCount} 异常, 重置为 1`);
        lastGarbage.layerCount = 1;
      }
      if (!lastGarbage.keyCount || lastGarbage.keyCount > 16) {
        this.log('[NEW] keyCount 异常, 开始动态探测实际按键数...');
        lastGarbage.keyCount = await this._probeKeyCount();
        this.log(`[NEW] 探测结果 keyCount=${lastGarbage.keyCount}`);
      }
      return lastGarbage;
    }
    throw lastError || new Error('超时');
  }

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
          this.log(`[NEW] 探测: keyIdx=${i} NAK, 实际按键数=${i}`);
          return i;
        }
        this.log(`[NEW] 探测: keyIdx=${i} 存在`);
      } catch (e) {
        this.log(`[NEW] 探测: keyIdx=${i} 超时, 实际按键数=${i}`);
        return i;
      }
    }
    return MAX_PROBE;
  }

  // 探测设备存活: 发 0x0C 等任何响应 (0x0B 超时时区分蓝牙款与异常USB款)
  async probeAlive(timeoutMs = 2000) {
    try {
      await this._sendPacket(CMD.READ_EXT_DEVICE_INFO, 0, 0, []);
      const body = await this._waitFor(b => b && b.length >= 2, timeoutMs);
      this.log(`[NEW] probeAlive 收到响应 cmd=0x${body[0].toString(16)}`);
      return true;
    } catch (e) {
      this.log('[NEW] probeAlive 超时无任何响应');
      return false;
    }
  }

  // ---- 读键 ----
  async readKey(layer, keyIdx) {
    try {
      await this._sendPacket(CMD.READ_KEY, layer, keyIdx, []);
      const body = await this._waitFor(b => {
        if (b[0] === CMD.READ_KEY && b[1] === layer && b[2] === keyIdx) return true;
        if (b[0] === CMD.READ_MACRO && b[1] === layer && b[2] === keyIdx) return true;
        if (b[0] === CMD.NAK && b[1] === layer) return true;
        return false;
      }, 3000);
      if (body[0] === CMD.NAK) {
        return { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
      }
      if (body[0] === CMD.READ_MACRO) {
        const pktIdx = body[3];
        const totalPkts = body[4];
        const pktDataLen = body[5];
        const pktData = body.slice(6, 6 + pktDataLen);
        if (totalPkts <= 1) {
          return actionBytesToConfig(pktData);
        }
        const packets = new Array(totalPkts);
        packets[pktIdx] = pktData;
        let received = 1;
        while (received < totalPkts) {
          const nextBody = await this._waitFor(b => b[0] === CMD.READ_MACRO && b[1] === layer && b[2] === keyIdx, 3000);
          packets[nextBody[3]] = nextBody.slice(6, 6 + nextBody[5]);
          received++;
        }
        const allData = new Uint8Array(packets.reduce((sum, p) => sum + (p ? p.length : 0), 0));
        let offset = 0;
        for (let p = 0; p < totalPkts; p++) {
          if (packets[p]) { allData.set(packets[p], offset); offset += packets[p].length; }
        }
        return actionBytesToConfig(allData);
      }
      if (body[0] === CMD.READ_KEY) {
        const dataLen = body[3];
        const actionBytes = body.slice(4, 4 + dataLen);
        if (dataLen >= 9 && actionBytes[0] === KEY_TYPE.MACRO) {
          await this._sendPacket(CMD.READ_MACRO, layer, keyIdx, []);
          const macroBody = await this._waitFor(b => {
            if (b[0] === CMD.READ_MACRO && b[1] === layer && b[2] === keyIdx) return true;
            if (b[0] === CMD.NAK && b[1] === layer) return true;
            return false;
          }, 3000);
          if (macroBody[0] === CMD.READ_MACRO) {
            const pktIdx = macroBody[3];
            const totalPkts = macroBody[4];
            const pktDataLen = macroBody[5];
            const pktData = macroBody.slice(6, 6 + pktDataLen);
            const wrapWithHeader = (stepData) => {
              const full = new Uint8Array(9 + stepData.length);
              full.set(actionBytes.slice(0, 9), 0);
              full[7] = stepData.length & 0xFF;
              full[8] = (stepData.length >> 8) & 0xFF;
              full.set(stepData, 9);
              return full;
            };
            if (totalPkts <= 1) {
              return actionBytesToConfig(wrapWithHeader(pktData));
            }
            const packets = new Array(totalPkts);
            packets[pktIdx] = pktData;
            let received = 1;
            let totalLen = pktDataLen;
            while (received < totalPkts) {
              const nextBody = await this._waitFor(b => b[0] === CMD.READ_MACRO && b[1] === layer && b[2] === keyIdx, 3000);
              packets[nextBody[3]] = nextBody.slice(6, 6 + nextBody[5]);
              received++;
              totalLen += nextBody[5];
            }
            const allStepData = new Uint8Array(totalLen);
            let offset = 0;
            for (let p = 0; p < totalPkts; p++) {
              if (packets[p]) { allStepData.set(packets[p], offset); offset += packets[p].length; }
            }
            return actionBytesToConfig(wrapWithHeader(allStepData));
          }
          return actionBytesToConfig(actionBytes);
        }
        return actionBytesToConfig(actionBytes);
      }
    } catch (e) {
      this.log('[NEW] readKey failed:', e.message);
    }
    return { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mediaCode: null, multiKeys: [], macroSteps: [] };
  }

  async readAllKeys(layer, totalKeys, onProgress) {
    const configs = [];
    for (let i = 0; i < totalKeys; i++) {
      const cfg = await this.readKey(layer, i);
      configs.push(cfg);
      if (onProgress) onProgress(i + 1, totalKeys);
      if (i < totalKeys - 1) await new Promise(r => setTimeout(r, 200));
    }
    return configs;
  }

  // ---- 写键 ----
  async _writeKey(layer, actionIdx, config) {
    const actionBytes = configToActionBytes(config);
    if (!actionBytes) {
      await this._sendPacket(CMD.CLEAR_KEY, layer, actionIdx, []);
      await this._waitForAck(layer, actionIdx, 5000);
      return;
    }
    await this._sendPacket(CMD.WRITE_KEY, layer, actionIdx, Array.from(actionBytes));
    await this._waitForAck(layer, actionIdx, 5000);
  }

  async _writeMacro(layer, actionIdx, macroSteps) {
    const stepData = serializeMacro(macroSteps);
    const dataLen = stepData.length;
    const actionBytes = Buffer.alloc(9 + dataLen);
    actionBytes[0] = KEY_TYPE.MACRO;
    actionBytes[7] = dataLen & 0xFF;
    actionBytes[8] = (dataLen >> 8) & 0xFF;
    Buffer.from(stepData).copy(actionBytes, 9);
    const MAX_MACRO_DATA = 56;
    const totalPkts = Math.ceil(actionBytes.length / MAX_MACRO_DATA);
    for (let pktIdx = 0; pktIdx < totalPkts; pktIdx++) {
      const start = pktIdx * MAX_MACRO_DATA;
      const end = Math.min(start + MAX_MACRO_DATA, actionBytes.length);
      const chunk = actionBytes.slice(start, end);
      const body = Buffer.alloc(BODY_SIZE);
      body[0] = CMD.WRITE_MACRO;
      body[1] = layer;
      body[2] = actionIdx;
      body[3] = pktIdx;
      body[4] = totalPkts;
      body[5] = chunk.length;
      chunk.copy(body, 6);
      body[62] = xorChecksum(body, 62);
      const data = Buffer.alloc(1 + BODY_SIZE);
      data[0] = REPORT_ID;
      body.copy(data, 1);
      this.device.write(Array.from(data));
      await this._waitForAck(layer, actionIdx, 5000);
    }
  }

  async saveAll(keyConfigs, layer = 0, onProgress) {
    const total = keyConfigs.length;
    for (let i = 0; i < total; i++) {
      const cfg = keyConfigs[i];
      if (onProgress) onProgress(i, total);
      if (!cfg || cfg.mode === 0) {
        await this._sendPacket(CMD.CLEAR_KEY, layer, i, []);
        await this._waitForAck(layer, i, 5000);
      } else if (cfg.mode === 5 && cfg.macroSteps?.length > 0) {
        await this._writeMacro(layer, i, cfg.macroSteps);
      } else {
        await this._writeKey(layer, i, cfg);
      }
      if (i < total - 1) await new Promise(r => setTimeout(r, 400));
    }
    await this._sendPacket(CMD.SAVE_LAYER, layer, 0xFF, []);
    await this._waitForAck(layer, 0xFF, 10000);
    await this._sendPacket(CMD.SET_ACTIVE_LAYER, layer, 0xFF, []);
    await this._waitForAck(layer, 0xFF, 8000);
  }

  // ---- 灯光 ----
  async readLedLayer(layer) {
    await this._sendPacket(CMD.READ_LED_LAYER, layer, 0xFE, []);
    const body = await this._waitFor(b => b[0] === CMD.READ_LED_LAYER && b[1] === layer && b[2] === 0xFE, 5000);
    const dataLen = body[3];
    const data = body.slice(4, 4 + Math.min(dataLen, 52));
    const mode = data[0] || 0;
    const sleepAllow = data[1] || 0;
    const colors = [];
    for (let i = 0; i < 16; i++) {
      const off = 4 + i * 3;
      colors.push({ r: data[off] || 0, g: data[off + 1] || 0, b: data[off + 2] || 0 });
    }
    return { mode, sleepAllow, colors };
  }

  async writeLedLayer(layer, mode, colors, sleepAllow = 1) {
    const data = new Uint8Array(52);
    data[0] = mode;
    data[1] = sleepAllow;
    data[2] = 0; data[3] = 0;
    for (let i = 0; i < 16; i++) {
      const c = colors[i] || { r: 0, g: 0, b: 0 };
      data[4 + i * 3] = c.r;
      data[5 + i * 3] = c.g;
      data[6 + i * 3] = c.b;
    }
    await this._sendPacket(CMD.WRITE_LED_LAYER, layer, 0xFE, Array.from(data));
    await this._waitForAck(layer, 0xFE, 8000);
    // 保存到 flash
    await this._sendPacket(CMD.SAVE_LAYER, layer, 0xFF, []);
    await this._waitForAck(layer, 0xFF, 10000);
  }
}

module.exports = { NewProtocolHandler, KEY_TYPE, MACRO_STEP, configToActionBytes, actionBytesToConfig };
