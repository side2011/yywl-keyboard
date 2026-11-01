// 回归测试：读配置的"槽位定位"规则
//   · 6+1 款：设备只发 6 条按键记录，然后直接发旋钮记录（键号 16/17/18）
//     → 必须落到旋钮槽，否则客户看到"旋钮未设置"（本次反馈）
//   · 16 键款：第 16 个键的键号字节是 18，但本机没有旋钮 → 仍当第 16 个键
// 用法: node scripts/test-bt-slot-mapping.mjs
import { readFileSync } from 'node:fs';

// 与 bt-protocol.js readLayer 里的规则保持一致
function locateSlot({ i, echoKeyNo, keyCount, knobCount }) {
  const inKnobByKeyNo = knobCount > 0 && echoKeyNo >= 16 && echoKeyNo < 16 + knobCount * 3;
  if (echoKeyNo >= 1 && echoKeyNo <= keyCount) return { idx: echoKeyNo - 1, kind: 'key' };
  if (inKnobByKeyNo) return { idx: keyCount + (echoKeyNo - 16), kind: 'knob' };
  if (knobCount > 0 && i >= keyCount) return { idx: keyCount + (i - keyCount), kind: 'knob' };
  if (i < keyCount) return { idx: i, kind: 'key' };
  return { idx: -1, kind: 'ignored' };
}

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- 6+1 款：6 条按键 + 3 条旋钮记录 ----
const k61 = { keyCount: 6, knobCount: 1 };
check('6+1 第1条 keyNo=1 → 按键槽1', locateSlot({ i: 0, echoKeyNo: 1, ...k61 }).idx === 0);
check('6+1 第6条 keyNo=6 → 按键槽6', locateSlot({ i: 5, echoKeyNo: 6, ...k61 }).idx === 5);
// 第 7 条是旋钮记录，键号 16
const r7 = locateSlot({ i: 6, echoKeyNo: 16, ...k61 });
check('6+1 第7条 keyNo=16 → 旋钮1左（槽位7）', r7.idx === 6 && r7.kind === 'knob', JSON.stringify(r7));
const r8 = locateSlot({ i: 7, echoKeyNo: 17, ...k61 });
check('6+1 第8条 keyNo=17 → 旋钮1中（槽位8）', r8.idx === 7 && r8.kind === 'knob', JSON.stringify(r8));
const r9 = locateSlot({ i: 8, echoKeyNo: 18, ...k61 });
check('6+1 第9条 keyNo=18 → 旋钮1右（槽位9）', r9.idx === 8 && r9.kind === 'knob', JSON.stringify(r9));

// 设备若发满 15 条键记录（7..15 为空），旋钮仍按键号找到
const rK = locateSlot({ i: 16, echoKeyNo: 16, ...k61 });
check('6+1 发满 15 条键记录时，keyNo=16 仍是旋钮1左', rK.idx === 6 && rK.kind === 'knob', JSON.stringify(rK));

// ---- 16 键款：无旋钮，第 16 个键 keyNo=18 ----
const k16 = { keyCount: 16, knobCount: 0 };
const r16 = locateSlot({ i: 15, echoKeyNo: 18, ...k16 });
check('16 键第16条 keyNo=18 → 按键槽16（不被当旋钮）', r16.idx === 15 && r16.kind === 'key', JSON.stringify(r16));
check('16 键 keyNo=1 → 按键槽1', locateSlot({ i: 0, echoKeyNo: 1, ...k16 }).idx === 0);

// ---- 6+2 款：两条旋钮各 3 槽 ----
const k62 = { keyCount: 6, knobCount: 2 };
check('6+2 keyNo=16 → 旋钮1左', locateSlot({ i: 6, echoKeyNo: 16, ...k62 }).idx === 6);
check('6+2 keyNo=18 → 旋钮1右', locateSlot({ i: 8, echoKeyNo: 18, ...k62 }).idx === 8);
check('6+2 keyNo=19 → 旋钮2左', locateSlot({ i: 9, echoKeyNo: 19, ...k62 }).idx === 9);
check('6+2 keyNo=21 → 旋钮2右', locateSlot({ i: 11, echoKeyNo: 21, ...k62 }).idx === 11);

// ---- 源码里确实是这套规则（防止以后被改回去） ----
const src = readFileSync('src/services/bt-protocol.js', 'utf8');
check('源码含"键号优先 + 顺序兜底"逻辑',
  src.includes('inKnobByKeyNo') && src.includes("slotKind = '旋钮(键号)'") && src.includes("slotKind = '按键(顺序)'"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
