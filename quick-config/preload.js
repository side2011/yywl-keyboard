const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickConfig', {
  // 状态查询
  getStatus: () => ipcRenderer.invoke('hid:get-status'),
  scan: () => ipcRenderer.invoke('hid:scan'),

  // 连接控制
  connect: (devPath) => ipcRenderer.invoke('hid:connect', devPath),
  disconnect: () => ipcRenderer.invoke('hid:disconnect'),

  // 数据操作
  readDeviceInfo: () => ipcRenderer.invoke('hid:readDeviceInfo'),
  readAllKeys: (layer, totalKeys) => ipcRenderer.invoke('hid:readAllKeys', layer, totalKeys),
  saveAll: (keyConfigs, layer = 0) => ipcRenderer.invoke('hid:saveAll', keyConfigs, layer),

  // 旧协议: 手动选择型号 (0x413D 等无法自动识别的设备)
  setOldModel: (modelId) => ipcRenderer.invoke('hid:setOldModel', modelId),

  // LED 灯光 (各协议: mode=协议模式值; colors=16色数组; oldCfg=旧协议灯光配置)
  readLedLayer: (layer) => ipcRenderer.invoke('hid:readLedLayer', layer),
  writeLedLayer: (layer, mode, colors, oldCfg) => ipcRenderer.invoke('hid:writeLedLayer', layer, mode, colors, oldCfg),

  // 本地配置列表
  listConfigs: (modelKey) => ipcRenderer.invoke('config:list', modelKey),
  saveConfig: (modelKey, name, keyConfigs, layerOrOptions = 0) => ipcRenderer.invoke('config:save', modelKey, name, keyConfigs, layerOrOptions),
  deleteConfig: (modelKey, configId) => ipcRenderer.invoke('config:delete', modelKey, configId),
  renameConfig: (modelKey, configId, newName) => ipcRenderer.invoke('config:rename', modelKey, configId, newName),
  setConfigAuto: (modelKey, configId, enabled) => ipcRenderer.invoke('config:setAuto', modelKey, configId, enabled),

  // 事件监听
  onDeviceStatus: (callback) => {
    ipcRenderer.on('hid:device-status', (event, data) => callback(data));
  },
  onProgress: (callback) => {
    ipcRenderer.on('hid:progress', (event, data) => callback(data));
  },

  // 在线更新
  getVersion: () => ipcRenderer.invoke('update:getVersion'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  applyUpdate: (manifest) => ipcRenderer.invoke('update:apply', manifest),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update:available', (event, data) => callback(data));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update:progress', (event, data) => callback(data));
  },
});
