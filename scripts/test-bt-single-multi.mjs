// 回归测试：只剩 1 步的「多键合一」必须按普通按键处理（蓝牙款）
// 现场：16 键蓝牙款 K2 = 多键合一里"Ctrl+未选择" + "Z"，
//       空槽位被清掉后只剩 Z → 协议里就是普通按键，
//       之前校验按 mode4 比 → 永远报"1 个槽位没写进去"。
// 用法: node scripts/test-bt-single-multi.mjs
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const src = readFileSync('src/components/BtConfigurator.jsx', 'utf8');

// 1) 保存前折算存在
check('保存前把单步多键折算成普通按键',
  src.includes('if (kept.length === 1) {') &&
  src.includes('mode: MODE.KEY,') &&
  src.includes('keyCode: one.keyCode || 0,'));

// 2) 校验归一存在
check('校验里单步多键按 mode1 归一',
  src.includes("if (list.length === 1) return `1|${list[0].mask || 0}|${list[0].keyCode || 0}`;"));

// 3) 多步多键仍然按 mode4 处理（不能被误归一）
check('多步多键仍是 mode4 语义', src.includes("return '4|' + list.map((mk) =>"));
check('空槽位仍会被丢掉', src.includes('const kept = list.filter((mk) => mk && mk.keyCode);'));

// 4) 协议隔离：老协议 / 新协议没有被改
const kc = readFileSync('src/components/KeyboardConfigurator.jsx', 'utf8');
const np = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
check('老协议页未被改动（无单步折算）', !kc.includes('kept.length === 1'));
check('新协议页未被改动（无单步折算）', !np.includes('kept.length === 1'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
