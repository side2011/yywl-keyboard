// 校验多键合一的"每键延时"编码：值槽 [6+3i]/[7+3i]（QT delay_spinBox_N 的写法）
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-bt-proto.cjs');
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

const cfg = {
  mode: 4,
  multiKeys: [
    { mask: 0x01, keyCode: 0x06, delay: 50 },   // Ctrl + C，之后等 50ms
    { mask: 0, keyCode: 0x19, delay: 0 },       // V，不等待
  ],
};
const rec = serializeBtKeyRecord(cfg, 1, 1, true);
const n = rec[5];
const groups = [];
for (let j = 0; j < n; j += 1) {
  groups.push({
    delay: (rec[6 + j * 3] << 8) | rec[7 + j * 3],
    value: rec[8 + j * 3],
  });
}
check('组数 = 3（Ctrl / C / V）', n === 3, 'n=' + n);
check('值槽带延时 50ms', groups[1]?.delay === 50 && groups[1]?.value === 0x06, JSON.stringify(groups[1]));
check('修饰槽延时为 0', groups[0]?.delay === 0 && groups[0]?.value === 0xF1);
check('第二个键延时 0', groups[2]?.delay === 0 && groups[2]?.value === 0x19);

const back = parseBtKeyRecord(rec, true);
check('回读 mode=4', back.mode === 4);
check('回读 2 个键位', back.multiKeys?.length === 2, JSON.stringify(back.multiKeys));
check('回读延时 50ms', back.multiKeys?.[0]?.delay === 50);
check('回读第二个延时 0', back.multiKeys?.[1]?.delay === 0);

// 上限裁剪：delay 超过 60000 被钳制
const big = serializeBtKeyRecord({ mode: 4, multiKeys: [{ mask: 0, keyCode: 4, delay: 99999 }] }, 2, 1, true);
const bigDelay = (big[6] << 8) | big[7];
check('delay 超限被钳到 60000', bigDelay === 60000, 'delay=' + bigDelay);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
