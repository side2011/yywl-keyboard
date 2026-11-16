// 清理服务器 /download/ 里的历史安装包（配额已满导致 STOR 552）
// 保留：manifest.json、meta-*.json、yywl-env-check*.zip、最新 1.4.24 与 1.4.26 的包
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, 'quick-config', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const CRED = `${env.FTP_USER}:${env.FTP_PASS}`;
const HOST = env.FTP_HOST;
const BASE = `ftp://${HOST}/download/`;

const dryRun = !process.argv.includes('--apply');

function list() {
  const out = execFileSync('curl.exe', ['-s', '--max-time', '90', BASE, '--user', CRED], { encoding: 'utf8' });
  const files = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^[-]\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/);
    if (m) {
      // 有的 FTP 列表把时间放在名字前（如 "19:18 xxx.zip"），去掉
      const name = m[2].trim().replace(/^\d{1,2}:\d{2}\s+/, '');
      files.push({ size: Number(m[1]), name });
    }
  }
  return files;
}

const files = list();
console.log('  目录内文件: ' + files.length + ' 个，合计 ' + (files.reduce((s, f) => s + f.size, 0) / 1073741824).toFixed(2) + ' GB');

const KEEP = [/^manifest\.json$/, /^meta-.*\.json$/, /^yywl-env-check.*\.zip$/,
  /^yywlkey-config-1\.4\.24-/, /^yywlkey-config-1\.4\.26-/];

const toDelete = files.filter((f) => !KEEP.some((re) => re.test(f.name)));
const freeMb = toDelete.reduce((s, f) => s + f.size, 0) / 1048576;
console.log('  将删除: ' + toDelete.length + ' 个，释放约 ' + (freeMb / 1024).toFixed(2) + ' GB');
if (dryRun) {
  toDelete.slice(0, 10).forEach((f) => console.log('    - ' + f.name));
  console.log('    …');
  console.log('  加 --apply 才真正删除');
  process.exit(0);
}

let ok = 0;
let fail = 0;
for (const f of toDelete) {
  try {
    execFileSync('curl.exe', ['-s', '--max-time', '60', '-Q', `DELE /download/${f.name}`, BASE, '--user', CRED, '-o', process.platform === 'win32' ? 'NUL' : '/dev/null'], { stdio: 'pipe' });
    ok += 1;
    if (ok % 20 === 0) console.log('  已删除 ' + ok + '/' + toDelete.length);
  } catch (e) {
    fail += 1;
    console.log('  ! 删除失败 ' + f.name + ': ' + (e.stderr || e.message).toString().slice(0, 80));
  }
}
console.log('  完成：成功 ' + ok + '，失败 ' + fail);

const after = list();
console.log('  清理后: ' + after.length + ' 个，合计 ' + (after.reduce((s, f) => s + f.size, 0) / 1073741824).toFixed(2) + ' GB');
