// desktop 里更新进度窗口用的 preload：只暴露"取消"这一个能力
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updCancel', () => {
  ipcRenderer.send('update:cancel');
});
