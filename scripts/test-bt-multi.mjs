// 蓝牙「多键合一」编解码回归测试（不需要设备）
// 用法: node scripts/test-bt-multi.mjs
import {
  serializeBtKeyRecord,
  parseBtKeyRecord,
} from '../src/services/bt-protocol.js';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- V10（新蓝牙固件）----
// 组格式：rec[3]=mode rec[5]=组数，之后每 3 字节 1 组（rec[6..]=高字节, rec[7..]=低字节, rec[8..]=值）
function readGroupsV10(rec) {
  const n = rec[5];
  const out = [];
  for (let j = 0; j < n; j += 1) {
    out.push(((rec[6 + j * 3] << 8) | rec[7 + j * 3]) * 0 + rec[8 + j * 3]);
  }
  return out;
}

// Ctrl+C → Ctrl+V
const multi = { mode: 4, multiKeys: [{ mask: 0x01, keyCode: 0x06 }, { mask: 0x01, keyCode: 0x19 }] };
const recV10 = serializeBtKeyRecord(multi, 1, 1, true);
check('V10: 线上 mode 写的是 1（多键合一复用 mode 1）', recV10[3] === 1, 'mode=' + recV10[3]);
const g1 = readGroupsV10(recV10);
check('V10: 组数 = 4（Ctrl, C, Ctrl, V）', g1.length === 4, JSON.stringify(g1));
check('V10: 第 1 组是 Ctrl token', g1[0] === 0xF1, '0x' + g1[0].toString(16));
check('V10: 第 2 组是 C(0x06)', g1[1] === 0x06);
check('V10: 第 3 组是 Ctrl token', g1[2] === 0xF1);
check('V10: 第 4 组是 V(0x19)', g1[3] === 0x19);
check('V10: 记录长度 64 字节', recV10.length === 64);

// 回读：把记录反解析成配置，应还原为多键合一
const backV10 = parseBtKeyRecord(recV10, true);
check('V10: 回读 mode = 4', backV10.mode === 4, 'mode=' + backV10.mode);
check('V10: 回读 2 个按键', Array.isArray(backV10.multiKeys) && backV10.multiKeys.length === 2,
  JSON.stringify(backV10.multiKeys));
check('V10: 第 1 个是 Ctrl+C', backV10.multiKeys?.[0]?.mask === 0x01 && backV10.multiKeys?.[0]?.keyCode === 0x06);
check('V10: 第 2 个是 Ctrl+V', backV10.multiKeys?.[1]?.mask === 0x01 && backV10.multiKeys?.[1]?.keyCode === 0x19);

// 单个按键仍按基础键处理（不能误判成多键）
const single = { mode: 1, modifierMask: 0x01, keyCode: 0x04 };
const recSingle = serializeBtKeyRecord(single, 2, 1, true);
const backSingle = parseBtKeyRecord(recSingle, true);
check('V10: 单键 Ctrl+A 仍解析为 mode 1', backSingle.mode === 1, 'mode=' + backSingle.mode);
check('V10: 单键修饰位正确', backSingle.modifierMask === 0x01 && backSingle.keyCode === 0x04);

// 18 个按键上限
const many = { mode: 4, multiKeys: Array.from({ length: 20 }, (_, i) => ({ mask: 0, keyCode: 4 + i })) };
const recMany = serializeBtKeyRecord(many, 3, 1, true);
check('V10: 组数被限制在 18', recMany[5] <= 18, 'n=' + recMany[5]);

// ---- 旧协议 ----
const recOld = serializeBtKeyRecord(multi, 1, 1, false);
check('旧协议: 线上 mode = 1', recOld[3] === 1);
check('旧协议: 组数 = 2', recOld[9] === 2, 'n=' + recOld[9]);
check('旧协议: 第 1 组 mask=1 value=6', recOld[10] === 1 && recOld[11] === 0x06);
check('旧协议: 第 2 组 mask=1 value=0x19', recOld[12] === 1 && recOld[13] === 0x19);
const backOld = parseBtKeyRecord(recOld, false);
check('旧协议: 回读 mode = 4', backOld.mode === 4, 'mode=' + backOld.mode);
check('旧协议: 回读 2 个按键', backOld.multiKeys?.length === 2, JSON.stringify(backOld.multiKeys));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
