// 新协议保存校验比较逻辑的回归测试（客户日志：宏已写入但被判不一致）
// 用法: node scripts/test-np-verify.mjs
import { readFileSync } from 'node:fs';

// 从组件里抽出 norm()（纯函数，无 React 依赖）
const src = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
const start = src.indexOf('const norm = (c) => {');
if (start < 0) { console.log('找不到 norm'); process.exit(1); }
const end = src.indexOf('\n        };', start) + 11;
const fnSrc = src.slice(start, end);
// eslint-disable-next-line no-new-func
const norm = new Function(`${fnSrc}; return norm;`)();

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 客户现场：宏 11 步，设备回读 mode=5 且 11 步，但界面配置里残留了 modifier
const wantMacro = { mode: 5, macroSteps: Array.from({ length: 11 }, () => ({} )), modifier: 1, keyCode: 0 };
const gotMacro = { mode: 5, macroSteps: Array.from({ length: 11 }, () => ({} )), modifier: 0, keyCode: 0 };
check('宏：步骤数相同即视为一致（忽略残留 modifier）', norm(wantMacro) === norm(gotMacro),
  `${norm(wantMacro)} vs ${norm(gotMacro)}`);

check('宏：步骤数不同 → 不一致',
  norm({ mode: 5, macroSteps: new Array(11).fill({}) }) !== norm({ mode: 5, macroSteps: new Array(5).fill({}) }));

// 空配置等价
check('未设置 == 设备清空记录', norm({ mode: 0 }) === norm({ mode: 1, keyCode: 0, modifier: 0 }));
check('未设置 != 真按键', norm({ mode: 0 }) !== norm({ mode: 1, keyCode: 4, modifier: 0 }));

// 普通键盘键：修饰位参与比较
check('Ctrl+A != A', norm({ mode: 1, keyCode: 4, modifier: 1 }) !== norm({ mode: 1, keyCode: 4, modifier: 0 }));

// 多键合一
check('多键：数量相同即一致', norm({ mode: 4, multiKeys: [{}, {}] }) === norm({ mode: 4, multiKeys: [{}, {}] }));
check('多键：数量不同 → 不一致', norm({ mode: 4, multiKeys: [{}, {}] }) !== norm({ mode: 4, multiKeys: [{}] }));
check('空多键 == 未设置', norm({ mode: 4, multiKeys: [] }) === norm({ mode: 0 }));

// 多媒体
check('多媒体低字节比较', norm({ mode: 3, mediaCode: [0, 0xE9] }) === norm({ mode: 3, mediaCode: [0x01, 0xE9] }),
  `${norm({ mode: 3, mediaCode: [0, 0xE9] })}`);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
