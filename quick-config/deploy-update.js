// ============================================================
// deploy-update.js — 快速配置软件在线更新发布脚本
// 用法: node deploy-update.js [版本说明]
//       node deploy-update.js --check      # 只检查凭据与清单, 不上传
// 流程:
//   1. 读取 package.json 版本号
//   2. 扫描 UPDATE_FILES 清单 (相对 win-unpacked 根目录)
//   3. 计算每个文件的 MD5 + 大小, 生成 version.json
//   4. 上传变更文件到 FTP /QuickConfigUpdate/ (先文件后 version.json)
// 服务器: key.itytsoft.com (keyws), nginx /ws/ 映射 FTP 根,
//         FTP 目录 QuickConfigUpdate = https://key.itytsoft.com/ws/QuickConfigUpdate/
//
// 凭据不再写死在本文件里！按以下优先级读取:
//   1) 系统环境变量 FTP_PASS (FTP_HOST / FTP_USER 可选, 有默认值)
//   2) 仓库根目录或本目录下的 .env 文件 (已被 .gitignore 忽略)
//        FTP_PASS=xxxxxxxx
//   3) 都没有 → 打印配置方法后退出
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const UNPACKED_DIR = path.join(__dirname, 'dist-electron', 'win-unpacked');
const FTP_DIR = 'QuickConfigUpdate';

// ---- .env 加载 (无第三方依赖) ----
let envFileUsed = null;
let passFromEnvFile = false;
function loadEnvFile() {
  const candidates = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) {          // 系统环境变量优先, .env 只做补位
        process.env[m[1]] = val;
        if (m[1] === 'FTP_PASS') passFromEnvFile = true;
      }
    }
    return file;
  }
  return null;
}

envFileUsed = loadEnvFile();

const FTP_HOST = process.env.FTP_HOST || 'key.itytsoft.com';
const FTP_USER = process.env.FTP_USER || 'keyws';
const FTP_PASS = process.env.FTP_PASS || '';

if (!FTP_PASS) {
  console.error('错误: 未配置 FTP 密码 (环境变量 FTP_PASS 为空, 也未找到 .env)。');
  console.error('请任选一种方式配置:');
  console.error('  A) 临时(当前终端):  $env:FTP_PASS="<密码>"');
  console.error('  B) 持久(用户级):    [Environment]::SetEnvironmentVariable("FTP_PASS","<密码>","User")');
  console.error(`  C) 文件(已 gitignore): 在 ${path.join(__dirname, '.env')} 写入一行  FTP_PASS=<密码>`);
  process.exit(1);
}

// 凭据来源, 仅用于日志 (不打印密码本身)
const passSource = passFromEnvFile
  ? `.env 文件 (${path.relative(process.cwd(), envFileUsed)})`
  : '系统/终端环境变量';

function mask(s) {
  return s.length <= 4 ? '*'.repeat(s.length) : s.slice(0, 2) + '*'.repeat(s.length - 4) + s.slice(-2);
}

// 更新清单: 相对 win-unpacked 根目录 (日常更新只含 app.asar, 业务代码几百KB)
// 若 node-hid 等原生依赖变更, 追加对应 resources/app.asar.unpacked 下文件
const UPDATE_FILES = [
  'resources/app.asar',
];

// 参数: --check 只做检查不上传; 其余非选项参数作为版本说明
const CHECK_ONLY = process.argv.includes('--check');
const description = process.argv.slice(2).filter(a => !a.startsWith('--'))[0] || '';

function md5File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(buf).digest('hex');
}

function ftpUpload(localPath, remotePath) {
  // 密码可能含特殊字符, 整段加引号
  const cmd = `curl -s -T "${localPath}" "ftp://${FTP_HOST}/${remotePath}" --user "${FTP_USER}:${FTP_PASS}" --ftp-create-dirs`;
  try {
    execSync(cmd, { timeout: 120000 });
    console.log(`  OK: ${remotePath}`);
  } catch (e) {
    console.log(`  FAIL: ${remotePath} - ${String(e.message).substring(0, 120)}`);
    process.exitCode = 1;
  }
}

// 读取版本号
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const version = pkg.version;
console.log(`版本: ${version}`);
console.log(`FTP  : ${FTP_USER}@${FTP_HOST}  密码来源: ${passSource}  (${mask(FTP_PASS)})`);
if (CHECK_ONLY) console.log('模式 : --check (只检查, 不上传)');

// 生成 version.json
const files = [];
for (const f of UPDATE_FILES) {
  const full = path.join(UNPACKED_DIR, f);
  if (!fs.existsSync(full)) {
    console.error(`错误: 文件不存在 ${full}`);
    process.exit(1);
  }
  const stat = fs.statSync(full);
  files.push({ path: f, size: stat.size, md5: md5File(full) });
  console.log(`  ${f}: ${stat.size} bytes, md5=${files[files.length - 1].md5}`);
}

const manifest = { version, description, files };
const manifestPath = path.join(UNPACKED_DIR, 'version.json');

if (CHECK_ONLY) {
  console.log(`\n检查完成: ${files.length} 个文件已就绪, 未上传任何文件。`);
  process.exit(0);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log('已生成 version.json:');
console.log(JSON.stringify(manifest, null, 2));

// 上传: 先传文件, 最后传 version.json (保证原子性)
console.log('\n上传文件到 FTP...');
for (const f of files) {
  const local = path.join(UNPACKED_DIR, f.path);
  const remote = `${FTP_DIR}/${f.path.replace(/\\/g, '/')}`;
  ftpUpload(local, remote);
}

console.log('上传 version.json...');
ftpUpload(manifestPath, `${FTP_DIR}/version.json`);

console.log('\n完成! 客户端启动后会自动检测并增量下载更新。');
