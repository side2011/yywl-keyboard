// 回归测试：渐变按钮必须带纯色兜底 + 旧浏览器兼容提示
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const SOLID = /bg-(indigo|violet|blue|cyan|teal|amber|orange|red|green|slate|gray|pink|rose|emerald|sky)-\d+/;

const offenders = [];
for (const f of walk('src')) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/bg-gradient-to-[a-z]+/.test(line)) return;
    if (!SOLID.test(line)) offenders.push(`${f}:${i + 1}`);
  });
}
check('所有渐变元素都有纯色兜底（渐变不渲染时按钮仍可见）', offenders.length === 0, offenders.join(', '));

const banner = readFileSync('src/components/BrowserCompatBanner.jsx', 'utf8');
check('兼容横幅检测 oklch 支持', banner.includes("css.supports('color', 'oklch(0 0 0)')"));
check('兼容横幅检测 @layer', banner.includes("css.supports('at-rule', '@layer')"));
check('兼容横幅检测渐变', banner.includes("'linear-gradient(to right, #000, #fff)'"));
check('横幅可关闭并记住', banner.includes("localStorage.setItem('yywl-compat-dismissed', '1')"));

const app = readFileSync('src/App.jsx', 'utf8');
check('App 里挂载了横幅', app.includes('<BrowserCompatBanner />'));

const i18n = readFileSync('src/i18n.js', 'utf8');
check('英文：兼容提示', i18n.includes("'检测到浏览器版本较旧，部分按钮/配色可能显示异常。建议升级到 Chrome / Edge 111 以上（或最新版），显示与保存功能会更稳。':"));
check('英文：知道了', i18n.includes("'知道了':"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
