// 本地构建 arm64 .deb（不依赖 fpm / Linux）
// 背景：CI 到国内服务器的 FTP 约 1.6MB/分钟且频繁中断，GitHub 产物下载也只有 0.06MB/s，
//      而本机到服务器 7.3MB/s。所以用本机已打好的 linux-arm64-unpacked 手工封 deb。
//
// deb 结构：ar 容器 + debian-binary + control.tar.gz + data.tar.gz
// 布局对齐 electron-builder 的 fpm 参数（见 CI 日志）：
//   /opt/YYWL键盘配置工具/        应用本体
//   /usr/share/applications/yywl-config.desktop
//   /usr/share/icons/hicolor/1024x1024/apps/yywl-config.png
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = process.cwd();
const VERSION = require(path.join(ROOT, 'package.json')).version;
const SRC = path.join(ROOT, 'dist-desktop-arm64', 'linux-arm64-unpacked');
const OUT = path.join(ROOT, 'release', `yywlkey-config-${VERSION}-domestic-arm64.deb`);
const APP_DIR_NAME = 'YYWL键盘配置工具';

// ---------- tar 写入（ustar）----------
function tarHeader({ name, size, mode, type, mtime = Math.floor(Date.now() / 1000) }) {
  const buf = Buffer.alloc(512, 0);
  const writeStr = (str, off, len) => {
    const b = Buffer.from(str, 'utf8');
    b.copy(buf, off, 0, Math.min(b.length, len));
  };
  let nameBytes = Buffer.byteLength(name, 'utf8');
  let prefix = '';
  if (nameBytes > 100) {
    // 拆到 prefix（最多 155 字节）
    const parts = name.split('/');
    let rest = name;
    while (Buffer.byteLength(rest, 'utf8') > 100 && parts.length > 1) {
      parts.shift();
      prefix = prefix ? prefix + '/' + rest : rest; // 简化：逐级退
      rest = parts.join('/');
      prefix = name.slice(0, name.length - rest.length - 1);
    }
    name = rest;
    nameBytes = Buffer.byteLength(name, 'utf8');
    if (nameBytes > 100 || Buffer.byteLength(prefix, 'utf8') > 155) throw new Error('路径过长: ' + name);
  }
  writeStr(name, 0, 100);
  writeStr(mode.toString(8).padStart(7, '0') + '\0', 100, 8);
  writeStr('0000000\0', 108, 8); // uid
  writeStr('0000000\0', 116, 8); // gid
  writeStr(size.toString(8).padStart(11, '0') + '\0', 124, 12);
  writeStr(mtime.toString(8).padStart(11, '0') + '\0', 136, 12);
  writeStr('        ', 148, 8); // checksum 占位（8 空格）
  writeStr(type, 156, 1);
  writeStr('ustar\0', 257, 6);
  writeStr('00', 263, 2);
  writeStr('root', 265, 32);
  writeStr('root', 297, 32);
  if (prefix) writeStr(prefix, 345, 155);

  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += buf[i];
  writeStr(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return buf;
}

function pad512(n) { return (512 - (n % 512)) % 512; }

function* walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      yield { rel, type: 'dir', full };
      yield* walk(full, rel);
    } else if (e.isFile()) {
      yield { rel, type: 'file', full };
    }
  }
}

const EXECUTABLES = new Set(['yywl-config', 'chrome-sandbox', 'chrome_crashpad_handler']);

function buildDataTar() {
  const chunks = [];
  const add = (b) => chunks.push(b);
  const addEntry = (rel, full, type, mode) => {
    const size = type === 'file' ? fs.statSync(full).size : 0;
    add(tarHeader({ name: './' + rel, size, mode, type: type === 'dir' ? '5' : '0' }));
    if (type === 'file') {
      const data = fs.readFileSync(full);
      add(data);
      const pad = pad512(size);
      if (pad) add(Buffer.alloc(pad, 0));
    }
  };

  // 1) 应用目录（显式带上 /opt，避免 dpkg 不建父目录）
  addEntry('opt', null, 'dir', 0o755);
  addEntry(`opt/${APP_DIR_NAME}`, SRC, 'dir', 0o755);
  for (const it of walk(SRC, `opt/${APP_DIR_NAME}`)) {
    if (it.type === 'dir') addEntry(it.rel, it.full, 'dir', 0o755);
    else {
      const isExec = EXECUTABLES.has(path.basename(it.rel));
      const mode = path.basename(it.rel) === 'chrome-sandbox' ? 0o4755 : (isExec ? 0o755 : 0o644);
      addEntry(it.rel, it.full, 'file', mode);
    }
  }

  // 2) 图标
  const icon = path.join(ROOT, 'build', 'icon.png');
  addEntry('usr', null, 'dir', 0o755);
  addEntry('usr/share', null, 'dir', 0o755);
  addEntry('usr/share/icons', null, 'dir', 0o755);
  addEntry('usr/share/icons/hicolor', null, 'dir', 0o755);
  addEntry('usr/share/icons/hicolor/1024x1024', null, 'dir', 0o755);
  addEntry('usr/share/icons/hicolor/1024x1024/apps', null, 'dir', 0o755);
  addEntry('usr/share/icons/hicolor/1024x1024/apps/yywl-config.png', icon, 'file', 0o644);

  // 3) 桌面入口
  addEntry('usr/share/applications', null, 'dir', 0o755);
  const desktop = [
    '[Desktop Entry]',
    'Name=YYWL 键盘配置工具',
    'Comment=多功能小键盘配置工具',
    `Exec="/opt/${APP_DIR_NAME}/yywl-config" %U`,
    'Terminal=false',
    'Type=Application',
    'Icon=yywl-config',
    `StartupWMClass=${APP_DIR_NAME}`,
    'Categories=Utility;',
    '',
  ].join('\n');
  const tmpDesktop = path.join(process.env.TEMP, 'yywl-config.desktop');
  fs.writeFileSync(tmpDesktop, desktop, 'utf8');
  addEntry('usr/share/applications/yywl-config.desktop', tmpDesktop, 'file', 0o644);

  add(Buffer.alloc(1024, 0)); // 结尾两个空块
  return zlib.gzipSync(Buffer.concat(chunks), { level: 6 });
}

function buildControlTar() {
  const chunks = [];
  const add = (b) => chunks.push(b);
  const tmp = (name, content, mode) => {
    const p = path.join(process.env.TEMP, 'deb-' + name);
    fs.writeFileSync(p, content, 'utf8');
    const data = fs.readFileSync(p);
    add(tarHeader({ name: './' + name, size: data.length, mode, type: '0' }));
    add(data);
    const pad = pad512(data.length);
    if (pad) add(Buffer.alloc(pad, 0));
  };
  const lf = (s) => s.replace(/\r\n/g, '\n');

  const installedKb = Math.round(
    [...walkDirSize(SRC)] / 1024,
  );
  function* walkDirSize(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) yield* walkDirSize(full);
      else if (f.isFile()) yield fs.statSync(full).size;
    }
  }

  const control = [
    'Package: yywl-keyboard-app',
    `Version: ${VERSION}`,
    'Section: default',
    'Priority: optional',
    'Architecture: arm64',
    'Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0',
    'Recommends: libappindicator3-1',
    `Installed-Size: ${installedKb}`,
    'Maintainer: YYWL <1291285148@qq.com>',
    'Homepage: https://key.itytsoft.com',
    'Description: YYWL 多功能小键盘配置工具（网页版 / Electron 桌面版）',
    ' 支持老协议 USB / 蓝牙 / 新协议 2.0 三种键盘的按键、宏、灯光配置。',
    '',
  ].join('\n');
  tmp('control', control, 0o644);
  tmp('postinst', lf(fs.readFileSync(path.join(ROOT, 'build', 'linux', 'after-install.sh'), 'utf8')), 0o755);
  tmp('postrm', lf(fs.readFileSync(path.join(ROOT, 'build', 'linux', 'after-remove.sh'), 'utf8')), 0o755);
  add(Buffer.alloc(1024, 0));
  return zlib.gzipSync(Buffer.concat(chunks), { level: 9 });
}

// ---------- ar 容器 ----------
function arMember(name, data) {
  const hdr = Buffer.alloc(60, 0x20);
  const put = (s, off) => Buffer.from(s, 'utf8').copy(hdr, off);
  put(name + '/', 0);
  put(String(Math.floor(Date.now() / 1000)), 16);
  put('0', 28);
  put('0', 34);
  put('100644', 40);
  put(String(data.length), 48);
  hdr.write('`\n', 58, 'binary');
  const parts = [hdr, data];
  if (data.length % 2 === 1) parts.push(Buffer.from('\n'));
  return Buffer.concat(parts);
}

function main() {
  if (!fs.existsSync(SRC)) throw new Error('找不到 ' + SRC + '（先跑一次 electron-builder --linux dir --arm64）');
  console.log('  源目录: ' + SRC);
  const dataTar = buildDataTar();
  console.log('  data.tar.gz: ' + (dataTar.length / 1048576).toFixed(1) + ' MB');
  const controlTar = buildControlTar();
  console.log('  control.tar.gz: ' + (controlTar.length / 1024).toFixed(1) + ' KB');

  const deb = Buffer.concat([
    Buffer.from('!<arch>\n'),
    arMember('debian-binary', Buffer.from('2.0\n')),
    arMember('control.tar.gz', controlTar),
    arMember('data.tar.gz', dataTar),
  ]);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, deb);
  console.log('  已生成: ' + OUT + '  ' + (deb.length / 1048576).toFixed(1) + ' MB');
}

main();
