// 回归测试：蓝牙 V10 鼠标记录（位置约定，来自客户现场日志 + QT Traversal_Key_Txt）
// 用法: node scripts/test-bt-mouse-v10.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const tmp = resolve('node_modules', '.cache-bt-mouse.cjs');
writeFileSync(tmp, out);
const require = createRequire(import.meta.url);
const { parseBtKeyRecord, serializeBtKeyRecord } = require(tmp);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 客户现场（6+1 蓝牙款，层2 旋钮）保存后回读的原始记录
const raw = (bytes) => Uint8Array.from(bytes);

// 滚轮+ : [11]=0x00 [20]=0x01
const wheelUp = raw([0xfa, 0x10, 0x02, 0x03, 0x01, 0x04, 0, 0, 0, 0, 0, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0, 0, 0]);
const m1 = parseBtKeyRecord(wheelUp, true);
check('滚轮+ → wheel=1（不是 mod=1）', m1.mouse?.wheel === 1 && m1.mouse?.mod === 0,
  JSON.stringify(m1.mouse));

// 中键 : [11]=0x04
const middle = raw([0xfa, 0x11, 0x02, 0x03, 0x01, 0x04, 0, 0, 0, 0, 0, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0, 0, 0]);
const m2 = parseBtKeyRecord(middle, true);
check('中键 → btn=4', m2.mouse?.btn === 4 && m2.mouse?.wheel === 0, JSON.stringify(m2.mouse));

// 滚轮- : [20]=0xFF
const wheelDown = raw([0xfa, 0x12, 0x02, 0x03, 0x01, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0, 0, 0]);
const m3 = parseBtKeyRecord(wheelDown, true);
check('滚轮- → wheel=0xFF', m3.mouse?.wheel === 0xff, JSON.stringify(m3.mouse));

// 左键 : [11]=0x01
const left = raw([0xfa, 0x10, 0x01, 0x03, 0x01, 0x01, 0, 0, 0, 0, 0, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
check('左键 → btn=1', parseBtKeyRecord(left, true).mouse?.btn === 1);

// Ctrl+滚轮+ : [11]=0xF1 [20]=0x01
const ctrlWheel = raw([0xfa, 0x10, 0x01, 0x03, 0x01, 0x05, 0, 0, 0, 0, 0, 0xf1, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0, 0, 0]);
const m5 = parseBtKeyRecord(ctrlWheel, true);
check('Ctrl+滚轮+ → mod=0xF1 + wheel=1', m5.mouse?.mod === 0xf1 && m5.mouse?.wheel === 1, JSON.stringify(m5.mouse));

// 划屏（behavior=4）: [11]=1..5 → mod
const swipe = raw([0xfa, 0x10, 0x01, 0x03, 0x04, 0x01, 0, 0, 0, 0, 0, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const m6 = parseBtKeyRecord(swipe, true);
check('划屏 → mod=2（方向）', m6.mouse?.mod === 2 && m6.mouse?.btn === 0, JSON.stringify(m6.mouse));

// 序列化：按键写 [11]、滚轮写 [20]
const rec = serializeBtKeyRecord({ mode: 3, mouse: { behavior: 1, mod: 0, btn: 4, wheel: 1 } }, 16, 2, true);
check('写：btn 落在 [11]', rec[11] === 4, `[11]=${rec[11]}`);
check('写：wheel 落在 [20]', rec[20] === 1, `[20]=${rec[20]}`);
check('写：[8]/[14]/[17] 为 0', rec[8] === 0 && rec[14] === 0 && rec[17] === 0);

const rec2 = serializeBtKeyRecord({ mode: 3, mouse: { behavior: 1, mod: 0xf1, btn: 0, wheel: 0xff } }, 16, 2, true);
check('写：mod 落在 [11]', rec2[11] === 0xf1, `[11]=${rec2[11]}`);
check('写：wheel 0xFF 落在 [20]', rec2[20] === 0xff, `[20]=${rec2[20]}`);

// 往返一致（客户报错的核心：写完读回必须相等）
const roundTrip = parseBtKeyRecord(Uint8Array.from([0xfa, ...rec.slice(1)]), true);
check('往返：btn/wheel 一致', roundTrip.mouse?.btn === 4 && roundTrip.mouse?.wheel === 1,
  JSON.stringify(roundTrip.mouse));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
