// 打包「快速配置」绿色版（免安装 zip）并上传
//   · 先 electron-builder --win dir 产出 win-unpacked
//   · 精简 locales（只留中文/英文），减小体积
//   · 打 zip：yywl-quick-config-<版本>-win-x64-portable.zip + 稳定名 yywl-quick-config-portable.zip
//   · 上传到 /download/ 并校验
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const QC = path.join(ROOT, 'quick-config');
const PKG = JSON.parse(fs.readFileSync(path.join(QC, 'package.json'), 'utf8'));
const VERSION = PKG.version;
const UNPACKED = path.join(QC, 'dist-electron', 'win-unpacked');
const OUT_DIR = path.join(QC, 'dist-electron');

function loadEnv() {
  const ENV = path.join(QC, '.env');
  const map = {};
  if (!fs.existsSync(ENV)) return map;
  for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

// 1) 确保有 win-unpacked（没有就构建）
if (!fs.existsSync(path.join(UNPACKED, 'YYWL快速配置.exe'))) {
  console.log('未找到 win-unpacked，开始构建…');
  execFileSync('node', [path.join(QC, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'),
    '--win', 'dir', '--config.win.signAndEditExecutable=false'], { cwd: QC, stdio: 'inherit' });
}

// 2) 精简 locales
const localesDir = path.join(UNPACKED, 'locales');
if (fs.existsSync(localesDir)) {
  const keep = new Set(['zh-CN.pak', 'zh-TW.pak', 'en-US.pak', 'en-GB.pak']);
  let removed = 0;
  for (const f of fs.readdirSync(localesDir)) {
    if (!keep.has(f)) { fs.rmSync(path.join(localesDir, f), { force: true }); removed += 1; }
  }
  console.log('精简 locales：删除 ' + removed + ' 个，保留 ' + fs.readdirSync(localesDir).join(', '));
}

// 3) 写一份"绿色版使用说明"
const readme = `YYWL 快速配置 · 绿色版 v${VERSION}（免安装）

用法：
  1. 把整个文件夹解压到任意位置（建议 D:\\YYWL快速配置，路径不要有中文以外的特殊符号）
  2. 双击 YYWL快速配置.exe 即可运行，不需要安装、不需要管理员权限
  3. 卸载：直接删掉整个文件夹

说明：
  · 绿色版不会自动更新（在线更新只对安装版生效）。有新版本请重新下载本 zip 覆盖。
  · 首次启动 Windows 可能提示"已保护你的电脑"，点「更多信息」→「仍要运行」。
  · 若连接不到键盘：确认键盘是 USB 有线款/蓝牙款对应型号，并插 USB2.0 口。
`;
fs.writeFileSync(path.join(UNPACKED, '绿色版使用说明.txt'), readme, 'utf8');

// 3.5) 组装 zip 目录：用 rename 把 win-unpacked 临时改成中文名（同盘瞬时完成，不复制大文件）
const stageRoot = path.join(OUT_DIR, 'stage-green');
const stageDir = path.join(stageRoot, 'YYWL快速配置-绿色版');
fs.rmSync(stageRoot, { recursive: true, force: true });
fs.mkdirSync(stageRoot, { recursive: true });
fs.renameSync(UNPACKED, stageDir);
const restoreUnpacked = () => {
  try { if (fs.existsSync(stageDir)) { fs.rmSync(UNPACKED, { recursive: true, force: true }); fs.renameSync(stageDir, UNPACKED); } } catch (err) { console.log('还原 win-unpacked 失败: ' + err.message); }
};
process.on('exit', restoreUnpacked);
console.log('已组装 zip 目录: YYWL快速配置-绿色版（rename）');

// 4) 打 zip（.NET，UTF-8 文件名）
const zipVersioned = path.join(OUT_DIR, `yywl-quick-config-${VERSION}-win-x64-portable.zip`);
const zipStable = path.join(OUT_DIR, 'yywl-quick-config-portable.zip');
for (const f of [zipVersioned, zipStable]) fs.rmSync(f, { force: true });
const ps = (zip) => `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
  `[System.IO.Compression.ZipFile]::CreateFromDirectory('${stageRoot.replace(/'/g, "''")}', '${zip.replace(/'/g, "''")}', ` +
  `[System.IO.Compression.CompressionLevel]::Optimal, $false)`;
execFileSync('powershell', ['-NoProfile', '-Command', ps(zipVersioned)], { stdio: 'pipe' });
fs.copyFileSync(zipVersioned, zipStable);
restoreUnpacked();
fs.rmSync(stageRoot, { recursive: true, force: true });
console.log('已打包:');
for (const f of [zipVersioned, zipStable]) {
  console.log('  ' + path.basename(f) + '  ' + (fs.statSync(f).size / 1048576).toFixed(1) + ' MB');
}

// 5) 只做本地打包 —— 这是内部工具，不要上传到公网下载服务器
console.log('');
console.log('本地文件（不上传服务器）：');
console.log('  ' + path.relative(ROOT, zipVersioned));
console.log('  ' + path.relative(ROOT, zipStable));
console.log('');
console.log('如需手动上传（确认后再执行）：');
console.log('  curl -T "<zip路径>" ftp://<FTP_HOST>/download/<文件名> --user <FTP_USER>:<FTP_PASS>');
