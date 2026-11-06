// 校验多键合一的"每键间隔"编码 —— 注意语义位移：
//   界面：delay = 这个键按下之后等多久再按下一个键
//   设备：槽位里的 16bit 延时 = 按这个键之前先等多久（QT delay_spinBox_N 写在 [6+3i]/[7+3i]）
//   → 写入时整体前移一格：第 i 步（i>0）的延时 = 界面第 i-1 步的间隔
// 现场事故：F5(0) → F8(1500) → F2(1500)，1500 停在了 F5-F8 之间（客户要求停在 F8-F2 之间）
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

const readGroups = (rec) => {
  const n = rec[5];
  const groups = [];
  for (let j = 0; j < n; j += 1) {
    groups.push({
      delay: (rec[6 + j * 3] << 8) | rec[7 + j * 3],
      value: rec[8 + j * 3],
    });
  }
  return groups;
};

// ---- 案例 1：Ctrl+C（间隔 50）→ V（间隔 0）----
const cfg = {
  mode: 4,
  multiKeys: [
    { mask: 0x01, keyCode: 0x06, delay: 50 },   // Ctrl + C，之后等 50ms 再按 V
    { mask: 0, keyCode: 0x19, delay: 0 },       // V
  ],
};
const rec = serializeBtKeyRecord(cfg, 1, 1, true);
const groups = readGroups(rec);

check('组数 = 3（Ctrl / C / V）', rec[5] === 3, 'n=' + rec[5]);
check('第 1 步（Ctrl+C）所在组延时 0', groups[0]?.delay === 0 && groups[0]?.value === 0xF1, JSON.stringify(groups[0]));
check('第 2 步（V）延时 = 50ms —— 来自 C 之后的间隔',
  groups[2]?.delay === 50 && groups[2]?.value === 0x19, JSON.stringify(groups[2]));

const back = parseBtKeyRecord(rec, true);
check('回读 mode=4', back.mode === 4);
check('回读 2 个键位', back.multiKeys?.length === 2, JSON.stringify(back.multiKeys));
check('回读：Ctrl+C 的间隔 = 50ms', back.multiKeys?.[0]?.delay === 50, String(back.multiKeys?.[0]?.delay));
check('回读：最后一步间隔 = 0', back.multiKeys?.[1]?.delay === 0, String(back.multiKeys?.[1]?.delay));
check('回读：mask 仍是 Ctrl', back.multiKeys?.[0]?.mask === 0x01, String(back.multiKeys?.[0]?.mask));

// ---- 案例 2：客户现场 F5(0) → F8(1500) → F2(1500) ----
const rec2 = serializeBtKeyRecord({
  mode: 4,
  multiKeys: [
    { mask: 0, keyCode: 0x3E, delay: 0 },      // F5
    { mask: 0, keyCode: 0x41, delay: 1500 },   // F8
    { mask: 0, keyCode: 0x3B, delay: 1500 },   // F2
  ],
}, 1, 1, true);
const g2 = readGroups(rec2);
check('F5 组延时 0', g2[0]?.delay === 0, String(g2[0]?.delay));
check('F8 组延时 0（F5 之后无间隔）', g2[1]?.delay === 0, String(g2[1]?.delay));
check('F2 组延时 1500（F8 之后的间隔，落在 F8→F2 之间）', g2[2]?.delay === 1500, String(g2[2]?.delay));

const back2 = parseBtKeyRecord(rec2, true);
check('回读：F5 间隔 0 / F8 间隔 1500 / F2 间隔 0',
  back2.multiKeys?.[0]?.delay === 0 && back2.multiKeys?.[1]?.delay === 1500 && back2.multiKeys?.[2]?.delay === 0,
  JSON.stringify(back2.multiKeys?.map((k) => k.delay)));

// ---- 案例 3：上限裁剪 ----
const big = serializeBtKeyRecord({ mode: 4, multiKeys: [
  { mask: 0, keyCode: 0x04, delay: 99999 },
  { mask: 0, keyCode: 0x05, delay: 0 },
] }, 2, 1, true);
const gb = readGroups(big);
check('delay 超限被钳到 60000', gb[1]?.delay === 60000, 'delay=' + gb[1]?.delay);

// ---- 案例 4：单步多键（界面上会被折算成普通按键，这里只保证不炸）----
const one = serializeBtKeyRecord({ mode: 4, multiKeys: [{ mask: 0, keyCode: 0x04, delay: 50 }] }, 1, 1, true);
check('单步多键：1 个组且延时 0', one[5] === 1 && readGroups(one)[0]?.delay === 0, JSON.stringify(readGroups(one)));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
