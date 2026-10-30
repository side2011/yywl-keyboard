// 回归测试：同一键号多条记录时的挑选（16 键款 K16）
// 用法: node scripts/test-bt-pick-record.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-bt-proto-pick.cjs');
writeFileSync(file, out);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { pickBestRecord } = require(file);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const keyU = { mode: 1, modifierMask: 1, keyCode: 0x18 };
const mediaVolUp = { mode: 2, mediaCode: 0xe9 };

check('键盘记录在前 → 取键盘', pickBestRecord([keyU, mediaVolUp]).mode === 1);
check('旋钮记录在前 → 仍取键盘（避免 K16 变音量+）', pickBestRecord([mediaVolUp, keyU]).mode === 1);
check('只有旋钮记录 → 取旋钮（客户真设成媒体时也不能丢）', pickBestRecord([mediaVolUp]).mode === 2);
check('只有一条键盘记录 → 取它', pickBestRecord([keyU]).keyCode === 0x18);
check('空列表 → undefined', pickBestRecord([]) === undefined);
check('多键合一优先于媒体', pickBestRecord([mediaVolUp, { mode: 4, multiKeys: [{}, {}] }]).mode === 4);
check('延时键优先于媒体', pickBestRecord([mediaVolUp, { mode: 5, delay: 100 }]).mode === 5);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
