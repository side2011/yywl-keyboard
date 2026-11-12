// 校验线上 1.4.19 Windows 包：sha256 与 manifest 一致 + 包内 app.asar 含本版修复
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const asar = require('@electron/asar');

const TMP = process.env.TEMP;
const ZIP = path.join(TMP, 'pkg-1419-win.zip');
const ASAR = path.join(TMP, 'pkg-1419-app.asar');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { timeout: 300000 }, (res) => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

(async () => {
  const manifest = JSON.parse(await new Promise((resolve, reject) => {
    https.get('https://key.itytsoft.com/download/manifest.json?t=' + Date.now(), (res) => {
      let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve(b));
    }).on('error', reject);
  }));
  const pkg = manifest.packages.find((p) => p.id === 'win-x64');
  console.log('  manifest: version=' + manifest.version + ' file=' + pkg.file + ' size=' + (pkg.size / 1048576).toFixed(1) + ' MB');
  console.log('  manifest sha256=' + pkg.sha256.slice(0, 24) + '…');

  if (!fs.existsSync(ZIP) || fs.statSync(ZIP).size !== pkg.size) {
    console.log('  下载中…');
    await download('https://key.itytsoft.com/download/' + encodeURIComponent(pkg.file), ZIP);
  }
  const buf = fs.readFileSync(ZIP);
  const sha = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
  console.log('  实际大小=' + (buf.length / 1048576).toFixed(1) + ' MB  实际 sha256=' + sha.slice(0, 24) + '…');
  console.log('  大小一致: ' + (buf.length === pkg.size) + ' | sha256 一致: ' + (sha === pkg.sha256.toUpperCase()));

  // 从 zip 里取出 resources/app.asar（不整体解压）
  const { execFileSync } = require('child_process');
  if (fs.existsSync(ASAR)) fs.unlinkSync(ASAR);
  const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
    `$z=[System.IO.Compression.ZipFile]::OpenRead('${ZIP.replace(/'/g, "''")}'); ` +
    `$e=$z.Entries | Where-Object { $_.FullName -like '*resources/app.asar' } | Select-Object -First 1; ` +
    `[System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, '${ASAR.replace(/'/g, "''")}', $true); $z.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });

  const read = (f) => asar.extractFile(ASAR, f).toString();
  const pkgJson = JSON.parse(read('package.json'));
  const main = read('desktop-main.cjs');
  const ps2 = read('ps-worker.cjs');
  const act = read('desktop-actions.cjs');
  const apply = read('desktop-update-apply.cjs');

  console.log('  包内版本: ' + pkgJson.version);
  const checks = [
    ['版本 = 1.4.19', pkgJson.version === '1.4.19'],
    ['启动写版本日志', main.includes("actionLog('程序启动 version=")],
    ['单实例提示', main.includes('第二个实例被拦下')],
    ['动作日志', main.includes('function actionLog(')],
    ['帮助菜单「打开动作日志」', main.includes('打开动作日志')],
    ['更新用 app.exit(0)', main.includes('app.exit(0)')],
    ['更新脚本模块', main.includes('updateApply.applyInBackground')],
    ['强杀+3轮重试', apply.includes('Stop-Process') && apply.includes('$k -le 3')],
    ['actions require ps-worker', act.includes("require('./ps-worker.cjs')")],
    ['兜底带 ADD_TYPE_PS', act.includes('const fallback = ADD_TYPE_PS') && ps2.includes('ADD_TYPE_PS')],
  ];
  let bad = 0;
  for (const [n, ok] of checks) { console.log('    ' + (ok ? '✓' : '✗') + ' ' + n); if (!ok) bad += 1; }
  console.log(bad ? '  ❌ 有 ' + bad + ' 项未通过' : '  ✅ 线上包校验全部通过');
  process.exit(bad ? 1 : 0);
})();
