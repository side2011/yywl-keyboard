// 回归测试：旋钮左右只对 4+1 与 6+2 硬编码互换，其它款式必须保持不预设
// 用法: node scripts/test-knob-default.mjs
import { readFileSync } from 'node:fs';
import { defaultKnobSwap, mapKnobSlot } from '../src/services/knob-order.js';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- 只有 4+1 与 6+2 互换 ----
check('6+2 → 两个旋钮都互换', JSON.stringify(defaultKnobSwap(6, 2)) === '[true,true]', JSON.stringify(defaultKnobSwap(6, 2)));
check('4+1 → 单个旋钮互换', JSON.stringify(defaultKnobSwap(4, 1)) === '[true]', JSON.stringify(defaultKnobSwap(4, 1)));
check('4+1 与 6+2 之外全部不互换（含 6+1、9+2、16+2、5+1、3+1）',
  [[6,1],[9,2],[16,2],[5,1],[3,1],[1,1]].every(([k, n]) => defaultKnobSwap(k, n).every((v) => v === false)));
const others = [[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[12,0],[16,0],[6,1],[9,2],[6,3],[16,2],[5,1],[3,1]];
for (const [k, n] of others) {
  const got = defaultKnobSwap(k, n);
  check(`${k}+${n} 不互换`, Array.isArray(got) && got.every((v) => v === false), JSON.stringify(got));
}

// ---- 映射自逆 ----
check('对调：界面左 → 设备右', mapKnobSlot(6, 6, 2, [true, true]) === 8);
check('对调：界面右 → 设备左', mapKnobSlot(8, 6, 2, [true, true]) === 6);
check('对调：中间不变', mapKnobSlot(7, 6, 2, [true, true]) === 7);
check('对调：按键区不受影响', mapKnobSlot(3, 6, 2, [true, true]) === 3);
check('旋钮2 左(9)→右(11)', mapKnobSlot(9, 6, 2, [true, true]) === 11);
check('不互换时全部原样', [0,3,6,7,8,9,10,11].every((i) => mapKnobSlot(i, 6, 2, [false, false]) === i));

// ---- 代码层面：不再有一键互换按钮 / 自动判定 ----
const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
const i18n = readFileSync('src/i18n.js', 'utf8');
check('界面无 ⇄ 一键互换按钮', !bt.includes('⇄'));
check('无"一键互换"提示文案', !bt.includes('一键互换') && !i18n.includes('一键互换'));
check('无"旋钮方向自动判定"逻辑（不再影响其它款式）', !bt.includes('旋钮方向自动判定'));
check('仍保留手动兜底（固件信息里的勾选）', bt.includes('toggleKnobSwap') && bt.includes("t('左右对调')"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
