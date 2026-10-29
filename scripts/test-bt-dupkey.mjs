// 回归测试：16 键蓝牙款的重复 keyNo 上报（客户日志 yywl-bt-save-20261029-171710）
//
// 现场原始报告（层1）：
//   fa 10 01 01 00 00 00 00 00 01 01 18 00 00   → keyNo=16, mode=1, Ctrl + U   ← 真正的按键配置
//   fa 10 01 02 00 00 00 00 00 01 e9 00 00 00   → keyNo=16, mode=2, 音量+       ← 设备补发的旋钮记录
// 之前第二条会覆盖第一条 → K16 永远显示"音量+"，保存校验也永远不一致。
//
// 用法: node scripts/test-bt-dupkey.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-bt-proto-dup.cjs');
writeFileSync(file, out);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { parseBtKeyRecord } = require(file);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 用日志里的真实字节还原两条报告
const hex = (s) => new Uint8Array(s.split(' ').map((h) => parseInt(h, 16)));
const report1 = hex('fa 10 01 01 00 00 00 00 00 01 01 18 00 00');
const report2 = hex('fa 10 01 02 00 00 00 00 00 01 e9 00 00 00');

const c1 = parseBtKeyRecord(report1, false);
const c2 = parseBtKeyRecord(report2, false);
check('第一条解析为 键盘 Ctrl+U（mode=1 keyCode=0x18）', c1.mode === 1 && c1.keyCode === 0x18 && c1.modifierMask === 0x01,
  JSON.stringify(c1));
check('第二条解析为 多媒体 音量+（mode=2）', c2.mode === 2 && c2.mediaCode === 0xe9, JSON.stringify(c2));

// 模拟 readLayer 的去重：同一 keyNo 只保留首条
const seen = new Set();
const configs = [];
for (const [data, cfg] of [[report1, c1], [report2, c2]]) {
  const keyNo = data[1];
  if (seen.has(keyNo)) continue;
  seen.add(keyNo);
  configs[keyNo - 1] = cfg;
}
check('去重后 K16 = 键盘 Ctrl+U（不再被音量+覆盖）',
  configs[15].mode === 1 && configs[15].keyCode === 0x18,
  JSON.stringify(configs[15]));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
