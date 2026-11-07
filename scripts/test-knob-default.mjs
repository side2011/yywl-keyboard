// 回归测试：旋钮左右不再靠型号默认，而是按设备出厂动作自动判定
// 用法: node scripts/test-knob-default.mjs
import { readFileSync } from 'node:fs';
import { defaultKnobSwap, mapKnobSlot } from '../src/services/knob-order.js';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

check('默认一律不对调（方向交给自动判定）', JSON.stringify(defaultKnobSwap(4, 1)) === '[]');
check('6+2 也不预设', JSON.stringify(defaultKnobSwap(6, 2)) === '[]');
check('无旋钮返回空数组', JSON.stringify(defaultKnobSwap(16, 0)) === '[]');

// 映射自逆性（对调时左↔右、中不动、按键不受影响）
const k = 4;
check('对调：界面左(4) → 设备右(6)', mapKnobSlot(4, k, 1, [true]) === 6);
check('对调：界面右(6) → 设备左(4)', mapKnobSlot(6, k, 1, [true]) === 4);
check('对调：中间(5) 不变', mapKnobSlot(5, k, 1, [true]) === 5);
check('不对调：全部原样', [0,1,2,3,4,5,6].every((i) => mapKnobSlot(i, k, 1, [false]) === i));

// 源文件：自动判定逻辑存在且用的是音量±的媒体码
const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
check('读取时自动判定旋钮方向', bt.includes('旋钮方向自动判定'));
check('按 0x00EA / 0x00E9 判断', bt.includes('0x00EA') && bt.includes('0x00E9'));
check('手动勾选后不再自动覆盖', bt.includes('isKnobSwapManual()'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);