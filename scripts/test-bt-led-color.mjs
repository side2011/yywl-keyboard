// 灯光颜色索引：必须按调色板顺序（红=1 … 青=5 … 紫=7），不是"红=5"
// 用法: node scripts/test-bt-led-color.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-bt-led-color.cjs');
writeFileSync(file, out);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { btColorIndex, BT_LED_COLORS } = require(file);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const idx = (rgb) => btColorIndex([{ r: rgb[0], g: rgb[1], b: rgb[2] }]);
check('红 → 1', idx([255, 0, 0]) === 1, String(idx([255, 0, 0])));
check('橙 → 2', idx([255, 128, 0]) === 2);
check('黄 → 3', idx([255, 255, 0]) === 3);
check('绿 → 4', idx([0, 255, 0]) === 4);
check('青 → 5', idx([0, 255, 255]) === 5);
check('蓝 → 6', idx([0, 0, 255]) === 6);
check('紫 → 7', idx([128, 0, 255]) === 7);
check('调色板共 7 色', BT_LED_COLORS.length === 7);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);