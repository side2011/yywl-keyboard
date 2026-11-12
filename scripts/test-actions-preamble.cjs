// 验证 ps-worker / desktop-actions 的导出与兜底命令
const pathMod = require('path');
const ROOT = pathMod.resolve(__dirname, '..');
const m = require(pathMod.join(ROOT, 'ps-worker.cjs'));
const a = require(pathMod.join(ROOT, 'desktop-actions.cjs'));
const fs = require('fs');


let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

check('ps-worker 导出 ADD_TYPE_PS', typeof m.ADD_TYPE_PS === 'string' && m.ADD_TYPE_PS.length > 100);
check('ADD_TYPE_PS 含 class YywlSend', m.ADD_TYPE_PS.includes('public class YywlSend'));
check('ADD_TYPE_PS 含 mouse_event / keybd_event / SetCursorPos',
  m.ADD_TYPE_PS.includes('mouse_event') && m.ADD_TYPE_PS.includes('keybd_event') && m.ADD_TYPE_PS.includes('SetCursorPos'));
check('WORKER_PS = ADD_TYPE_PS + 循环（READY 之后才有 while）',
  m.WORKER_PS.startsWith(m.ADD_TYPE_PS) && m.WORKER_PS.includes("WriteLine('READY')"));
check('WORKER_PS 仍含 stdio 协议 QUIT/DONE', m.WORKER_PS.includes("'QUIT'") && m.WORKER_PS.includes('DONE'));

const src = fs.readFileSync(pathMod.join(ROOT, 'desktop-actions.cjs'), 'utf8');
check('desktop-actions 引入 ADD_TYPE_PS', src.includes('ADD_TYPE_PS = require(') || src.includes('({ ADD_TYPE_PS } = require('));
check('兜底路径拼上 ADD_TYPE_PS', src.includes('const fallback = ADD_TYPE_PS'));
check('兜底命令带 -ExecutionPolicy Bypass', src.includes("'-ExecutionPolicy', 'Bypass'"));
check('desktop-actions 导出 createExecutor', typeof a.createExecutor === 'function');

// 真跑：用兜底命令（Add-Type + 一次 no-op mouse_event）确认类型能解析
const { execFileSync } = require('child_process');
try {
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    m.ADD_TYPE_PS + "\n[YywlSend]::mouse_event(0, 0, 0, 0, 0); [YywlSend]::keybd_event(0, 0, 2, [IntPtr]::Zero); Write-Output 'OK'",
  ], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  check('真跑兜底命令：[YywlSend] 类型可用（不再 TypeNotFound）', out.includes('OK'), out.trim().slice(0, 120));
} catch (e) {
  const msg = (e.stderr || e.message || '').toString();
  check('真跑兜底命令：[YywlSend] 类型可用（不再 TypeNotFound）', false, msg.trim().slice(0, 200));
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
