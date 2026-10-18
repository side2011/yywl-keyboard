// ============================================================
// desktop-preload.cjs —— 扩展动作页面的桥
//
// 主窗口是 contextIsolation + sandbox, 页面拿不到 Node;
// 只有"扩展动作"这个窗口注入本 preload, 通过 contextBridge 暴露最小 API。
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yywlActions', {
  // 读取/保存动作配置
  load: () => ipcRenderer.invoke('actions:load'),
  save: (data) => ipcRenderer.invoke('actions:save', data),

  // 测试一个动作(执行步骤)
  test: (action) => ipcRenderer.invoke('actions:test', action),

  // 选择文件/文件夹
  pickFolder: () => ipcRenderer.invoke('actions:pick-folder'),
  pickFile: (kind) => ipcRenderer.invoke('actions:pick-file', kind),

  // 录制宏：录一段键盘+鼠标操作，返回步骤序列
  record: (opts) => ipcRenderer.invoke('actions:record', opts),

  // 录制鼠标位置（返回当前光标坐标）
  captureMouse: () => ipcRenderer.invoke('actions:capture-mouse'),

  // 检测候选热键是否被其它程序占用
  probe: () => ipcRenderer.invoke('actions:probe'),

  // 环境信息(平台、受支持的槽位、热键注册情况、是否需要授权)
  info: () => ipcRenderer.invoke('actions:info'),

  // 打开帮助文档
  openHelp: () => ipcRenderer.invoke('actions:open-help'),
});
