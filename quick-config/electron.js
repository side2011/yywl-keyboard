const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const HID = require('node-hid');

const { NewProtocolHandler } = require('./protocols/new-protocol');
const { BtProtocolHandler, BT_VIDS, BT_CLASSIC_PIDS } = require('./protocols/bt-protocol');
const { OldProtocolHandler, DEVICE_MODELS, PID_TO_MODEL, MODEL_NAMES, detectOldModel, getRgbModesForModel, getRgbModes2ForModel } = require('./protocols/old-protocol');

// 调试日志
const LOG_FILE = path.join(app.getPath('userData'), 'debug.log');
try { fs.writeFileSync(LOG_FILE, ''); } catch {} // 清空
function debugLog(...args) {
  const msg = `[${new Date().toISOString()}] ` + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  try { fs.appendFileSync(LOG_FILE, msg + '\n'); } catch {}
  console.log(...args);
}

// ============================================================
// 协议判定常量
// ============================================================
const NEW_VID = 0x514C;
const NEW_PIDS = [0x8850, 0x8851];

// ============================================================
// HID 连接管理 (协议调度)
// ============================================================
let mainWindow = null;
let hidDevice = null;
let devicePath = null;
let deviceInfo = null;    // 归一化设备信息 (含 protocol 字段)
let handler = null;       // 当前协议处理器 (NewProtocolHandler / BtProtocolHandler / OldProtocolHandler)
let protocol = null;      // 'new' | 'bt' | 'old'
let scanTimer = null;
let failedPaths = new Set();
let oldLedCfg = null;     // 旧协议当前灯光配置 (mode/mode2/customColor/customColor2)

// 目标设备过滤 (三套协议全部兼容)
function isTargetDevice(dev) {
  if (!dev) return false;
  const vid = dev.vendorId, pid = dev.productId;
  if (vid === NEW_VID && NEW_PIDS.includes(pid)) return true;                       // AC632N 新协议 / 蓝牙QT共用
  if (BT_VIDS.includes(vid) && BT_CLASSIC_PIDS.includes(pid)) return true;          // 蓝牙无线款经典 PID
  if (vid === 0x8808 && PID_TO_MODEL[pid]) return true;                             // CH55x 旧协议
  if (vid === 0x413D && (pid === 0x553A || pid === 0x553B)) return true;            // 旧协议 (手动选型)
  if (vid === 0x1189 && pid === 0x8834) return true;                                // 10KDZ1
  return false;
}

function findTargetDevices() {
  try {
    const devices = HID.devices();
    const matching = devices.filter(d => isTargetDevice(d) && d.usagePage !== 0x01);
    // 0x514C 设备优先选 usagePage=0xFF00 (厂商自定义), 其次 0xFFA0
    const vendor0xFF00 = matching.filter(d => d.usagePage === 0xFF00);
    if (vendor0xFF00.length > 0) return vendor0xFF00;
    const vendor0xFFA0 = matching.filter(d => d.usagePage === 0xFFA0);
    if (vendor0xFFA0.length > 0) return vendor0xFFA0;
    return matching;
  } catch {
    return [];
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// 归一化设备信息
function buildDeviceInfo(proto, info) {
  if (proto === 'new') {
    return {
      protocol: 'new',
      keyCount: info.keyCount,
      encoderCount: info.encoderCount || 0,
      layerCount: Math.min(Math.max(info.layerCount || 1, 1), 16),
      hardwareVersion: info.hardwareVersion,
      layoutId: info.layoutId,
      backlightType: info.backlightType || 0,
    };
  }
  if (proto === 'bt') {
    const isV10 = !!(info.isV10 ?? (info.version >= 10));
    const knobCount = Math.min(info.knobCount || 0, 3);
    return {
      protocol: 'bt',
      keyCount: Math.min(Math.max(info.keyCount || 1, 1), 24),
      knobCount,
      totalSlots: Math.min(Math.max(info.keyCount || 1, 1), 24) + knobCount * 3,
      version: info.version,
      subModel: info.subModel,
      isV10,
      layerCount: isV10 ? 3 : 1,   // 旧协议款(2/3/4/5键/4+1)只有1层
      backlightType: 1,
    };
  }
  if (proto === 'old') {
    const modelId = info.modelId;
    const model = modelId ? DEVICE_MODELS[modelId] : null;
    return {
      protocol: 'old',
      modelId: modelId || null,
      modelName: modelId ? (MODEL_NAMES[modelId] || modelId) : null,
      keyCount: model ? model.keyCount : 0,
      layerCount: 1,
      backlightType: model?.hasRgb ? 1 : 0,
      hasDelay: !!model?.hasDelay,
      dualZone: !!model?.dualZone,
      multiKeyOnly: !!model?.multiKeyOnly,
      needModelSelect: !modelId,
      rgbModes: modelId ? getRgbModesForModel(modelId) : [],
      rgbModes2: modelId ? getRgbModes2ForModel(modelId) : null,
    };
  }
  return info;
}

function startAutoConnect() {
  if (hidDevice) return; // 已连接
  const targets = findTargetDevices();
  const available = targets.filter(d => !failedPaths.has(d.path));
  if (available.length > 0) {
    debugLog(`[SCAN] 发现 ${available.length} 个设备`);
    connectToDevice(available[0]);
  }
}

async function connectToDevice(devInfo) {
  if (hidDevice) {
    try { hidDevice.close(); } catch {}
    hidDevice = null;
  }
  if (handler) { try { handler.destroy(); } catch {} handler = null; }
  protocol = null;
  deviceInfo = null;
  oldLedCfg = null;

  let device;
  try {
    device = new HID.HID(devInfo.path);
  } catch (err) {
    debugLog('[CONNECT] Failed to open device:', err.message);
    failedPaths.add(devInfo.path);
    sendToRenderer('hid:device-status', { status: 'error', error: err.message });
    return;
  }
  hidDevice = device;
  devicePath = devInfo.path;
  const vid = devInfo.vendorId, pid = devInfo.productId;

  // ===== 协议判定 =====
  // 1) 蓝牙经典 PID → 蓝牙 QT 协议
  if (BT_VIDS.includes(vid) && BT_CLASSIC_PIDS.includes(pid)) {
    protocol = 'bt';
    handler = new BtProtocolHandler(device, debugLog);
    try {
      const info = await handler.readDeviceInfo();
      deviceInfo = buildDeviceInfo('bt', info);
      debugLog('[CONNECT] 蓝牙无线款:', JSON.stringify(deviceInfo));
      sendToRenderer('hid:device-status', { status: 'connected', device: { path: devInfo.path, product: devInfo.product }, info: deviceInfo });
    } catch (err) {
      debugLog('[CONNECT] 蓝牙设备信息读取失败:', err.message);
      failedPaths.add(devInfo.path);
      disconnectDevice();
      sendToRenderer('hid:device-status', { status: 'error', error: err.message });
    }
    return;
  }

  // 2) 0x514C/0x8850-51 → 先试新协议 0x0B, 超时探测蓝牙 QT (严谨判定, 与配置网页一致)
  if (vid === NEW_VID && NEW_PIDS.includes(pid)) {
    const newHandler = new NewProtocolHandler(device, debugLog);
    try {
      const info = await newHandler.readDeviceInfo();
      protocol = 'new';
      handler = newHandler;
      deviceInfo = buildDeviceInfo('new', info);
      debugLog('[CONNECT] 新协议设备:', JSON.stringify(deviceInfo));
      sendToRenderer('hid:device-status', { status: 'connected', device: { path: devInfo.path, product: devInfo.product }, info: deviceInfo });
    } catch (e) {
      // 0x0B 超时 → 探测 QT 蓝牙协议 (部分 0x8850/0x8851 跑 QT 协议, 如 6+1 旋钮款)
      const isTimeout = /超时|timeout/i.test(e.message || '');
      if (isTimeout) {
        debugLog('[CONNECT] 0x0B 超时, 探测 QT 蓝牙协议...');
        const btProbe = new BtProtocolHandler(device, debugLog);
        try {
          const btInfo = await btProbe.readDeviceInfo();
          newHandler.destroy();
          protocol = 'bt';
          handler = btProbe;
          deviceInfo = buildDeviceInfo('bt', btInfo);
          debugLog('[CONNECT] 0x0B超时但QT协议有响应 → 蓝牙无线款:', JSON.stringify(deviceInfo));
          sendToRenderer('hid:device-status', { status: 'connected', device: { path: devInfo.path, product: devInfo.product }, info: deviceInfo });
        } catch (btErr) {
          debugLog('[CONNECT] QT 协议探测无响应:', btErr.message);
          btProbe.destroy();
          // 蓝牙无线款只在 PID 0x8850 上存在; 其他 PID (0x8851 4键新款) 绝不判蓝牙
          if (pid !== 0x8850) {
            newHandler.destroy();
            failedPaths.add(devInfo.path);
            disconnectDevice();
            sendToRenderer('hid:device-status', { status: 'error', error: '设备响应异常，请拔插键盘USB线后重试' });
          } else {
            // PID=0x8850: 二次确认 — USB 款异常状态仍有响应, 蓝牙款完全无响应
            const alive = await newHandler.probeAlive(2000).catch(() => false);
            newHandler.destroy();
            if (alive) {
              failedPaths.add(devInfo.path);
              disconnectDevice();
              sendToRenderer('hid:device-status', { status: 'error', error: '设备响应异常，请拔插键盘USB线后重试' });
            } else {
              failedPaths.add(devInfo.path);
              disconnectDevice();
              sendToRenderer('hid:device-status', { status: 'error', error: '检测到蓝牙无线款，请使用蓝牙无线款配置工具' });
            }
          }
        }
        return;
      }
      newHandler.destroy();
      failedPaths.add(devInfo.path);
      disconnectDevice();
      sendToRenderer('hid:device-status', { status: 'error', error: e.message });
    }
    return;
  }

  // 3) 其余 → CH55x 旧协议
  {
    protocol = 'old';
    const modelId = detectOldModel(vid, pid);
    handler = new OldProtocolHandler(device, modelId, debugLog);
    deviceInfo = buildDeviceInfo('old', { modelId });
    debugLog('[CONNECT] 旧协议设备:', JSON.stringify(deviceInfo));
    sendToRenderer('hid:device-status', { status: 'connected', device: { path: devInfo.path, product: devInfo.product }, info: deviceInfo });
  }
}

function disconnectDevice() {
  if (handler) { try { handler.destroy(); } catch {} handler = null; }
  protocol = null;
  if (hidDevice) {
    try { hidDevice.close(); } catch {}
    hidDevice = null;
  }
  devicePath = null;
  deviceInfo = null;
  oldLedCfg = null;
  failedPaths.clear();
}

// ============================================================
// IPC 处理 (按协议分发)
// ============================================================
ipcMain.handle('hid:get-status', () => {
  if (hidDevice && deviceInfo) {
    return {
      connected: true,
      device: { path: devicePath },
      info: deviceInfo,
    };
  }
  return { connected: false };
});

ipcMain.handle('hid:scan', () => {
  return findTargetDevices().map(d => ({
    path: d.path,
    product: d.product || `VID:${d.vendorId.toString(16)} PID:${d.productId.toString(16)}`,
    vendorId: d.vendorId,
    productId: d.productId,
    usagePage: d.usagePage,
  }));
});

ipcMain.handle('hid:connect', (event, devPath) => {
  const targets = findTargetDevices();
  const dev = targets.find(d => d.path === devPath);
  if (!dev) throw new Error('设备未找到');
  connectToDevice(dev);
  return { ok: true };
});

ipcMain.handle('hid:disconnect', () => {
  disconnectDevice();
  sendToRenderer('hid:device-status', { status: 'disconnected' });
  return { ok: true };
});

ipcMain.handle('hid:readDeviceInfo', async () => {
  if (!deviceInfo) throw new Error('未连接');
  if (protocol === 'new') {
    const info = await handler.readDeviceInfo();
    deviceInfo = buildDeviceInfo('new', info);
  } else if (protocol === 'bt') {
    const info = await handler.readDeviceInfo();
    deviceInfo = buildDeviceInfo('bt', info);
  }
  return deviceInfo;
});

// 旧协议: 手动选择型号 (0x413D 等无法自动识别的设备)
ipcMain.handle('hid:setOldModel', async (event, modelId) => {
  if (protocol !== 'old' || !handler) throw new Error('非旧协议设备');
  handler.modelId = modelId;
  deviceInfo = buildDeviceInfo('old', { modelId });
  sendToRenderer('hid:device-status', { status: 'connected', device: { path: devicePath }, info: deviceInfo });
  return deviceInfo;
});

// 读整层按键配置 → 通用配置数组
ipcMain.handle('hid:readAllKeys', async (event, layer, totalKeys) => {
  if (!handler) throw new Error('未连接');
  debugLog(`[READALL] === start protocol=${protocol} layer=${layer} totalKeys=${totalKeys} ===`);
  if (protocol === 'new') {
    const configs = [];
    for (let i = 0; i < totalKeys; i++) {
      const cfg = await handler.readKey(layer, i);
      configs.push(cfg);
      if (i < totalKeys - 1) await new Promise(r => setTimeout(r, 200));
    }
    return configs;
  }
  if (protocol === 'bt') {
    return handler.readLayer(layer, totalKeys);
  }
  if (protocol === 'old') {
    const collected = await handler.readConfig();
    const model = handler.model;
    const keyCount = model ? model.keyCount : (totalKeys || 0);
    const configs = [];
    for (let i = 0; i < keyCount; i++) {
      const found = collected.keyConfigs.find(k => k.keyPos === i + 1);
      configs.push(found ? found.cfg : { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: [], macroSteps: [] });
    }
    // 灯光/延时信息一起回传 (附加字段)
    configs._led = {
      rgbMode: collected.rgbMode,
      rgbMode2: collected.rgbMode2,
      customColor: collected.customColor,
      customColor2: collected.customColor2,
      delays: collected.delays,
    };
    oldLedCfg = {
      mode: collected.rgbMode ?? 0,
      mode2: collected.rgbMode2,
      customColor: collected.customColor,
      customColor2: collected.customColor2,
    };
    return configs;
  }
  throw new Error('未知协议');
});

// 保存整层 (通用配置数组) → 按协议写设备
ipcMain.handle('hid:saveAll', async (event, keyConfigs, layer = 0) => {
  if (!handler) throw new Error('未连接');
  const onProgress = (current, total) => {
    sendToRenderer('hid:progress', { current, total, label: `写入层${layer + 1} 按键 ${current + 1}/${total}` });
  };
  if (protocol === 'new') {
    await handler.saveAll(keyConfigs, layer, onProgress);
  } else if (protocol === 'bt') {
    await handler.saveAll(keyConfigs, layer, onProgress);
  } else if (protocol === 'old') {
    await handler.saveAll(keyConfigs, layer, onProgress, oldLedCfg || undefined);
  } else {
    throw new Error('未知协议');
  }
  return { ok: true };
});

// 读灯光
ipcMain.handle('hid:readLedLayer', async (event, layer) => {
  if (!handler) throw new Error('未连接');
  if (protocol === 'new') {
    return handler.readLedLayer(layer);
  }
  if (protocol === 'bt') {
    return handler.readLedLayer(layer);
  }
  if (protocol === 'old') {
    const collected = await handler.readConfig();
    return {
      protocol: 'old',
      rgbMode: collected.rgbMode,
      rgbMode2: collected.rgbMode2,
      customColor: collected.customColor,
      customColor2: collected.customColor2,
      delays: collected.delays,
    };
  }
  throw new Error('未知协议');
});

// 写灯光 (mode: 各协议模式值; colors: 16色数组(蓝牙/新协议), oldCfg: 旧协议灯光配置)
ipcMain.handle('hid:writeLedLayer', async (event, layer, mode, colors, oldCfg) => {
  if (!handler) throw new Error('未连接');
  if (protocol === 'new') {
    const current = await handler.readLedLayer(layer);
    await handler.writeLedLayer(layer, mode, colors || current.colors, current.sleepAllow);
    return { ok: true };
  }
  if (protocol === 'bt') {
    await handler.writeLedLayer(layer, mode, colors || Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0 })));
    return { ok: true };
  }
  if (protocol === 'old') {
    oldLedCfg = {
      mode: mode,
      mode2: oldCfg?.mode2,
      customColor: oldCfg?.customColor || { r: 255, g: 255, b: 255 },
      customColor2: oldCfg?.customColor2 || { r: 255, g: 255, b: 255 },
    };
    await handler.applyLed(oldLedCfg);
    return { ok: true };
  }
  throw new Error('未知协议');
});

// ============================================================
// 本地配置存储 (按型号区分)
// ============================================================
function getConfigFilePath() {
  return path.join(app.getPath('userData'), 'saved-configs.json');
}

function loadAllConfigs() {
  try {
    const filePath = getConfigFilePath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    debugLog('[CONFIG] loadAllConfigs error:', e.message);
  }
  return {};
}

function saveAllConfigsStore(data) {
  try {
    const filePath = getConfigFilePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    debugLog('[CONFIG] saveAllConfigsStore error:', e.message);
  }
}

// 根据设备信息生成型号 key (含协议前缀, 避免不同协议型号混淆)
function getModelKey(info) {
  if (!info) return 'unknown';
  if (info.protocol === 'bt') return `BT-${info.keyCount}+${info.knobCount || 0}`;
  if (info.protocol === 'old') return info.modelId || 'OLD-UNKNOWN';
  const parts = [`${info.keyCount}K`];
  if (info.encoderCount) parts.push(`E${info.encoderCount}`);
  if (info.layoutId) parts.push(`L${info.layoutId}`);
  return parts.join('-');
}

// 型号 key → 人类可读名称
function getModelName(modelKey) {
  const map = {
    '4K': '4键系列',
    '7K': '7键系列',
    '4K-E1': '4键+编码器',
    '4K-E1-L5': '4键+编码器(布局5)',
    '12K': '12键系列',
  };
  if (modelKey.startsWith('BT-')) return '蓝牙无线款 ' + modelKey.slice(3);
  if (MODEL_NAMES[modelKey]) return MODEL_NAMES[modelKey];
  return map[modelKey] || modelKey;
}

ipcMain.handle('config:list', (event, modelKey) => {
  const all = loadAllConfigs();
  if (modelKey) {
    return all[modelKey] || [];
  }
  const result = {};
  for (const [key, configs] of Object.entries(all)) {
    if (configs && configs.length > 0) {
      result[key] = configs;
    }
  }
  return result;
});

ipcMain.handle('config:save', (event, modelKey, configName, keyConfigs, layerOrOptions = 0) => {
  const all = loadAllConfigs();
  if (!all[modelKey]) all[modelKey] = [];
  let layer = 0;
  let layers = null;
  if (typeof layerOrOptions === 'object' && layerOrOptions !== null) {
    layer = layerOrOptions.layer ?? 0;
    layers = layerOrOptions.layers ?? null;
  } else {
    layer = layerOrOptions;
  }
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: configName || `配置 ${new Date().toLocaleString('zh-CN')}`,
    keyConfigs: layers?.[0] || keyConfigs,
    layers: layers || [keyConfigs],
    layer,
    savedAt: new Date().toISOString(),
  };
  all[modelKey].push(entry);
  saveAllConfigsStore(all);
  const layerInfo = layers ? `layers=${layers.length}` : `layer=${layer}`;
  debugLog(`[CONFIG] saved "${entry.name}" to ${modelKey} ${layerInfo}`);
  return entry;
});

ipcMain.handle('config:setAuto', (event, modelKey, configId, enabled) => {
  const all = loadAllConfigs();
  const list = all[modelKey] || [];
  const cfg = list.find(c => c.id === configId);
  if (!cfg) throw new Error('配置不存在');
  cfg.autoDownload = !!enabled;
  if (enabled) {
    list.forEach(c => { if (c.id !== configId) c.autoDownload = false; });
  }
  saveAllConfigsStore(all);
  debugLog(`[CONFIG] setAuto "${cfg.name}" @${modelKey} = ${!!enabled}`);
  return all[modelKey];
});

ipcMain.handle('config:delete', (event, modelKey, configId) => {
  const all = loadAllConfigs();
  if (all[modelKey]) {
    all[modelKey] = all[modelKey].filter(c => c.id !== configId);
    if (all[modelKey].length === 0) delete all[modelKey];
    saveAllConfigsStore(all);
    debugLog(`[CONFIG] deleted ${configId} from ${modelKey}`);
  }
  return { ok: true };
});

ipcMain.handle('config:rename', (event, modelKey, configId, newName) => {
  const all = loadAllConfigs();
  if (all[modelKey]) {
    const cfg = all[modelKey].find(c => c.id === configId);
    if (cfg) {
      cfg.name = newName;
      saveAllConfigsStore(all);
    }
  }
  return { ok: true };
});

// ============================================================
// 在线更新 (服务器 QuickConfigUpdate 目录, 增量下载变更文件)
// ============================================================
const UPDATE_BASE_URL = 'https://key.itytsoft.com/ws/QuickConfigUpdate/';
const crypto = require('crypto');
const https = require('https');
const { execFile } = require('child_process');

function semverCompare(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function httpsGetJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('响应解析失败')); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('请求超时')); });
    req.on('error', reject);
  });
}

function httpsDownload(url, destPath) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' ' + url));
      }
      const tmp = destPath + '.part';
      const ws = fs.createWriteStream(tmp);
      res.pipe(ws);
      ws.on('finish', () => {
        ws.close();
        fs.renameSync(tmp, destPath);
        resolve();
      });
      ws.on('error', (e) => { try { fs.unlinkSync(tmp); } catch {} reject(e); });
    });
    req.on('timeout', () => { req.destroy(new Error('下载超时')); });
    req.on('error', reject);
  });
}

function md5File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(buf).digest('hex');
}

async function checkForUpdates() {
  try {
    const url = UPDATE_BASE_URL + 'version.json?t=' + Date.now();
    const manifest = await httpsGetJson(url);
    const localVersion = app.getVersion();
    debugLog('[UPDATE] 本地版本:', localVersion, '服务器版本:', manifest.version);
    if (semverCompare(manifest.version, localVersion) > 0) {
      return { hasUpdate: true, version: manifest.version, description: manifest.description || '', files: manifest.files || [] };
    }
    return { hasUpdate: false, version: manifest.version };
  } catch (e) {
    debugLog('[UPDATE] 检查更新失败:', e.message);
    return { hasUpdate: false, error: e.message };
  }
}

async function downloadAndApplyUpdate(manifest, onProgress) {
  const updDir = path.join(app.getPath('userData'), 'updates', String(manifest.version));
  fs.mkdirSync(updDir, { recursive: true });

  const files = manifest.files || [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const rel = String(f.path).replace(/\//g, path.sep);
    const dest = path.join(updDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    debugLog('[UPDATE] 下载:', f.path);
    await httpsDownload(UPDATE_BASE_URL + String(f.path).replace(/\\/g, '/'), dest);
    const actual = md5File(dest);
    if (actual.toLowerCase() !== String(f.md5).toLowerCase()) {
      throw new Error(`文件校验失败: ${f.path} (期望 ${f.md5} 实际 ${actual})`);
    }
    if (onProgress) onProgress({ current: i + 1, total: files.length, file: f.path });
  }

  const appDir = path.dirname(process.execPath);
  const batPath = path.join(updDir, 'apply-update.bat');
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    'echo 正在应用更新，请稍候...',
    ':waitloop',
    `tasklist /FI "PID eq ${process.pid}" | find "${process.pid}" >nul`,
    'if %ERRORLEVEL%==0 ( timeout /t 1 /nobreak >nul & goto waitloop )',
  ];
  for (const f of files) {
    const rel = String(f.path).replace(/\//g, '\\');
    lines.push(`copy /Y "${path.join(updDir, rel)}" "${path.join(appDir, rel)}" >nul`);
    lines.push(`if errorlevel 1 ( echo 复制失败: ${rel} & pause )`);
  }
  lines.push(`rmdir /S /Q "${updDir}"`);
  lines.push(`start "" "${process.execPath}"`);
  lines.push('exit');
  fs.writeFileSync(batPath, lines.join('\r\n'));

  debugLog('[UPDATE] 文件下载校验完成, 启动替换脚本并退出');
  const child = execFile('cmd.exe', ['/c', 'start', '', 'cmd.exe', '/c', batPath],
    { detached: true, windowsHide: true, cwd: updDir },
    (err) => { if (err) debugLog('[UPDATE] 启动脚本失败:', err.message); });
  child.unref();
  setTimeout(() => app.quit(), 800);
  return { ok: true };
}

ipcMain.handle('update:getVersion', () => app.getVersion());
ipcMain.handle('update:check', () => checkForUpdates());
ipcMain.handle('update:apply', async (event, manifest) => {
  try {
    await downloadAndApplyUpdate(manifest, (p) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:progress', p);
      }
    });
    return { ok: true };
  } catch (e) {
    debugLog('[UPDATE] 应用更新失败:', e.message);
    return { ok: false, error: e.message };
  }
});

// ============================================================
// 窗口创建
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: 'YYWL 快速配置工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================
// 应用生命周期
// ============================================================
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    setTimeout(async () => {
      const res = await checkForUpdates();
      if (res.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:available', {
          version: res.version,
          description: res.description,
          files: res.files,
        });
      }
    }, 3000);

    scanTimer = setInterval(() => {
      if (!hidDevice) {
        startAutoConnect();
      }
    }, 2000);

    startAutoConnect();
  });
}

app.on('window-all-closed', () => {
  if (scanTimer) clearInterval(scanTimer);
  disconnectDevice();
  app.quit();
});

app.on('before-quit', () => {
  if (scanTimer) clearInterval(scanTimer);
  disconnectDevice();
});
