// 用内联兜底实测一次：模拟 ps-worker 缺失（ADD_TYPE_PS=null），兜底命令是否含 Add-Type 并能跑通
const { execFileSync } = require('child_process');
const fs = require('fs');

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + n); }
  else { fail += 1; console.log('  ✗ ' + n + (extra ? '  → ' + extra : '')); }
};

// 从源码里抓出 INLINE_ADD_TYPE_PS 的定义并求值（模拟 ps-worker 缺失场景）
const src = fs.readFileSync('desktop-actions.cjs', 'utf8');
const m = src.match(/const INLINE_ADD_TYPE_PS = \[[\s\S]*?\]\.join\('\\n'\);/);
check('源码里有 INLINE_ADD_TYPE_PS 定义', !!m);
if (!m) process.exit(1);
const INLINE = eval(m[0].replace('const INLINE_ADD_TYPE_PS = ', '') .replace(/;$/, ''));
check('内联定义含 class YywlSend', INLINE.includes('public class YywlSend'));
check('内联定义含 mouse_event/keybd_event', INLINE.includes('mouse_event') && INLINE.includes('keybd_event'));
check('内联定义有幂等保护（-as [type]）', INLINE.includes("-as [type]"));

// 真跑：内联 Add-Type + 一次 no-op mouse_event
try {
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    INLINE + "\n[YywlSend]::mouse_event(0, 0, 0, 0, 0); [YywlSend]::keybd_event(0, 0, 2, [IntPtr]::Zero); Write-Output 'OK'",
  ], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  check('内联兜底真跑通过（[YywlSend] 可用）', out.includes('OK'), out.trim().slice(0, 100));
} catch (e) {
  check('内联兜底真跑通过（[YywlSend] 可用）', false, (e.stderr || e.message).toString().slice(0, 200));
}

// 兜底拼接已改用 preamble
check('兜底拼接使用 preamble', src.includes('const preamble = ADD_TYPE_PS || INLINE_ADD_TYPE_PS;'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
