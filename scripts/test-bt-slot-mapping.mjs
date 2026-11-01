// 回归测试：蓝牙槽位映射（读 + 写两个方向）
//   规则（客户日志实证）：
//     键号 1..15            → 按键 1..15
//     键号 16..16+旋钮*3-1  → 旋钮槽（无旋钮机型=残留，忽略）
//     键号 18 起            → 第 16、17… 个按键（16 键款的 K16 在 18 号槽）
//   写入：K16 → 18 号槽（写 16 号只会写进旋钮的"音量+"）
// 用法: node scripts/test-bt-slot-mapping.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

// ---------- 读：与 bt-protocol.js readLayer 的规则一致 ----------
function locateSlot({ echoKeyNo, keyCount, knobCount }) {
  const knobRange = knobCount * 3;
  if (echoKeyNo >= 1 && echoKeyNo <= Math.min(15, keyCount)) return { idx: echoKeyNo - 1, kind: 'key' };
  if (echoKeyNo >= 16 && echoKeyNo < 16 + knobRange) return { idx: keyCount + (echoKeyNo - 16), kind: 'knob' };
  if (echoKeyNo >= 18 && keyCount > 15 && 15 + (echoKeyNo - 18) < keyCount) {
    return { idx: 15 + (echoKeyNo - 18), kind: 'key' };
  }
  return { idx: -1, kind: 'ignored' };
}

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- 16 键款（无旋钮）----
const k16 = { keyCount: 16, knobCount: 0 };
check('16键 keyNo=1 → 按键1', locateSlot({ echoKeyNo: 1, ...k16 }).idx === 0);
check('16键 keyNo=15 → 按键15', locateSlot({ echoKeyNo: 15, ...k16 }).idx === 14);
check('16键 keyNo=18 → 按键16（K16 在 18 号槽）', locateSlot({ echoKeyNo: 18, ...k16 }).idx === 15,
  JSON.stringify(locateSlot({ echoKeyNo: 18, ...k16 })));
check('16键 keyNo=16（旋钮残留音量+）→ 忽略', locateSlot({ echoKeyNo: 16, ...k16 }).idx === -1);
check('16键 keyNo=17（旋钮残留）→ 忽略', locateSlot({ echoKeyNo: 17, ...k16 }).idx === -1);
check('16键 keyNo=19..24（更大机型残留）→ 忽略', [19, 22, 24].every((n) => locateSlot({ echoKeyNo: n, ...k16 }).idx === -1));

// ---- 6+1 款 ----
const k61 = { keyCount: 6, knobCount: 1 };
check('6+1 keyNo=6 → 按键6', locateSlot({ echoKeyNo: 6, ...k61 }).idx === 5);
check('6+1 keyNo=16 → 旋钮1左（槽位7）', locateSlot({ echoKeyNo: 16, ...k61 }).idx === 6);
check('6+1 keyNo=17 → 旋钮1中（槽位8）', locateSlot({ echoKeyNo: 17, ...k61 }).idx === 7);
check('6+1 keyNo=18 → 旋钮1右（槽位9）', locateSlot({ echoKeyNo: 18, ...k61 }).idx === 8);

// ---- 6+2 款 ----
const k62 = { keyCount: 6, knobCount: 2 };
check('6+2 keyNo=16..21 → 旋钮槽6..11', [16, 17, 18, 19, 20, 21].every((n, i) => locateSlot({ echoKeyNo: n, ...k62 }).idx === 6 + i));

// ---------- 写：从源码里取 _actionIdxToKeyNo 验证 ----------
const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-bt-slot.cjs');
writeFileSync(file, out);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { BtProtocolHandler } = require(file);

const mk = (keyCount, knobCount) => {
  const h = Object.create(BtProtocolHandler.prototype);
  h._info = { keyCount, knobCount };
  return h;
};
const h16 = mk(16, 0);
check('写：16键 K1 → 键号1', h16._actionIdxToKeyNo(0) === 1);
check('写：16键 K15 → 键号15', h16._actionIdxToKeyNo(14) === 15);
check('写：16键 K16 → 键号18（不是16）', h16._actionIdxToKeyNo(15) === 18, String(h16._actionIdxToKeyNo(15)));
const h61 = mk(6, 1);
check('写：6+1 K1..K6 → 键号1..6', [0, 1, 2, 3, 4, 5].every((i) => h61._actionIdxToKeyNo(i) === i + 1));
check('写：6+1 旋钮1左 → 键号16', h61._actionIdxToKeyNo(6) === 16);
const h62 = mk(6, 2);
check('写：6+2 旋钮2右 → 键号21', h62._actionIdxToKeyNo(11) === 21);

check('源码请求 25 条键记录（才能拿到 18 号槽）', src.includes('const keyNum = Math.max(25,'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
