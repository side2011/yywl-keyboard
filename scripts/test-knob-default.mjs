// 回归测试：旋钮左右对调默认值（按机型）
// 用法: node scripts/test-knob-default.mjs
import { defaultKnobSwap, mapKnobSlot } from '../src/services/knob-order.js';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 单旋钮机型（4+1 / 6+1 / 5+1）默认对调：固件把"右转"存在 16 号槽
check('4+1 默认对调', JSON.stringify(defaultKnobSwap(4, 1)) === '[true]');
check('6+1 默认对调', JSON.stringify(defaultKnobSwap(6, 1)) === '[true]');
check('5+1 默认对调', JSON.stringify(defaultKnobSwap(5, 1)) === '[true]');

// 双旋钮机型默认不对调（客户实测是正的）
check('6+2 默认不对调', JSON.stringify(defaultKnobSwap(6, 2)) === '[false,false]');

// 无旋钮
check('16 键无旋钮 → 空数组', JSON.stringify(defaultKnobSwap(16, 0)) === '[]');

// 映射：旋钮三个槽位自逆（左↔右、中不动）
const k = 4;
check('对调：界面左(4) → 设备右(6)', mapKnobSlot(4, k, 1, [true]) === 6);
check('对调：界面右(6) → 设备左(4)', mapKnobSlot(6, k, 1, [true]) === 4);
check('对调：中间(5) 不变', mapKnobSlot(5, k, 1, [true]) === 5);
check('对调：按键(0..3) 不受影响', [0, 1, 2, 3].every((i) => mapKnobSlot(i, k, 1, [true]) === i));

// 不对调时原样
check('不对调：全部原样', [0, 1, 2, 3, 4, 5, 6].every((i) => mapKnobSlot(i, k, 1, [false]) === i));

// 双旋钮：第二个旋钮不受第一个影响
const sw = [false, true];
check('6+2：旋钮1 不对调', mapKnobSlot(6, 6, 2, sw) === 6);
check('6+2：旋钮2 左(9) → 右(11)', mapKnobSlot(9, 6, 2, sw) === 11);
check('6+2：旋钮2 右(11) → 左(9)', mapKnobSlot(11, 6, 2, sw) === 9);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
