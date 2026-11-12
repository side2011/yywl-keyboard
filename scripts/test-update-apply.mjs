// 回归测试：原地更新脚本（真跑一遍 robocopy 覆盖 + 日志）
// 覆盖点：
//   · 旧进程不存在时立即开跑（pid=0，不会误杀自己）
//   · robocopy 把新文件覆盖到目标目录（含子目录、含同名文件）
//   · 复制成功后才"启动新版"（测试模式跳过启动）
//   · 日志里能看到 robocopy 退出码与目标 exe 信息
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildApplyScript, applyInBackground } = require(resolve('desktop-update-apply.cjs'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 1) 脚本内容检查
const sample = buildApplyScript({
  newRoot: 'C:\\new', targetDir: 'C:\\target', exeName: 'YYWL键盘配置工具.exe',
  logPath: 'C:\\temp\\log.txt', pid: 1234, versionText: '1.4.16', scriptPath: 'C:\\temp\\a.ps1',
  waitLoops: 2,
});
check('脚本含等待旧进程退出', sample.includes('Get-Process -Id 1234'));
check('脚本含超时强杀', sample.includes('Stop-Process -Id 1234 -Force'));
check('脚本含 robocopy 重试 3 轮', sample.includes('for ($k=1; $k -le 3; $k++)'));
check('robocopy 失败阈值 <8 才算成功', sample.includes('if ($rc -lt 8) { $ok = $true; break }'));
check('复制后校验 exe 存在', sample.includes("Test-Path -LiteralPath $exe"));
check('启动时带工作目录', sample.includes('-WorkingDirectory'));

// 2) 真跑：准备 新旧两个目录
const root = mkdtempSync(join(tmpdir(), 'yywl-upd-'));
const newRoot = join(root, 'new');
const targetDir = join(root, 'target');
mkdirSync(join(newRoot, 'resources'), { recursive: true });
mkdirSync(join(targetDir, 'resources'), { recursive: true });
writeFileSync(join(newRoot, 'app.txt'), 'NEW-CONTENT');
writeFileSync(join(newRoot, 'resources', 'app.asar'), 'NEW-ASAR');
writeFileSync(join(newRoot, 'YYWLtest.bat'), '@echo off\r\necho ran > "%~dp0launched.txt"\r\n');
writeFileSync(join(targetDir, 'app.txt'), 'OLD-CONTENT');
writeFileSync(join(targetDir, 'resources', 'app.asar'), 'OLD-ASAR');
writeFileSync(join(targetDir, 'YYWLtest.bat'), '@echo off\r\n');

const logPath = join(root, 'apply.log');
const scriptPath = join(root, 'apply.ps1');
const ps = buildApplyScript({
  newRoot, targetDir, exeName: 'YYWLtest.bat', logPath, pid: 0,
  versionText: 'test', scriptPath, waitLoops: 1, launch: false,
});
writeFileSync(scriptPath, '\ufeff' + ps, 'utf8');

const { execFileSync } = await import('node:child_process');
try {
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { stdio: 'pipe', timeout: 120000 });
  check('更新脚本执行完成（无异常退出）', true);
} catch (e) {
  check('更新脚本执行完成（无异常退出）', false, (e.stderr || e.message).toString().slice(0, 200));
}

check('顶层文件被覆盖（NEW-CONTENT）', readFileSync(join(targetDir, 'app.txt'), 'utf8') === 'NEW-CONTENT',
  readFileSync(join(targetDir, 'app.txt'), 'utf8'));
check('子目录文件被覆盖（NEW-ASAR）', readFileSync(join(targetDir, 'resources', 'app.asar'), 'utf8') === 'NEW-ASAR',
  readFileSync(join(targetDir, 'resources', 'app.asar'), 'utf8'));

const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
check('日志记录了 robocopy 退出码', /robocopy 第1轮退出码: \d/.test(log), log.split('\n').slice(0, 3).join(' | '));
check('日志记录了目标 exe 信息', log.includes('目标 exe:') && log.includes('大小='));
check('日志有结束标记', log.includes('=== 结束 ==='));

// 3) 幂等：newRoot 应被清理
check('临时新版本目录已清理', !existsSync(newRoot));

rmSync(root, { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
