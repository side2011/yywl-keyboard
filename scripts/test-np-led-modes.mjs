// 回归测试：新协议 2.0 灯光模式表必须与 QT 上位机界面一致（用户 + 下位机技术确认）
// 用法: node scripts/test-np-led-modes.mjs
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// QT 软件「灯效」界面的顺序（2 列，左→右、上→下）
const QT_MODES = ['关闭灯光','灯光常量','流光','按键触发','彩虹流光','波浪','彩虹跑马','呼吸','涟漪','交叉涟漪'];

const src = readFileSync('src/services/new-protocol.js', 'utf8');
const table = src.match(/export const RGB_MODES_J = \[([\s\S]*?)\];/);
if (!table) { console.log('  ✗ 找不到 RGB_MODES_J'); process.exit(1); }
const got = [...table[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

check('模式数量 10 项', got.length === 10, String(got.length));
for (let i = 0; i < QT_MODES.length; i += 1) {
  check(`[${i}] ${QT_MODES[i]}`, got[i] === QT_MODES[i], `QT=${QT_MODES[i]} JS=${got[i]}`);
}

// 界面：不再显示「设备回读」，不再有临时测试面板
const ui = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
check('不再弹「设备回读」提示', !/toast\.(success|error)\(t\('灯光已保存到所有层（设备回读/.test(ui) && !ui.includes('设备回读：{mode}'));
check('没有 ?ledtest 测试面板', !ui.includes('ledTestMode'));
check('写入固定 sleepAllow=1', ui.includes('writeLedLayer(l, ledMode, ledColors, 1)'));
check('界面不再有「休眠允许」控件', !ui.includes('休眠允许'));

// 协议隔离
const kc = readFileSync('src/components/KeyboardConfigurator.jsx', 'utf8');
const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
check('老协议未引入 RGB_MODES_J', !kc.includes('RGB_MODES_J'));
check('蓝牙款未引入 RGB_MODES_J', !bt.includes('RGB_MODES_J'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);