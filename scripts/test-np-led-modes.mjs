// 回归测试：新协议灯光模式表必须与 C# 完全一致 + 不再暴露"休眠允许"
// 用法: node scripts/test-np-led-modes.mjs
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 1) 从 C# 资源取权威文案（fxjnew_rgb_0..9）
const resx = readFileSync('yywlkey/Hid_Common/Properties/Resources.resx', 'utf8');
const want = [];
for (let i = 0; i <= 9; i += 1) {
  const m = resx.match(new RegExp(`<data name="fxjnew_rgb_${i}"[^>]*>\\s*<value>([^<]*)</value>`));
  want.push(m ? m[1] : `(缺失${i})`);
}
console.log('  C# 顺序: ' + want.join(' / '));

// 2) 从 JS 取表
const src = readFileSync('src/services/new-protocol.js', 'utf8');
const table = src.match(/export const RGB_MODES_J = \[([\s\S]*?)\];/);
if (!table) { console.log('  ✗ 找不到 RGB_MODES_J'); process.exit(1); }
const got = [...table[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

check('模式数量一致（10 项）', want.length === got.length && got.length === 10, `${want.length} vs ${got.length}`);
for (let i = 0; i < Math.min(want.length, got.length); i += 1) {
  check(`[${i}] ${want[i]}`, want[i] === got[i], `C#=${want[i]} JS=${got[i]}`);
}

// 3) 具体盯住历史错项
check('index 1 是「自定义颜色」而不是「灯光常量」', got[1] === '自定义颜色', got[1]);
check('index 3 是「按键触发」', got[3] === '按键触发', got[3]);

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
