// 旋钮左右顺序的回归测试（纯函数，不需要设备）
// 用法: node scripts/test-knob-order.mjs
import { defaultKnobSwap, mapKnobSlot } from '../src/services/knob-order.js';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name); }
};

// ---------- 默认值 ----------
check('6+2 默认两个旋钮都开启对调', JSON.stringify(defaultKnobSwap(6, 2)) === '[true,true]');
check('6+1 默认不对调', JSON.stringify(defaultKnobSwap(6, 1)) === '[]');
check('6 键无旋钮 默认不对调', JSON.stringify(defaultKnobSwap(6, 0)) === '[]');
check('4+1 默认不对调', JSON.stringify(defaultKnobSwap(4, 1)) === '[]');

// ---------- 映射（6+2，两个旋钮都对调） ----------
const swap = [true, true];
const map = (i) => mapKnobSlot(i, 6, 2, swap);
// 按键 0..5 不受影响
check('按键槽位不受影响（0..5 原样）', [0, 1, 2, 3, 4, 5].every((i) => map(i) === i));
// 旋钮1：界面 左(6)/中(7)/右(8) → 设备 18/17/16
check('旋钮1 左(6)→设备槽8', map(6) === 8);
check('旋钮1 中(7)→设备槽7（不变）', map(7) === 7);
check('旋钮1 右(8)→设备槽6', map(8) === 6);
// 旋钮2：9/10/11 → 11/10/9
check('旋钮2 左(9)→设备槽11', map(9) === 11);
check('旋钮2 中(10)→设备槽10', map(10) === 10);
check('旋钮2 右(11)→设备槽9', map(11) === 9);
// 自逆：再映射一次回到原值
check('映射自逆（读写一致）', [6, 7, 8, 9, 10, 11].every((i) => map(map(i)) === i));

// ---------- 关闭对调时是恒等映射 ----------
const noSwap = [false, false];
check('关闭对调时 6+2 恒等', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].every((i) => mapKnobSlot(i, 6, 2, noSwap) === i));

// ---------- 只对调其中一个旋钮 ----------
const onlySecond = [false, true];
check('只对调旋钮2：旋钮1 保持原样', [6, 7, 8].every((i) => mapKnobSlot(i, 6, 2, onlySecond) === i));
check('只对调旋钮2：旋钮2 左右互换', mapKnobSlot(9, 6, 2, onlySecond) === 11 && mapKnobSlot(11, 6, 2, onlySecond) === 9);

// ---------- 边界 ----------
check('无旋钮时恒等', [0, 1, 2, 3, 4, 5].every((i) => mapKnobSlot(i, 6, 0, [true, true]) === i));
check('swap 数组缺项按不对调处理', mapKnobSlot(9, 6, 2, []) === 9);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
