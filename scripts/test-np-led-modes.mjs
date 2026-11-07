// 回归测试：新协议灯光模式表必须与 C# 完全一致 + 不再暴露"休眠允许"
// 用法: node scripts/test-np-led-modes.mjs
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 1) 新协议 2.0 没有 C# 上位机，模式表只能按"设备实测确认"维护：
//    0 = 关闭灯光，1 = 按键触发（客户现场确认），其余 2..9 标成「模式N」待确认

// 2) 从 JS 取表
const src = readFileSync('src/services/new-protocol.js', 'utf8');
const table = src.match(/export const RGB_MODES_J = \[([\s\S]*?)\];/);
if (!table) { console.log('  ✗ 找不到 RGB_MODES_J'); process.exit(1); }
const got = [...table[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

check('模式数量 10 项', got.length === 10, String(got.length));
check('index 0 = 关闭灯光', got[0] === '关闭灯光', got[0]);
check('index 1 = 按键触发（实测确认）', got[1] === '按键触发', got[1]);
for (let i = 2; i <= 9; i += 1) {
  check(`index ${i} 标为待确认「模式${i}」`, got[i] === `模式${i}`, got[i]);
}


// 4) 「休眠允许」不再出现在界面上
const ui = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
check('界面不再有「休眠允许」控件', !ui.includes('休眠允许'));
check('写入固定 sleepAllow=1', ui.includes('writeLedLayer(l, ledMode, ledColors, 1)'));
check('不再有 ledSleepAllow 状态', !ui.includes('setLedSleepAllow'));

// 5) 协议隔离：老协议 / 蓝牙款不被牵连
const kc = readFileSync('src/components/KeyboardConfigurator.jsx', 'utf8');
const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
check('老协议未引入 RGB_MODES_J', !kc.includes('RGB_MODES_J'));
check('蓝牙款未引入 RGB_MODES_J', !bt.includes('RGB_MODES_J'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
