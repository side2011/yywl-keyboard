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
const { app, BrowserWindow, session, shell, Menu, dialog, net, globalShortcut, clipboard, nativeImage, ipcMain, Tray, Notification } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const updater = require('./desktop-updater.cjs');
const { createExecutor } = require('./desktop-actions.cjs');

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

        // 给配置页读的「扩展动作摘要」：设备侧只存键码，
        // 区分"普通 F13"和"扩展触发键 F13"只能靠桌面版这份配置
        if (urlPath === '/__actions/summary') {
          const payload = {
            enabled: actionsConfig.enabled,
            slots: (actionsConfig.actions || []).map((a) => ({
              slot: a.slot,
              hotkey: slotHotkey(a.slot, a),
              name: a.name || '',
              steps: (a.steps || []).length,
            })),
          };
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(payload));
          return;
        }

        // 配置页里的「配置扩展动作」按钮：让主进程打开扩展动作窗口
        if (urlPath === '/__actions/open') {
          try { openActionsWindow(); } catch (e) { console.warn('[action] 打开窗口失败:', e.message); }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
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

  // 第一次"关窗口 → 缩到托盘"时提醒一句，否则用户会以为程序没关掉
  mainWindow.on('close', () => {
    if (app.isQuitting || !tray || trayHintShown) return;
    trayHintShown = true;
    const title = 'YYWL 键盘配置工具';
    const content = '程序已最小化到托盘，仍在后台运行。右键托盘图标可以退出。';
    try {
      if (process.platform === 'win32') tray.displayBalloon({ title, content });
      else new Notification({ title, body: content }).show();
    } catch { /* 通知不可用就算了 */ }
  });
}

function startApp() {
  // 已经起过服务（例如从托盘重新打开窗口）就复用，避免重复监听端口
  if (server && localPrefix) {
    if (!mainWindow) createWindow();
    else { mainWindow.show(); mainWindow.focus(); }
    return;
  }
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
        { label: '扩展动作…', click: openActionsWindow },
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

// ---------- 扩展动作（键盘只发 HID 码，扩展能力靠这里监听保留热键实现）----------

const ACTION_FILE_NAME = 'actions.json';
const ACTION_SLOTS = 24;
let actionsWindow = null;
let actionsConfig = { version: 1, enabled: true, actions: [] };
let tray = null;
let trayHintShown = false;
let executor = null;
const registeredShortcuts = [];

function actionsFile() {
  return path.join(app.getPath('userData'), ACTION_FILE_NAME);
}

function loadActions() {
  try {
    const data = JSON.parse(fs.readFileSync(actionsFile(), 'utf8'));
    if (data && Array.isArray(data.actions)) {
      actionsConfig = { version: 1, enabled: data.enabled !== false, actions: data.actions };
    }
  } catch {
    // 首次运行没有文件很正常
  }
  console.log('[action] 已加载动作:', actionsConfig.actions.length, '启用:', actionsConfig.enabled);
}

function saveActions(data) {
  actionsConfig = {
    version: 1,
    enabled: data.enabled !== false,
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
  fs.mkdirSync(path.dirname(actionsFile()), { recursive: true });
  fs.writeFileSync(actionsFile(), JSON.stringify(actionsConfig, null, 2));
  registerHotkeys();
  // 第一次配置动作时把托盘建起来，这样关窗口后还能继续响应热键
  const hasActions = actionsConfig.enabled && actionsConfig.actions.some((a) => (a.steps || []).length);
  if (hasActions && !tray) setupTray();
  return { ok: true, registered: registeredShortcuts.slice(), conflicts: hotkeyConflicts.slice() };
}

// 槽位 → 默认热键：1-12 = F13..F24；13-24 = Ctrl+Alt+Shift+F1..F12
// 允许动作自带 hotkey 覆盖（热键被占用时用户可换一个冷门组合）
function slotHotkey(slot, act) {
  if (act && typeof act.hotkey === 'string' && act.hotkey.trim()) return act.hotkey.trim();
  if (slot >= 1 && slot <= 12) return `F${slot + 12}`;
  if (slot >= 13 && slot <= 24) return `Control+Alt+Shift+F${slot - 12}`;
  return null;
}

// 可选热键清单：优先"没人用"的组合，占用率高的一律不放前面
const HOTKEY_CANDIDATES = (() => {
  const list = [];
  for (let i = 13; i <= 24; i++) list.push(`F${i}`);
  for (let i = 1; i <= 12; i++) list.push(`Control+Alt+Shift+F${i}`);
  for (let i = 0; i <= 9; i++) list.push(`Control+Alt+Shift+${i}`);
  for (const ch of 'QWERTYUIOPASDFGHJKLZXCVBNM') list.push(`Control+Alt+Shift+${ch}`);
  for (let i = 1; i <= 12; i++) list.push(`Control+Shift+F${i}`);
  return list;
})();

let hotkeyConflicts = [];

function registerHotkeys() {
  for (const acc of registeredShortcuts) {
    try { globalShortcut.unregister(acc); } catch { /* 忽略 */ }
  }
  registeredShortcuts.length = 0;
  hotkeyConflicts = [];
  if (!actionsConfig.enabled) return;

  for (const act of actionsConfig.actions) {
    const acc = slotHotkey(act.slot, act);
    if (!acc || act.enabled === false || !(act.steps || []).length) continue;
    try {
      const ok = globalShortcut.register(acc, () => {
        executor.runAction(act)
          .then((r) => { if (!r.ok) console.warn('[action] 执行失败:', act.name || act.slot, r.error); })
          .catch((e) => console.warn('[action] 执行异常:', e.message));
      });
      if (ok) registeredShortcuts.push(acc);
      else {
        // 被别的程序占了：记下来，交由界面提示用户换一个
        hotkeyConflicts.push({ slot: act.slot, hotkey: acc, name: act.name || '' });
        console.warn('[action] 热键被占用:', acc);
      }
    } catch (e) {
      hotkeyConflicts.push({ slot: act.slot, hotkey: acc, name: act.name || '', error: e.message });
      console.warn('[action] 注册失败:', acc, e.message);
    }
  }
  console.log('[action] 已注册热键:', registeredShortcuts.join(', ') || '(无)');
  if (hotkeyConflicts.length) console.warn('[action] 冲突:', JSON.stringify(hotkeyConflicts));
}

// 探测某个组合是否可用：尝试注册再立刻注销（不会长期占用）
function probeHotkey(acc) {
  try {
    if (globalShortcut.isRegistered(acc)) return { hotkey: acc, available: true, note: '本程序已占用' };
    const ok = globalShortcut.register(acc, () => {});
    if (ok) { globalShortcut.unregister(acc); return { hotkey: acc, available: true }; }
    return { hotkey: acc, available: false };
  } catch (e) {
    return { hotkey: acc, available: false, error: e.message };
  }
}

function setupActionsIpc() {
  executor = createExecutor({ clipboard, nativeImage, shell });

  ipcMain.handle('actions:load', () => actionsConfig);
  ipcMain.handle('actions:save', (_e, data) => saveActions(data || {}));
  ipcMain.handle('actions:test', async (_e, action) => {
    // 窗口失焦后动作作用在用户当前的窗口上，所以测试时先把编辑窗口最小化
    try { if (actionsWindow) actionsWindow.minimize(); } catch { /* 忽略 */ }
    await new Promise((r) => setTimeout(r, 400));
    const result = await executor.runAction(action || {});
    setTimeout(() => { try { if (actionsWindow) actionsWindow.restore(); } catch { /* 忽略 */ } }, 300);
    return result;
  });
  ipcMain.handle('actions:pick-folder', async () => {
    const r = await dialog.showOpenDialog(actionsWindow || mainWindow || undefined, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('actions:pick-file', async (_e, kind) => {
    const filters = kind === 'image'
      ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }]
      : [];
    const r = await dialog.showOpenDialog(actionsWindow || mainWindow || undefined, { properties: ['openFile'], filters });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('actions:info', () => ({
    platform: process.platform,
    registered: registeredShortcuts.slice(),
    enabled: actionsConfig.enabled,
    slots: ACTION_SLOTS,
    hotkeys: Array.from({ length: ACTION_SLOTS }, (_, i) => slotHotkey(i + 1)),
    conflicts: hotkeyConflicts.slice(),
    candidates: HOTKEY_CANDIDATES.slice(),
    file: actionsFile(),
  }));

  // 逐个探测候选热键是否可用（用完即注销，不会长期占用）
  ipcMain.handle('actions:probe', () => (HOTKEY_CANDIDATES.slice(0, 60).map(probeHotkey)));

  // 录制鼠标位置：读当前光标坐标填进 mouseClick 步骤
  ipcMain.handle('actions:capture-mouse', async () => {
    try { return { ok: true, ...(await executor.getMousePosition()) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('actions:open-help', () => {
    shell.openExternal(`${updateBase}tutorial.html`);
  });
}

function openActionsWindow() {
  if (actionsWindow) {
    if (actionsWindow.isMinimized()) actionsWindow.restore();
    actionsWindow.focus();
    return;
  }
  actionsWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: '扩展动作 · YYWL 键盘配置工具',
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'desktop-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  actionsWindow.loadURL(`${localPrefix}/actions.html`);
  actionsWindow.on('closed', () => { actionsWindow = null; });

  // 页面里有"未保存修改"时浏览器会阻止关闭（beforeunload），
  // Electron 不会自动弹框 → 表现成"窗口关不掉"。这里补一个确认框。
  actionsWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(actionsWindow, {
      type: 'question',
      buttons: ['放弃修改并关闭', '取消'],
      defaultId: 1,
      cancelId: 1,
      message: '有未保存的修改',
      detail: '关闭后这次的改动会丢失，确定要关闭吗？',
    });
    if (choice === 0) event.preventDefault(); // 允许关闭
  });
}

function setupTray() {
  try {
    const iconPath = path.join(webRoot, 'favicon-32.png');
    const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip('YYWL 键盘配置工具（扩展动作运行中）');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开配置工具', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else startApp(); } },
      { label: '扩展动作…', click: openActionsWindow },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  } catch (e) {
    console.warn('托盘创建失败:', e.message);
  }
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

    loadActions();
    setupActionsIpc();
    buildMenu();
    startApp();

    // 托盘无条件创建：这样无论有没有配动作，关窗口都是"最小化到托盘"，
    // 不会出现"关了就彻底没了、也找不到后台"的情况（用户反馈过）
    setupTray();
    // 有动作就顺带把热键注册上
    registerHotkeys();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) startApp();
    });
  });
}

// 从托盘菜单退出时才真正结束进程
app.on('before-quit', () => {
  app.isQuitting = true;
  try { if (server) server.close(); } catch { /* 忽略 */ }
});

app.on('window-all-closed', () => {
  // 有托盘就留在后台（继续响应热键），只有明确"退出"才真的结束
  if (!app.isQuitting && tray) return;
  if (server) { try { server.close(); } catch { /* 忽略 */ } }
  app.quit();
});
