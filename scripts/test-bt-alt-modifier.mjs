// 回归测试：旧协议"单独修饰键"编码（客户日志实测的 QT 记录）
//   fa 01 02 01 00 00 00 00 00 00 04 00 00 00
//     [3]=mode 1, [9]=组数 0, [10]=0x04 修饰位掩码, [11]=0
// 用法: node scripts/test-bt-alt-modifier.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-bt-proto-alt.cjs');
writeFileSync(file, out);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { serializeBtKeyRecord, parseBtKeyRecord } = require(file);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 客户现场：一个键设成"左Alt"（modifierMask=0x04，无 keyCode），旧固件
const alt = serializeBtKeyRecord({ mode: 1, modifierMask: 0x04, keyCode: 0 }, 1, 2, false);
check('单独左Alt：组数 = 0（QT 实测记录就是 0）', alt[9] === 0, `rec[9]=${alt[9]}`);
check('单独左Alt：mask 字节 = 0x04', alt[10] === 0x04, `rec[10]=0x${alt[10].toString(16)}`);
check('单独左Alt：值字节 = 0', alt[11] === 0x00, `rec[11]=0x${alt[11].toString(16)}`);

// 与 QT 写出来的记录逐字节比对（除 keyNo/layer）
const qt = new Uint8Array([0xFD, 0x01, 0x02, 0x01, 0, 0, 0, 0, 0, 0, 0x04, 0, 0]);
const diff = [];
for (let i = 0; i < 13; i += 1) if (alt[i] !== qt[i]) diff.push(`${i}: 我们=${alt[i]} QT=${qt[i]}`);
check('与 QT 记录前 13 字节一致', diff.length === 0, diff.join('; '));

// 组合键 Ctrl+E 不受影响
const ctrlE = serializeBtKeyRecord({ mode: 1, modifierMask: 0x01, keyCode: 0x08 }, 3, 1, false);
check('Ctrl+E：组数=1、mask=0x01、值=0x08',
  ctrlE[9] === 1 && ctrlE[10] === 0x01 && ctrlE[11] === 0x08,
  `rec[9..11]=${ctrlE[9]},${ctrlE[10]},${ctrlE[11]}`);

// 普通键
const plain = serializeBtKeyRecord({ mode: 1, modifierMask: 0, keyCode: 0x08 }, 4, 1, false);
check('普通键 E：组数=1、mask=0、值=0x08',
  plain[9] === 1 && plain[10] === 0x00 && plain[11] === 0x08,
  `rec[9..11]=${plain[9]},${plain[10]},${plain[11]}`);

// 解析回读：QT 记录应还原成"只有修饰键"
const back = parseBtKeyRecord(new Uint8Array([0xFA, 0x01, 0x02, 0x01, 0, 0, 0, 0, 0, 0, 0x04, 0, 0, 0]), false);
check('回读 QT 左Alt 记录 → mode=1、modifierMask=0x04、keyCode=0',
  back.mode === 1 && back.modifierMask === 0x04 && back.keyCode === 0,
  JSON.stringify({ mode: back.mode, mask: back.modifierMask, key: back.keyCode }));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
