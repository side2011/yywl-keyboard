// 回归测试：扩展动作 keyTap 不能再报 "PowerShellWorker is not defined"
// 用法: node scripts/test-actions-keytap.cjs
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 1) 源码层面：desktop-actions 必须显式 require ps-worker，并且在未加载时安全降级
const src = fs.readFileSync('desktop-actions.cjs', 'utf8');
check('显式 require ./ps-worker.cjs', src.includes("require('./ps-worker.cjs')"));
check('未加载时置 null（不抛异常）', src.includes('let PowerShellWorker = null;'));
check('getPsWorker 有 !PowerShellWorker 兜底', src.includes('if (!PowerShellWorker) return null;'));
check('仍有单次 spawn 兜底路径（且带上 Add-Type 类型定义）', src.includes("run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', fallback])") && src.includes('const fallback = ADD_TYPE_PS'));

// 2) 模块层面：ps-worker 能正常导出类
const { PowerShellWorker } = require(path.resolve('ps-worker.cjs'));
check('ps-worker.cjs 导出 PowerShellWorker 类', typeof PowerShellWorker === 'function');

// 3) 执行器层面：dryRun 跑一遍 keyTap，验证不再抛 ReferenceError
const actions = require(path.resolve('desktop-actions.cjs'));
check('desktop-actions 导出 createExecutor', typeof actions.createExecutor === 'function');

const deps = {
  shell: { openExternal: async () => {}, openPath: async () => {} },
  clipboard: { writeText: () => {}, writeImage: () => {} },
  electron: {},
  platform: 'win32',
};
const ex = actions.createExecutor(deps, { dryRun: true, platform: 'win32' });
check('executor 暴露 sendKeys / executeStep / dispose',
  typeof ex.sendKeys === 'function' && typeof ex.executeStep === 'function' && typeof ex.dispose === 'function');

(async () => {
  try {
    await ex.executeStep({ type: 'keyTap', key: 'F24' });
    check('dryRun 执行 keyTap 不抛异常', true);
  } catch (e) {
    check('dryRun 执行 keyTap 不抛异常', false, e.message);
  }
  try {
    await ex.executeStep({ type: 'keyPress', keys: ['ctrl', 'v'] });
    check('dryRun 执行 keyPress(ctrl+v) 不抛异常', true);
  } catch (e) {
    check('dryRun 执行 keyPress(ctrl+v) 不抛异常', false, e.message);
  }
  try {
    await ex.executeStep({ type: 'delay', ms: 10 });
    check('dryRun 执行 delay 不抛异常', true);
  } catch (e) {
    check('dryRun 执行 delay 不抛异常', false, e.message);
  }
  // 真正实例化一次 worker（不启动）后释放，确保构造无副作用
  try {
    const w = new PowerShellWorker();
    check('PowerShellWorker 可实例化且有 exec/start/stop',
      typeof w.exec === 'function' && typeof w.start === 'function' && typeof w.stop === 'function');
    try { w.stop(); } catch { /* 未启动时忽略 */ }
  } catch (e) {
    check('PowerShellWorker 可实例化且有 exec/start/stop', false, e.message);
  }

  // 真跑一遍 warmUp（会真的拉起常驻 PowerShell，约 1s）—— 这一步才会命中 getPsWorker
  if (process.platform === 'win32') {
    const exLive = actions.createExecutor(deps, { platform: 'win32' });
    try {
      await exLive.warmUp();
      check('warmUp() 真正拉起 PowerShell 代理（getPsWorker 不再 ReferenceError）', true);
    } catch (e) {
      check('warmUp() 真正拉起 PowerShell 代理（getPsWorker 不再 ReferenceError）', false, e.message);
    } finally {
      try { exLive.dispose(); } catch { /* 忽略 */ }
    }
  } else {
    console.log('  - 跳过 warmUp 实跑（非 Windows）');
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
