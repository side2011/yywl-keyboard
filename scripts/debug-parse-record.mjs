// 用真实设备字节验证 parseBtKeyRecord
// 用法: node scripts/debug-parse-record.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-parse-debug.cjs');
writeFileSync(file, out);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { parseBtKeyRecord } = require(file);

const hex = (s) => new Uint8Array(s.split(' ').map((h) => parseInt(h, 16)));
const cases = {
  '层2键1 / QT 写的左Alt (count=0, mask=04)': 'fa 01 02 01 00 00 00 00 00 00 04 00 00 00',
  '层2键2 / 普通 E': 'fa 02 02 01 00 00 00 00 00 01 00 08 00 00',
  '层1键1 / 普通键': 'fa 01 01 01 00 00 00 00 00 01 00 29 00 00',
  '层2键1 / 我们清除后 (mode=0)': 'fa 01 02 00 00 00 00 00 00 00 04 00 00 00',
};
for (const [name, s] of Object.entries(cases)) {
  const cfg = parseBtKeyRecord(hex(s), false);
  console.log(name);
  console.log('   ->', JSON.stringify({
    mode: cfg.mode,
    modifierMask: cfg.modifierMask,
    keyCode: cfg.keyCode,
    groups: cfg.groups,
  }));
}
