// ============================================================
// desktop-main.cjs — 配置网页的 Electron 桌面版
//
// 原理: 内置静态服务器在本机 127.0.0.1 随机端口挂载网页目录 (SPA),
//       BrowserWindow 加载 http://127.0.0.1:PORT/ ——
//       localhost 属于安全上下文, navigator.hid (WebHID) 可直接使用,
//       BrowserRouter 的 history API 也正常工作, 无需改动网页代码
//
// 网页内容可在线更新 (见 desktop-updater.cjs):
//   优先使用 userData/web/<buildId>/ (更新下来的), 没有则用安装包自带的 dist
// ============================================================
const { app, BrowserWindow, session, shell, Menu, dialog, net } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const updater = require('./desktop-updater.cjs');

// 安装包内置的网页 (只读, 位于 app.asar 内)
const BUNDLED_DIST = path.join(__dirname, 'dist');

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
  '.sh': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

let mainWindow = null;
let localPrefix = '';
let server = null;
let webRoot = BUNDLED_DIST;   // 当前实际服务的网页目录 (可能在更新后切换)
let webBase = '';             // userData/web
let updateBase = 'https://key.itytsoft.com/';
let updateInFlight = false;
let appConfig = {};

// ---------- 配置 ----------

function loadConfig() {
  const file = path.join(app.getPath('userData'), 'config.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    return {};
  }
}

// ---------- 内置静态服务器 ----------

function createLocalServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let urlPath = new URL(req.url, 'http://127.0.0.1').pathname;
        urlPath = decodeURIComponent(urlPath);
        let rel = urlPath.replace(/^\/+/, '');
        if (!rel) rel = 'index.html';
        let filePath = path.join(webRoot, rel);
        // 路径穿越防护
        if (!filePath.startsWith(webRoot)) {
          res.writeHead(403);
          res.end();
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(webRoot, 'index.html'); // SPA 回退
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
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: 'YYWL 键盘配置工具',
    autoHideMenuBar: false,
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
    const info = updater.readVersion(webRoot) || {};
    mainWindow.webContents.setUserAgent(
      mainWindow.webContents.getUserAgent().replace(/YYWLDesktop\/[\d.]+/, 'YYWLDesktop/1.1') +
      (info.buildId ? ` YYWLWeb/${info.buildId}` : '')
    );
  } catch (e) { console.warn('setUserAgent:', e.message); }

  // 外部链接用系统浏览器打开, 不替换应用窗口
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localPrefix)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(localPrefix)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`${localPrefix}/`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function startApp() {
  createLocalServer().then((srv) => {
    server = srv;
    localPrefix = `http://127.0.0.1:${srv.address().port}`;

    const ses = session.defaultSession;
    try {
      ses.setDevicePermissionHandler((details) => details.deviceType === 'hid');
    } catch (e) { console.warn('setDevicePermissionHandler:', e.message); }

    // ⚠ Electron 无 WebHID 系统选择器, requestDevice 必须通过 select-hid-device 事件选设备
    // ⚠ 不能设置 setPermissionCheckHandler 返回 true — 会跳过设备选择导致 requestDevice 返回空数组!
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
          if (config) { chosen = entry; break; }
          if (!chosen && matches.length > 0) chosen = entry;
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

    createWindow();

    // 启动后延迟检查更新 (不阻塞界面; 离线时静默跳过)
    if (appConfig.autoUpdate !== false) {
      setTimeout(() => { checkForUpdates({ manual: false }); }, 6000);
    }
  }).catch((e) => {
    console.error('本地服务启动失败:', e);
    app.quit();
  });
}

// ---------- 更新 ----------

function friendlyVersion(info) {
  if (!info) return '未知';
  return `${info.appVersion || ''} (${info.buildId || ''})`.trim();
}

async function checkForUpdates({ manual = false } = {}) {
  if (updateInFlight) return;
  updateInFlight = true;
  try {
    if (net && typeof net.isOnline === 'function' && !net.isOnline()) {
      if (manual) {
        await dialog.showMessageBox(mainWindow, {
          type: 'info', message: '当前处于离线状态',
          detail: '这台电脑目前没有网络。内网环境可以用「文件 → 导入离线更新包」手动更新。',
          buttons: ['知道了'],
        });
      }
      return;
    }

    const local = updater.readVersion(webRoot) || {};
    const remote = await updater.checkRemote(updateBase);
    if (!remote || !remote.buildId) throw new Error('更新清单格式不正确');

    if (remote.buildId === local.buildId) {
      if (manual) {
        await dialog.showMessageBox(mainWindow, {
          type: 'info', message: '已是最新版本',
          detail: `网页版本：${friendlyVersion(local)}\n文件数：${local.fileCount || '-'}`,
          buttons: ['知道了'],
        });
      }
      return;
    }

    if (mainWindow) mainWindow.setProgressBar(0.01);
    const result = await updater.installFromUrl({
      baseUrl: updateBase,
      manifest: remote,
      webBase,
      currentDir: webRoot,
      onProgress: ({ done, total }) => {
        if (mainWindow) mainWindow.setProgressBar(Math.min(0.99, done / total));
      },
    });
    if (mainWindow) mainWindow.setProgressBar(-1);

    const detail =
      `网页版本：${friendlyVersion(local)} → ${friendlyVersion(remote)}\n` +
      `更新文件 ${result.downloaded} 个，复用本地 ${result.copied} 个（共 ${result.total} 个）\n\n` +
      '重启后生效。';
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: '发现新版本',
      detail,
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) relaunch();
  } catch (e) {
    if (mainWindow) mainWindow.setProgressBar(-1);
    console.warn('[update] 检查更新失败:', e.message);
    if (manual) {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning', message: '检查更新失败',
        detail: `${e.message}\n\n更新地址：${updateBase}\n内网环境可用「文件 → 导入离线更新包」。`,
        buttons: ['知道了'],
      });
    }
  } finally {
    updateInFlight = false;
  }
}

async function importOfflinePackage() {
  if (!mainWindow) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择离线更新包目录（里面应有 update.json）',
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths[0]) return;
  try {
    const local = updater.readVersion(webRoot) || {};
    const result = await updater.installFromDir({
      sourceDir: filePaths[0],
      webBase,
      currentDir: webRoot,
      onProgress: ({ done, total }) => {
        if (mainWindow) mainWindow.setProgressBar(Math.min(0.99, done / total));
      },
    });
    if (mainWindow) mainWindow.setProgressBar(-1);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: '离线更新包已导入',
      detail: `当前网页版本：${local.buildId || '未知'}\n导入后：${result.targetDir ? path.basename(result.targetDir) : ''}\n共 ${result.total} 个文件\n\n重启后生效。`,
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) relaunch();
  } catch (e) {
    if (mainWindow) mainWindow.setProgressBar(-1);
    dialog.showMessageBox(mainWindow, {
      type: 'error', message: '导入失败', detail: e.message, buttons: ['知道了'],
    });
  }
}

function showAbout() {
  const web = updater.readVersion(webRoot) || {};
  const lines = [
    `程序版本：${app.getVersion()}`,
    `网页版本：${friendlyVersion(web)}`,
    `网页目录：${webRoot}`,
    `更新地址：${updateBase}`,
    `离线更新：文件 → 导入离线更新包`,
  ];
  dialog.showMessageBox(mainWindow, {
    type: 'info', message: 'YYWL 键盘配置工具', detail: lines.join('\n'), buttons: ['知道了'],
  });
}

function relaunch() {
  app.relaunch();
  app.exit(0);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        { label: '导入离线更新包…', click: importOfflinePackage },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '检查更新…', click: () => checkForUpdates({ manual: true }) },
        { label: '版本信息', click: showAbout },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- 生命周期 ----------

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
    webBase = path.join(app.getPath('userData'), 'web');
    appConfig = loadConfig();
    updateBase = process.env.YYWL_UPDATE_BASE_URL || appConfig.updateBaseUrl || 'https://key.itytsoft.com/';

    // 优先用更新下来的网页, 没有则用安装包自带的
    const pointer = updater.readPointer(webBase);
    webRoot = pointer ? pointer.dir : BUNDLED_DIST;
    console.log('[web] 使用目录:', webRoot, '版本:', (updater.readVersion(webRoot) || {}).buildId || 'embedded');

    buildMenu();
    startApp();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) startApp();
    });
  });
}

app.on('window-all-closed', () => {
  if (server) { try { server.close(); } catch { /* 忽略 */ } }
  app.quit();
});
