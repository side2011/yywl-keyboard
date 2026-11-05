// 打包「运行环境自检」工具为 zip 并上传到下载服务器
//   · zip 里放：运行环境自检.bat + run-env-check.bat(ASCII 别名) + yywl-env-check.ps1 + 使用说明.txt
//   · 上传两个名字：yywl-env-check-<版本>.zip（留档） + yywl-env-check.zip（稳定链接）
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'scripts', 'env-check');
const OUT_DIR = path.join(ROOT, 'release', 'env-check');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

function loadEnv() {
  const ENV = path.join(ROOT, 'quick-config', '.env');
  const map = {};
  if (!fs.existsSync(ENV)) return map;
  for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

// 1) 准备目录
fs.mkdirSync(OUT_DIR, { recursive: true });
const stage = path.join(OUT_DIR, 'stage');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

// 2) 拷文件（保留原有的 GBK/UTF8-BOM 编码，不要重新编码）
for (const f of ['运行环境自检.bat', 'yywl-env-check.ps1']) {
  fs.copyFileSync(path.join(SRC, f), path.join(stage, f));
}

// ASCII 别名，避免个别解压工具把中文文件名搞乱后双击不了
const alias = [
  '@echo off',
  'chcp 936 >nul 2>&1',
  'cd /d "%~dp0"',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yywl-env-check.ps1"',
  'if errorlevel 1 pause',
].join('\r\n');
fs.writeFileSync(path.join(stage, 'run-env-check.bat'), alias, 'latin1');

// 使用说明
const readme = `YYWL 键盘 · 运行环境自检工具（v${VERSION}）

用途：当键盘插上没反应、提示"无法识别的 USB 设备"、或网页打不开时，
      请运行本工具，它会检查系统版本、浏览器、USB 控制器、以及
      键盘是否被系统识别成"键盘"（绑定 kbdhid 驱动）。

用法：
  1. 双击「运行环境自检.bat」（或 run-env-check.bat）
  2. 等 10 秒左右，窗口里会显示检查结果
  3. 同目录会生成 yywl-环境自检-<时间>.txt
  4. 把这个 txt 文件发给技术支持

要点：
  · Windows 7 / XP 上：请务必插 USB2.0 黑色接口，蓝色 USB3.0 口常因缺驱动不识别
  · HID 键盘本身免驱，不需要安装任何驱动
  · 本工具只读取信息，不修改系统设置

编码说明（给技术同事）：
  · 运行环境自检.bat 为 GBK，yywl-env-check.ps1 为 UTF-8 with BOM
  · 若用记事本另存，请保持上述编码，否则中文会乱码或脚本报语法错误
`;
fs.writeFileSync(path.join(stage, '使用说明.txt'), readme, 'utf8');

// 3) 打 zip（用 .NET，中文名带 UTF-8 标记）
const zipVersioned = path.join(OUT_DIR, `yywl-env-check-${VERSION}.zip`);
const zipStable = path.join(OUT_DIR, 'yywl-env-check.zip');
for (const f of [zipVersioned, zipStable]) fs.rmSync(f, { force: true });
const psCmd = (zipPath) => `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
  `[System.IO.Compression.ZipFile]::CreateFromDirectory('${stage.replace(/'/g, "''")}', '${zipPath.replace(/'/g, "''")}', ` +
  `[System.IO.Compression.CompressionLevel]::Optimal, $false)`;
execFileSync('powershell', ['-NoProfile', '-Command', psCmd(zipVersioned)], { stdio: 'pipe' });
fs.copyFileSync(zipVersioned, zipStable);
console.log('已打包:');
for (const f of [zipVersioned, zipStable]) {
  console.log('  ' + path.basename(f) + '  ' + (fs.statSync(f).size / 1024).toFixed(1) + ' KB');
}

// 4) 上传
const env = loadEnv();
const { FTP_HOST: HOST, FTP_USER: USER, FTP_PASS: PASS } = env;
if (!HOST || !USER) { console.error('缺少 FTP 凭据（quick-config/.env）'); process.exit(1); }
const CRED = `${USER}:${PASS}`;
for (const f of [zipVersioned, zipStable]) {
  const name = path.basename(f);
  console.log('上传 ' + name + ' …');
  execFileSync('curl.exe', ['-sS', '--fail', '--max-time', '300', '--retry', '3', '--retry-delay', '5', '--retry-all-errors',
    '-T', f, `ftp://${HOST}/download/${name}`, '--user', CRED], { stdio: 'pipe' });
  console.log('  ✓ ' + name);
}

// 5) 校验
for (const name of [path.basename(zipVersioned), path.basename(zipStable)]) {
  const out = execFileSync('curl.exe', ['-sI', '--max-time', '60', `https://key.itytsoft.com/download/${name}`], { encoding: 'utf8' });
  const type = (out.match(/content-type:\s*(\S+)/i) || [])[1] || '?';
  const len = Number((out.match(/content-length:\s*(\d+)/i) || [])[1] || 0);
  console.log(`  ${name}: ${type}  ${(len / 1024).toFixed(1)} KB ${type.includes('html') ? '（❌ 未生效，返回的是网页）' : '✓'}`);
}
