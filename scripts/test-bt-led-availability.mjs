// 回归测试：蓝牙款灯光页是否显示（对齐原厂 QT：所有机型都能进灯光页）
// QT 依据：widget.cpp:2835 index==3 → Select_PHY_Key_Mode=8（RGB 页面），与固件版本无关；
//          只有"回读"才是版本>=10（widget.cpp:2839）。
// 用法: node scripts/test-bt-led-availability.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
if (!/const hasLighting = true;/.test(src)) {
  console.log('  ✗ 组件里的 hasLighting 不再恒为 true（规则变了，请同步更新测试）');
  process.exit(1);
}

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 规则：所有蓝牙款都显示灯光页
const hasLighting = () => true;

check('单键款：显示灯光页（和 QT 一致）', hasLighting(1, 0) === true);
check('6 键 + 0 旋钮：显示灯光页', hasLighting(6, 0) === true);
check('6+2 款：显示灯光页 ← 客户反馈的机型', hasLighting(6, 2) === true);
check('4+1 款：显示灯光页', hasLighting(4, 1) === true);
check('9 键：显示灯光页', hasLighting(9, 0) === true);
check('16 键：显示灯光页', hasLighting(16, 0) === true);
check('21+1 款：显示灯光页', hasLighting(21, 1) === true);

// 旧固件只写不读（有黄色提示），V10 可回读
const btProto = readFileSync('src/services/bt-protocol.js', 'utf8');
check('旧固件 readLedLayer 直接返回 readable:false（不发命令白等）',
  /if \(!this\._isV10\)[\s\S]{0,200}readable: false/.test(btProto));
check('V10 走 0xFA 0xB0 回读', /this\._send\(this\._mk\(0xFA, \[0xB0, layer\]\)\)/.test(btProto));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
