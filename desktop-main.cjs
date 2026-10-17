// ============================================================
// desktop-main.js — 配置网页的 Electron 桌面版 (离线可用)
// 原理: 内置静态服务器在本机 127.0.0.1 随机端口挂载 dist (SPA),
//       BrowserWindow 加载 http://127.0.0.1:PORT/ws/ —
//       localhost 属于安全上下文, navigator.hid (WebHID) 可直接使用,
//       BrowserRouter 的 history API 也正常工作, 无需改动网页代码
// ============================================================
const { app, BrowserWindow, session, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const DIST_DIR = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.desktop': 'application/octet-stream',
  '.md': 'text/plain; charset=utf-8',
};

// 内置静态服务器: 挂载 dist 到 /ws/ 前缀 (与线上 nginx 路径一致)
function createLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = new URL(req.url, 'http://127.0.0.1').pathname;
        urlPath = decodeURIComponent(urlPath);
        if (!urlPath.startsWith('/ws/')) {
          res.writeHead(302, { Location: '/ws/' });
          res.end();
          return;
        }
        let rel = urlPath.replace(/^\/ws\//, '');
        if (!rel) rel = 'index.html';
        let filePath = path.join(DIST_DIR, rel);
        // 路径穿越防护
        if (!filePath.startsWith(DIST_DIR)) {
          res.writeHead(403);
          res.end();
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(DIST_DIR, 'index.html'); // SPA 回退
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end();
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let mainWindow = null;
let localPrefix = '';

function startApp() {
  createLocalServer().then((server) => {
    const port = server.address().port;
    localPrefix = `http://127.0.0.1:${port}`;

    const ses = session.defaultSession;
    // 设备级授权 (getDevices 等场景): HID 设备一律放行
    try {
      ses.setDevicePermissionHandler((details) => {
        if (details.deviceType === 'hid') return true;
        return false;
      });
    } catch (e) { console.warn('setDevicePermissionHandler:', e.message); }

    // ⚠ Electron 无 WebHID 系统选择器, requestDevice 必须通过 select-hid-device 事件选设备
    // ⚠ 不能设置 setPermissionCheckHandler 返回 true — 会跳过设备选择导致 requestDevice 返回空数组!
    // 自动选择 0xFF00 厂商配置接口 (对应 C# mi_03): 用 node-hid 按 序列号+VID+PID 匹配识别接口类型
    ses.on('select-hid-device', (event, details, callback) => {
      event.preventDefault();
      let chosen = null;
      try {
        const HID = require('node-hid');
        const all = HID.devices();
        for (const entry of details.deviceList || []) {
          const matches = all.filter(d =>
            d.vendorId === entry.vendorId &&
            d.productId === entry.productId &&
            (d.serialNumber || '') === (entry.serialNumber || ''));
          const config = matches.find(d => d.usagePage === 0xFF00) ||
                         matches.find(d => d.usagePage === 0xffa0);
          if (config) { chosen = entry; break; }      // 找到配置接口, 选它
          if (!chosen && matches.length > 0) chosen = entry; // 兜底: 第一个匹配的
        }
      } catch (e) { console.warn('[HID] node-hid 匹配失败:', e.message); }
      if (!chosen && details.deviceList && details.deviceList.length > 0) chosen = details.deviceList[0];
      if (chosen) {
        console.log('[HID] 自动选择设备:', chosen.name, chosen.vendorId + ':' + chosen.productId);
        callback(chosen.deviceId);
      } else {
        callback();
      }
    });

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 900,
      minHeight: 620,
      title: 'YYWL 键盘配置工具',
      autoHideMenuBar: true,
      backgroundColor: '#f8fafc',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // 给自家桌面版打 UA 标记: 前端据此豁免"应用内嵌窗口无法连接键盘"的拦截
    // (本进程已实现 select-hid-device, WebHID 在本窗口内可正常使用)
    try {
      const ua = mainWindow.webContents.getUserAgent();
      if (!/YYWLDesktop/i.test(ua)) mainWindow.webContents.setUserAgent(`${ua} YYWLDesktop/1.0`);
    } catch (e) { console.warn('setUserAgent:', e.message); }

    // 外部链接 (如蓝牙款下载页/软件下载) 用系统浏览器打开, 不替换应用窗口
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(localPrefix)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith(localPrefix)) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    mainWindow.loadURL(`${localPrefix}/ws/`);
    mainWindow.on('closed', () => { mainWindow = null; });
  }).catch((e) => {
    console.error('本地服务启动失败:', e);
    app.quit();
  });
}

// 单实例锁: 重复启动时聚焦已有窗口
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
    startApp();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) startApp();
    });
  });
}

app.on('window-all-closed', () => {
  app.quit();
});
