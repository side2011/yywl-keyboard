// 回归测试：清空按键后的"空配置等价"判断（客户日志里的误报）
// 用法: node scripts/test-bt-empty-compare.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

// 从 BtConfigurator 抽出 cfgKeyOf 的归一化逻辑做等价性验证（不依赖 React）
const src = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
const start = src.indexOf('const cfgKeyOf = (c) => {');
if (start < 0) { console.log('找不到 cfgKeyOf'); process.exit(1); }
const end = src.indexOf('\n      };', start) + 9;
const fnSrc = src.slice(start, end);

const KEY_MODE = { NONE: 0, KEYBOARD: 1, MOUSE: 2, MEDIA: 3, MULTI: 4, DELAY: 5 };
const js = fnSrc
  .replace('const cfgKeyOf', 'const cfgKeyOf')
  .replace(/\bMODE\./g, 'KEY_MODE.');

const factory = new Function(`${js}; return cfgKeyOf;`);
const cfgKeyOf = factory();

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const emptyUi = { mode: 0, modifierMask: 0, keyCode: 0, multiKeys: [] };
const emptyDev = { mode: 1, modifierMask: 0, keyCode: 0, multiKeys: [] };  // 设备里"清空"后的记录
const emptyMulti = { mode: 4, multiKeys: [] };

check('界面未设置 == 设备清空记录（客户日志里的误报）', cfgKeyOf(emptyUi) === cfgKeyOf(emptyDev),
  `${cfgKeyOf(emptyUi)} vs ${cfgKeyOf(emptyDev)}`);
check('未设置 == 空多键合一', cfgKeyOf(emptyUi) === cfgKeyOf(emptyMulti));

const ctrlA = { mode: 1, modifierMask: 1, keyCode: 4, multiKeys: [] };
const winA = { mode: 1, modifierMask: 8, keyCode: 4, multiKeys: [] };
check('Ctrl+A 与 Win+A 不相等', cfgKeyOf(ctrlA) !== cfgKeyOf(winA));
check('Ctrl+A 与 未设置 不相等', cfgKeyOf(ctrlA) !== cfgKeyOf(emptyUi));

const multi1 = { mode: 4, multiKeys: [{ mask: 1, keyCode: 6 }, { mask: 0, keyCode: 25 }] };
const multi2 = { mode: 4, multiKeys: [{ mask: 1, keyCode: 6 }] };
check('多键序列不同 → 不相等', cfgKeyOf(multi1) !== cfgKeyOf(multi2));
check('同一多键序列 → 相等', cfgKeyOf(multi1) === cfgKeyOf({ mode: 4, multiKeys: [{ mask: 1, keyCode: 6 }, { mask: 0, keyCode: 25 }] }));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
