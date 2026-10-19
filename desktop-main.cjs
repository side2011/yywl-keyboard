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
const { execFile, spawn } = require('child_process');
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

// ---------- 更新进度窗口（下载安装包时挡住主界面）----------
let updWin = null;
let updCancelled = false;

function updCall(js) {
  try {
    if (updWin && !updWin.isDestroyed()) updWin.webContents.executeJavaScript(js, true).catch(() => {});
  } catch { /* 忽略 */ }
}

function updSet(data) {
  updCall(`window.updSet && window.updSet(${JSON.stringify(data)})`);
}

function openUpdWindow(versionText) {
  try {
    if (updWin && !updWin.isDestroyed()) { updWin.focus(); return; }
    updCancelled = false;
    updWin = new BrowserWindow({
      width: 460,
      height: 210,
      parent: mainWindow || undefined,
      modal: true,
      frame: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      title: `正在更新 ${versionText || ''}`.trim(),
      webPreferences: { preload: path.join(__dirname, 'update-progress-preload.cjs'), sandbox: false },
    });
    updWin.setMenuBarVisibility(false);
    updWin.loadURL(`${localPrefix}/update-progress.html`);
    // 下载期间主界面不响应，避免用户一边更新一边操作
    try { if (mainWindow) mainWindow.setEnabled(false); } catch { /* 忽略 */ }
  } catch (e) {
    console.warn('[update] 打开进度窗口失败:', e.message);
    updWin = null;
  }
}

function closeUpdWindow() {
  try {
    if (updWin && !updWin.isDestroyed()) updWin.destroy();
  } catch { /* 忽略 */ }
  updWin = null;
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setEnabled(true); } catch { /* 忽略 */ }
}

// ---------- 程序自身更新（安装包级别）----------
// 网页内容能热更新，但主进程/Electron 本身换不了 —— 那些新功能（宏录制、托盘、
// 窗口关闭保护）都在安装包里。这里做"下载 → 解压 → 启动新版"，
// 让用户点一次就能升级，不用自己找下载页。

function platformPackageId() {
  if (process.platform === 'win32') return 'win-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  return 'linux-x64-domestic';
}

let activeDownloadReq = null;

function abortDownload() {
  try { if (activeDownloadReq) activeDownloadReq.abort(); } catch { /* 忽略 */ }
  activeDownloadReq = null;
}

function downloadTo(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const req = net.request(url);
    activeDownloadReq = req;
    req.on('response', (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const total = Number(res.headers['content-length'] || 0);
      let got = 0;
      const ws = fs.createWriteStream(destPath);
      res.on('data', (chunk) => { got += chunk.length; if (onProgress) onProgress(got, total); });
      res.on('end', () => ws.end());
      res.pipe(ws);
      ws.on('finish', () => { activeDownloadReq = null; resolve({ bytes: got, total }); });
      ws.on('error', (e) => { activeDownloadReq = null; reject(e); });
    });
    req.on('error', (e) => { activeDownloadReq = null; reject(e); });
    req.end();
  });
}

function extractPackage(archive, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const isWin = process.platform === 'win32';
  const file = isWin ? 'powershell' : 'unzip';
  const args = isWin
    ? ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath "${archive}" -DestinationPath "${outDir}" -Force`]
    : ['-q', '-o', archive, '-d', outDir];
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 300000 }, (err, _o, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).slice(0, 300)));
      else resolve();
    });
  });
}

// 在解压目录里找可执行文件（绿色版是 <产品名>/xxx.exe）
function findLauncher(dir) {
  const queue = [{ p: dir, d: 0 }];
  let seen = 0;
  while (queue.length && seen < 3000) {
    seen += 1;
    const { p: cur, d } = queue.shift();
    if (d > 4) continue;
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (process.platform === 'darwin' && e.name.endsWith('.app')) return full;
        queue.push({ p: full, d: d + 1 });
        continue;
      }
      if (process.platform === 'win32' && /\.exe$/i.test(e.name) && !/unins/i.test(e.name)) return full;
      if (process.platform === 'linux' && /^(yywl|YYWL)/.test(e.name)) {
        try { fs.chmodSync(full, 0o755); } catch { /* 忽略 */ }
        return full;
      }
    }
  }
  return '';
}

async function checkPackageUpdate({ manual = false } = {}) {
  let manifest;
  try {
    manifest = await updater.fetchJson(`${updateBase}download/manifest.json?t=${Date.now()}`, 15000);
  } catch (e) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning', message: '检查程序更新失败',
        detail: `${e.message}\n\n更新地址：${updateBase}`, buttons: ['知道了'],
      });
    }
    return;
  }
  const latest = manifest && manifest.version;
  const current = app.getVersion();
  if (!latest) return;

  if (compareVersions(latest, current) <= 0) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'info', message: '已是最新版本', detail: `当前版本：${current}`, buttons: ['知道了'],
      });
    }
    return;
  }

  const wantId = platformPackageId();
  const pkg = (manifest.packages || []).find((p) => p.id === wantId && p.available);
  if (!pkg) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'info', message: `发现新版本 ${latest}`,
        detail: `当前版本：${current}\n这个平台暂时没有可下载的安装包，请到下载页手动下载：\n${updateBase}download.html`,
        buttons: ['打开下载页', '取消'], defaultId: 0, cancelId: 1,
      }).then(({ response }) => { if (response === 0) shell.openExternal(`${updateBase}download.html`); });
    }
    return;
  }

  const sizeMb = Math.round((pkg.size || 0) / 1048576);
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    message: `发现新版本 ${latest}`,
    detail: `当前版本：${current}\n新版本：${latest}（约 ${sizeMb} MB）\n\n`
      + '这是程序本身的更新。宏录制、托盘、窗口关闭保护这些都在安装包里，\n'
      + '光更新网页是拿不到的。\n\n'
      + '点「下载并安装」会自动下载、解压并启动新版本，配置和动作都会保留。',
    buttons: ['下载并安装', '稍后'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;

  const dir = path.join(app.getPath('temp'), `yywl-update-${latest}`);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* 忽略 */ }
  const file = path.join(dir, pkg.file);

  // 下载全程挡住主界面，只留进度窗口
  openUpdWindow(latest);
  updSet({ title: `正在下载 ${latest}`, text: '下载期间请不要关闭程序，完成后会自动启动新版本。', percent: 0, size: '' });
  let lastPct = -1;
  try {
    await downloadTo(`${updateBase}download/${encodeURIComponent(pkg.file)}`, file, (got, total) => {
      const pct = total ? (got / total) * 100 : 0;
      if (mainWindow) mainWindow.setProgressBar(Math.min(0.98, pct / 100));
      if (pct - lastPct >= 1) {
        lastPct = pct;
        const mb = (n) => (n / 1048576).toFixed(1);
        updSet({
          percent: pct,
          size: total ? `${mb(got)} / ${mb(total)} MB` : `${mb(got)} MB`,
        });
      }
      if (updCancelled) throw new Error('已取消下载');
    });
  } catch (e) {
    if (mainWindow) mainWindow.setProgressBar(-1);
    closeUpdWindow();
    dialog.showMessageBox(mainWindow, {
      type: updCancelled ? 'info' : 'error',
      message: updCancelled ? '已取消更新' : '下载失败',
      detail: updCancelled ? '随时可以再点「帮助 → 检查更新…」重试。' : `${e.message}\n\n可以到 ${updateBase}download.html 手动下载。`,
      buttons: ['知道了'],
    });
    return;
  }
  if (mainWindow) mainWindow.setProgressBar(-1);

  // 解压
  updSet({ title: '正在安装', text: '正在解压新版本文件，请稍候…', percent: 99, size: '' });
  const out = path.join(dir, 'app');
  try {
    try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* 忽略 */ }
    await extractPackage(file, out);
  } catch (e) {
    closeUpdWindow();
    shell.showItemInFolder(file);
    dialog.showMessageBox(mainWindow, {
      type: 'warning', message: '已下载，但自动解压失败',
      detail: `${e.message}\n\n安装包已保存：${file}\n请手动解压后运行。`, buttons: ['知道了'],
    });
    return;
  }

  const launcher = findLauncher(out);
  if (!launcher) {
    closeUpdWindow();
    shell.openPath(out);
    dialog.showMessageBox(mainWindow, {
      type: 'info', message: '下载完成', detail: `已解压到：\n${out}\n\n请手动运行其中的程序。`, buttons: ['知道了'],
    });
    return;
  }

  // 成功：直接启动新版本并退出当前进程
  updSet({ title: '正在启动新版本', text: '即将自动切换到新版本，配置和动作都会保留…', percent: 100, size: '', done: true });
  try {
    const child = spawn(launcher, [], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) {
    closeUpdWindow();
    shell.showItemInFolder(launcher);
    dialog.showMessageBox(mainWindow, {
      type: 'warning', message: '新版本已就绪，但自动启动失败',
      detail: `${e.message}\n\n请手动运行：\n${launcher}`, buttons: ['知道了'],
    });
    return;
  }
  // 给新进程一点时间起来，再退出当前实例（单实例锁会让旧进程先退）
  setTimeout(() => {
    try { closeUpdWindow(); } catch { /* 忽略 */ }
    app.isQuitting = true;
    app.quit();
  }, 1200);
}
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
  // 任何"新窗口"请求都交给系统浏览器（包括本地说明页），不要顶掉应用界面
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
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
      setTimeout(() => { checkAllUpdates({ manual: false }); }, 6000);
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

// 统一的更新入口：先看程序本体（安装包）有没有新版，没有再看网页内容。
// 菜单里只留一个「检查更新…」，避免客户面对两个相似的菜单项。
async function checkAllUpdates({ manual = false } = {}) {
  if (updateInFlight) return;

  // 1) 程序本体：读下载页清单里的版本号
  let pkgManifest = null;
  try {
    pkgManifest = await updater.fetchJson(`${updateBase}download/manifest.json?t=${Date.now()}`, 15000);
  } catch (e) {
    pkgManifest = null;
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning', message: '检查更新失败',
        detail: `读不到版本清单：${e.message}\n\n更新地址：${updateBase}`, buttons: ['知道了'],
      });
      return;
    }
  }

  const latestPkg = pkgManifest && pkgManifest.version;
  const current = app.getVersion();
  if (latestPkg && compareVersions(latestPkg, current) > 0) {
    if (manual) {
      // 有新程序版本 → 走"下载并安装"
      await checkPackageUpdate({ manual: true });
      return;
    }
    // 自动检查时不打扰：托盘气泡提示一下，网页内容继续检查
    try {
      if (tray && process.platform === 'win32') {
        tray.displayBalloon({ title: `发现新版本 ${latestPkg}`, content: '右键托盘 → 检查更新 即可升级' });
      }
    } catch { /* 忽略 */ }
  }

  // 2) 网页内容（程序已是最新或用户选了稍后）
  await checkForUpdates({ manual });
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
          detail: `程序版本：${app.getVersion()}\n网页版本：${friendlyVersion(local)}\n文件数：${local.fileCount || '-'}`,
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
  const appVer = app.getVersion();
  const webVer = web.appVersion || '';
  const build = web.buildId || '';
  // 只给用户看"一个版本号"：取程序版本与网页版本里较高的那个（网页通常是热更新后最新的）。
  // 两者不一致时不要并排显示两个数字（客户会懵），改成一句可执行的提示。
  const shown = compareVersions(webVer, appVer) > 0 ? webVer : appVer;
  const lines = [`版本：${shown}${build ? `（构建 ${build}）` : ''}`];
  if (webVer && compareVersions(appVer, webVer) < 0) {
    lines.push('');
    lines.push(`⚠ 安装包为 ${appVer}，宏录制等新功能需要重新安装一次`);
    lines.push(`  下载地址：${updateBase}download.html`);
  }
  lines.push('');
  lines.push(`网页目录：${webRoot}`);
  lines.push(`更新地址：${updateBase}`);
  lines.push(`离线更新：文件 → 导入离线更新包`);
  dialog.showMessageBox(mainWindow, {
    type: 'info', message: 'YYWL 键盘配置工具', detail: lines.join('\n'), buttons: ['知道了'],
  });
}

// 比较 x.y.z（缺位按 0 处理）；返回 1 / -1 / 0
function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
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
        { label: '检查更新…', click: () => checkAllUpdates({ manual: true }) },
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
    appVersion: app.getVersion(),
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

  // 开机自启动：扩展动作窗口里的开关
  // 更新进度窗口里的「取消更新」
  ipcMain.on('update:cancel', () => {
    updCancelled = true;
    abortDownload();
  });

  ipcMain.handle('autostart:get', () => isAutoStartEnabled());
  ipcMain.handle('autostart:set', (_e, enabled) => setAutoStart(!!enabled));

  // ---------- 录制 HUD（屏幕上的录制提示框）----------
  // 窗口最小化后用户「看不到在录」，所以在屏幕角落挂一个置顶小窗，
  // 实时显示倒计时和「按了什么」，跟网页版宏录制那种感觉类似。
  let recHud = null;

  function createRecHud(seconds) {
    destroyRecHud();
    try {
      const { screen } = require('electron');
      const area = screen.getPrimaryDisplay().workArea;
      const w = 300;
      const h = 190;
      recHud = new BrowserWindow({
        width: w,
        height: h,
        x: area.x + area.width - w - 24,
        y: area.y + 24,
        frame: false,
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: false,
        hasShadow: false,
        webPreferences: { sandbox: true, contextIsolation: true },
      });
      recHud.setAlwaysOnTop(true, 'screen-saver');
      recHud.setIgnoreMouseEvents(true, { forward: true });
      recHud.loadURL(`${localPrefix}/rec-hud.html`);
      recHud.webContents.on('did-finish-load', () => hudCall(`window.hudStart && window.hudStart(${seconds})`));
    } catch (e) {
      console.warn('[hud] 创建录制提示框失败:', e.message);
      recHud = null;
    }
  }

  function hudCall(js) {
    try {
      if (!recHud || recHud.isDestroyed()) return;
      recHud.webContents.executeJavaScript(js, true).catch(() => { /* 忽略 */ });
    } catch { /* 忽略 */ }
  }

  function destroyRecHud() {
    try {
      if (recHud && !recHud.isDestroyed()) recHud.destroy();
    } catch { /* 忽略 */ }
    recHud = null;
  }
  // 宏录制：录制期间把扩展动作窗口最小化，录完还原
  ipcMain.handle('actions:record', async (_e, opts = {}) => {
    if (process.platform !== 'win32') {
      return { ok: false, error: '宏录制目前只支持 Windows' };
    }
    const durationMs = Math.min(Math.max(Number(opts.durationMs) || 15000, 2000), 60000);
    const win = actionsWindow;
    // 窗口一最小化用户就「看不到在录」了，用托盘气泡提示一下
    try {
      if (tray && process.platform === 'win32') {
        tray.displayBalloon({ title: '正在录制操作', content: '按 F10 可提前结束，最长 15 秒' });
      }
    } catch { /* 忽略 */ }
    try { if (win) win.minimize(); } catch { /* 忽略 */ }
    await new Promise((r) => setTimeout(r, 800)); // 等窗口让开，别把点击录到自己身上
    const includeMouse = opts.mouse !== false;
    const includeKeyboard = opts.keyboard !== false;
    createRecHud(Math.round(durationMs / 1000));
    try {
      const events = await executor.record(durationMs, {
        onEvent: (ev) => {
          if (!ev.down) return;
          const label = executor.vkLabel(ev.vk);
          if (!label) return;
          const isMouse = [1, 2, 4].includes(ev.vk);
          if (isMouse && !includeMouse) return;
          if (!isMouse && !includeKeyboard) return;
          const text = isMouse ? `${label} (${ev.x}, ${ev.y})` : label;
          hudCall(`window.hudEvent && window.hudEvent(${JSON.stringify(isMouse ? 'mouse' : 'key')}, ${JSON.stringify(text)})`);
        },
      });
      const steps = executor.eventsToSteps(events, { includeMouse, includeKeyboard, mode: opts.mode === 'hold' ? 'hold' : 'tap' });
      return { ok: true, steps, events: events.length };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      destroyRecHud();
      try { if (win) { win.restore(); win.focus(); } } catch { /* 忽略 */ }
    }
  });

  // 录制鼠标位置：读当前光标坐标填进 mouseClick 步骤
  ipcMain.handle('actions:capture-mouse', async () => {
    try { return { ok: true, ...(await executor.getMousePosition()) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('actions:open-help', () => {
    // 优先打开本地那份说明（离线可用）；本地服务还没起时才退回线上地址
    const local = localPrefix ? `${localPrefix}/actions-guide.html` : '';
    shell.openExternal(local || `${updateBase}actions-guide.html`);
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
    trayMenu = Menu.buildFromTemplate([
      { label: '打开配置工具', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else startApp(); } },
      { label: '扩展动作…', click: openActionsWindow },
      { type: 'separator' },
      {
        id: 'autostart',
        label: '开机自动启动',
        type: 'checkbox',
        checked: isAutoStartEnabled(),
        click: (item) => { setAutoStart(item.checked); },
      },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(trayMenu);
    tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  } catch (e) {
    console.warn('托盘创建失败:', e.message);
  }
}

// ---------- 开机自启动 ----------
// Windows / macOS 用系统登录项；Linux 写 ~/.config/autostart 的 .desktop
let trayMenu = null;

function autostartFile() {
  return path.join(app.getPath('home'), '.config', 'autostart', 'yywl-keyboard-config.desktop');
}

function isAutoStartEnabled() {
  try {
    if (process.platform === 'linux') return fs.existsSync(autostartFile());
    return !!app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

function setAutoStart(enabled) {
  try {
    if (process.platform === 'linux') {
      const file = autostartFile();
      if (enabled) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, [
          '[Desktop Entry]',
          'Type=Application',
          'Name=YYWL 键盘配置工具',
          `Exec="${process.execPath}"`,
          'X-GNOME-Autostart-enabled=true',
          'Terminal=false',
          '',
        ].join('\n'), 'utf8');
      } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } else {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        path: process.execPath,
        args: app.isPackaged ? [] : [__dirname],
        name: 'YYWL键盘配置工具',
      });
    }
  } catch (e) {
    console.warn('[autostart] 设置失败:', e.message);
  }
  const now = isAutoStartEnabled();
  // 托盘菜单里的勾选状态跟着变
  try {
    const item = trayMenu && trayMenu.getMenuItemById('autostart');
    if (item) item.checked = now;
  } catch { /* 忽略 */ }
  // 通知扩展动作窗口（如果开着）
  try {
    if (actionsWindow && !actionsWindow.isDestroyed()) {
      actionsWindow.webContents.send('autostart:changed', now);
    }
  } catch { /* 忽略 */ }
  return now;
}

// ---------- 生命周期 ----------

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // 用户关窗口后程序会缩在托盘里。这时再双击图标启动，应该把已有的窗口唤出来，
  // 而不是"什么都不发生"（客户会以为程序打不开）。
  app.on('second-instance', () => {
    try {
      if (!mainWindow) {
        // 窗口已经被关掉了（只剩托盘）→ 重新创建窗口；本地服务还在就直接复用
        startApp();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      try {
        new Notification({
          title: 'YYWL 键盘配置工具',
          body: '程序一直在后台运行，已为你打开窗口',
        }).show();
      } catch { /* 通知不可用就只弹窗口 */ }
    } catch (e) {
      console.warn('[second-instance] 唤起窗口失败:', e.message);
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
