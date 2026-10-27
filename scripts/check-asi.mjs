// 启动自检：防止 `foo()` 换行后紧跟 `(function…` 被 ASI 解析成"调用返回值"
// （真实事故：main.jsx 里 installLogCapture() 少了分号 → 整站白屏）
// 用法: node scripts/check-asi.mjs
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
};

const src = readFileSync('src/main.jsx', 'utf8');
check('installLogCapture 后带分号', /installLogCapture\(\s*\ \*;/.test(src) || src.includes('installLogCapture();'));
check('IIFE 有前置分号', src.includes(';(function warnLegacyBrowser'));
check('没有 ") 换行 (function" 的写法', !/\)\s*\n\s*\(function/.test(src));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
