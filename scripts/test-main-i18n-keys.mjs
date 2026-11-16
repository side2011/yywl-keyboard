// 回归测试：桌面主进程里每一处 mt('key') 都要在 zh/en 两个字典里存在
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const src = readFileSync('desktop-main.cjs', 'utf8');

// 提取 MAIN_I18N 块
const start = src.indexOf('const MAIN_I18N = {');
const end = src.indexOf('\n};', start);
check('找到 MAIN_I18N', start >= 0 && end > start);
const block = src.slice(start, end);

// 分 zh / en 两段
const zhStart = block.indexOf('zh: {');
const enStart = block.indexOf('en: {');
const zhBlock = block.slice(zhStart, enStart);
const enBlock = block.slice(enStart);

const keysOf = (b) => new Set([...b.matchAll(/^\s{4}([A-Za-z]+):/gm)].map((m) => m[1]));
const zhKeys = keysOf(zhBlock);
const enKeys = keysOf(enBlock);
console.log('  zh keys=' + zhKeys.size + '  en keys=' + enKeys.size);

check('zh/en 键数量一致', zhKeys.size === enKeys.size, `${zhKeys.size} vs ${enKeys.size}`);
const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k));
const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k));
check('zh 有而 en 缺的键 = 0', onlyZh.length === 0, onlyZh.join(', '));
check('en 有而 zh 缺的键 = 0', onlyEn.length === 0, onlyEn.join(', '));

// 代码里用到的 key 必须都在字典里
const used = new Set([...src.matchAll(/\bmt\('([A-Za-z]+)'\)/g)].map((m) => m[1]));
console.log('  代码里 meta 调用 ' + used.size + ' 个键');
const missing = [...used].filter((k) => !zhKeys.has(k));
check('mt() 用到的键全部有定义', missing.length === 0, missing.join(', '));

// 值不能为空、en 值不能含中文
let emptyZh = 0;
let cnInEn = 0;
for (const m of zhBlock.matchAll(/^\s{4}([A-Za-z]+): '([^']*)'/gm)) if (!m[2].trim()) emptyZh += 1;
for (const m of enBlock.matchAll(/^\s{4}([A-Za-z]+): '([^']*)'/gm)) if (/[\u4e00-\u9fa5]/.test(m[2])) cnInEn += 1;
check('zh 值没有空串', emptyZh === 0, String(emptyZh));
check('en 值不含中文', cnInEn === 0, String(cnInEn));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
