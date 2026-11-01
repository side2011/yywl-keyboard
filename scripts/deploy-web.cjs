// 网页部署脚本（避免再漏传路由页导致客户拿到旧包）
//
//   node scripts/deploy-web.cjs            # 部署 dist/ 到 key.itytsoft.com
//   node scripts/deploy-web.cjs --dry-run  # 只打印要传什么
//
// 背景：之前手工部署只传了 dist/index.html + static/*，但 /bt、/customize、/keytest、/mic
// 是各自目录下的 index.html（SPA 路由副本）。漏传后，客户从收藏夹直接进 /bt 会拿到
// 几天前的旧包 —— 表现为"改动没生效/灯光页没有"，刷新也没用。
// 本脚本固定按顺序上传：static → 路由页 → 一级页面 → version.json/update.json → 根 index.html（最后）。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ENV = path.join(ROOT, 'quick-config', '.env');
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  const map = {};
  if (!fs.existsSync(ENV)) return map;
  for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

const env = loadEnv();
const HOST = env.FTP_HOST;
const USER = env.FTP_USER;
const PASS = env.FTP_PASS;
if (!HOST || !USER) {
  console.error('缺少 FTP_HOST / FTP_USER（读取 quick-config/.env）');
  process.exit(1);
}
const CRED = `${USER}:${PASS}`;
const base = `ftp://${HOST}`;

function curl(args) {
  execFileSync('curl.exe', ['-s', '--max-time', '600', ...args], { stdio: 'pipe' });
}

function remoteSizes(dirUrl) {
  const out = execFileSync('curl.exe', ['-s', '--max-time', '120', `${dirUrl}/`, '--user', CRED], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const map = {};
  for (const line of out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 9) map[parts[parts.length - 1]] = Number(parts[4]);
  }
  return map;
}

function upload(localPath, remotePath, label) {
  const size = fs.statSync(localPath).size;
  if (dryRun) {
    console.log(`  [dry] ${label || remotePath} (${size} 字节)`);
    return;
  }
  curl(['-T', localPath, `${base}${remotePath}`, '--user', CRED]);
  console.log(`  ↑ ${label || remotePath} (${size} 字节)`);
}

// 1) static（只传大小不同的）
const remoteStatic = remoteSizes(`${base}/static`.replace('ftp:/', 'ftp://'));
const staticFiles = fs.readdirSync(path.join(DIST, 'static'));
let uploaded = 0;
for (const name of staticFiles) {
  const local = path.join(DIST, 'static', name);
  const size = fs.statSync(local).size;
  if (remoteStatic[name] === size) continue;
  upload(local, `/static/${name}`, `static/${name}`);
  uploaded += 1;
}
console.log(`static: 上传 ${uploaded} 个（其余 ${staticFiles.length - uploaded} 个已是最新）`);

// 2) 路由页（SPA 副本）—— 之前漏传的就是这些
const routeDirs = fs
  .readdirSync(DIST, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== 'static')
  .map((e) => e.name)
  .filter((name) => fs.existsSync(path.join(DIST, name, 'index.html')));
for (const dir of routeDirs) {
  upload(path.join(DIST, dir, 'index.html'), `/${dir}/index.html`, `${dir}/index.html`);
}

// 3) 一级页面（.html）
const topPages = fs
  .readdirSync(DIST)
  .filter((n) => n.endsWith('.html') && n !== 'index.html')
  .filter((n) => fs.statSync(path.join(DIST, n)).isFile());
for (const name of topPages) upload(path.join(DIST, name), `/${name}`, name);

// 4) 版本清单（先传数据文件，index.html 最后，避免新页面配旧数据）
for (const name of ['version.json', 'update.json']) {
  const p = path.join(DIST, name);
  if (fs.existsSync(p)) upload(p, `/${name}`, name);
}

// 5) 根 index.html 最后传
upload(path.join(DIST, 'index.html'), '/index.html', 'index.html');

console.log('\n完成。');
if (!dryRun) {
  const v = JSON.parse(fs.readFileSync(path.join(DIST, 'version.json'), 'utf8'));
  console.log(`线上应为 buildId=${v.buildId}（appVersion=${v.appVersion}）`);
  console.log('验证：curl 一下 / 与 /bt/ 的 meta yywwl-build-id 是否一致');
}
