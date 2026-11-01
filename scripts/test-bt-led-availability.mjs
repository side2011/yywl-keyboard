// 回归测试：蓝牙款"有没有灯光页"的判定规则
//   单键款(1)              → 无灯
//   6 键 + 0 旋钮（简配）  → 无灯
//   6+2 款(6 键 + 2 旋钮)  → 有灯   ← 客户反馈这里被误隐藏
//   其他（4/9/16/21…）     → 有灯
// 用法: node scripts/test-bt-led-availability.mjs
import { readFileSync } from 'node:fs';

// 从组件里抽取判定逻辑（与源码保持同一条规则）
const src = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
const m = src.match(/const is6KeyPlain = keyCount === 6 && knobCount === 0;\s*\n\s*const hasLighting = !\(keyCount === 1 \|\| is6KeyPlain\);/);
if (!m) {
  console.log('  ✗ 组件里没找到灯光判定规则（可能被改动，请同步更新测试）');
  process.exit(1);
}

const hasLighting = (keyCount, knobCount) => {
  const is6KeyPlain = keyCount === 6 && knobCount === 0;
  return !(keyCount === 1 || is6KeyPlain);
};

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

check('单键款：无灯光页', hasLighting(1, 0) === false);
check('6 键 + 0 旋钮（简配）：无灯光页', hasLighting(6, 0) === false);
check('6+2 款（6 键 + 2 旋钮）：有灯光页', hasLighting(6, 2) === true);
check('6+1 款：有灯光页', hasLighting(6, 1) === true);
check('4+1 款：有灯光页', hasLighting(4, 1) === true);
check('9 键：有灯光页', hasLighting(9, 0) === true);
check('16 键：有灯光页', hasLighting(16, 0) === true);
check('21+1 款：有灯光页', hasLighting(21, 1) === true);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
