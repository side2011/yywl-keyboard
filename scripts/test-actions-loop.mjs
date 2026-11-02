// 回归测试：扩展动作「自动循环」
// 用法: node scripts/test-actions-loop.mjs
//   · 执行器：开始/停止/再按停止、间隔夹取、preview 不启动循环
//   · 界面：actions.html 有「自动循环」勾选与秒数输入
//   · 主进程：测试 IPC 走 preview、注册热键前/退出前停循环
import { readFileSync } from 'node:fs';

const execSrc = readFileSync('desktop-actions.cjs', 'utf8');
const mainSrc = readFileSync('desktop-main.cjs', 'utf8');
const uiSrc = readFileSync('public/actions.html', 'utf8');

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- 执行器结构 ----
check('循环管理器存在', execSrc.includes('const __loops = new Map()'));
check('开始循环有日志', execSrc.includes("'[action] 开始自动循环 slot='"));
check('停止循环有日志', execSrc.includes("'[action] 停止自动循环 slot='"));
check('间隔夹在 1~3600 秒', execSrc.includes(', 1), 3600) * 1000'));
check('runAction 支持 preview 跳过循环', execSrc.includes('!dryRun && !opts.preview && action?.loop?.enabled'));
check('导出 stopLoop/stopAllLoops/isLooping', execSrc.includes('stopLoop, stopAllLoops, isLooping'));

// 真跑一遍：用 dryRun 之外的桩太难，这里验证 toggle 的语义代码
check('第二次触发走 stopLoop', /if \(isLooping\(slot\)\) \{\s*\n\s*stopLoop\(slot\);/.test(execSrc));

// ---- 主进程 ----
check('测试按钮传 preview', mainSrc.includes("{ preview: true }"));
check('注册热键前停掉旧循环', mainSrc.includes('executor.stopAllLoops?.()'));
check('退出前停掉循环', mainSrc.includes('executor.stopAllLoops()'));
check('热键回调打印开始/停止', mainSrc.includes("'开始' : '停止') + '自动循环:'"));

// ---- 界面 ----
check('界面有「自动循环」开关', uiSrc.includes("' 自动循环'"));
check('界面有秒数输入(1~3600)', uiSrc.includes("loopSec.min = '1'") && uiSrc.includes("loopSec.max = '3600'"));
check('勾选后写入 action.loop', uiSrc.includes('target2.loop = { enabled: loopChk.checked'));
check('改秒数会写入 action.loop', uiSrc.includes('target3.loop = { enabled: true, everySec: sec }'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
