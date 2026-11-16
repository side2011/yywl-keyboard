// 审计：找出 t('...') 用到但 i18n 英文表里没有的中文 key（这些在英文界面会露出中文）
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const i18n = fs.readFileSync('src/i18n.js', 'utf8');
// 取 en 字典里的 key（形如 '中文': 'English',）
const enKeys = new Set();
for (const m of i18n.matchAll(/^\s*'((?:[^'\\]|\\.)+)'\s*:/gm)) enKeys.add(m[1].replace(/\\'/g, "'"));

const files = walk('src').filter((f) => !f.endsWith('i18n.js'));
const missing = new Map();
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  // 匹配 t('...') / t("...") 里的字面量（不处理模板字符串）
  for (const m of txt.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)+)'/g)) {
    const key = m[1].replace(/\\'/g, "'");
    if (!/[\u4e00-\u9fa5]/.test(key)) continue;      // 只关心中文 key
    if (key.includes('${')) continue;                 // 跳过模板残留
    if (!enKeys.has(key)) {
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(path.relative('.', f));
    }
  }
  for (const m of txt.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)+)"/g)) {
    const key = m[1];
    if (!/[\u4e00-\u9fa5]/.test(key) || key.includes('${')) continue;
    if (!enKeys.has(key)) {
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(path.relative('.', f));
    }
  }
}

console.log('  i18n 英文条目: ' + enKeys.size + ' 条');
console.log('  缺失英文的 key: ' + missing.size + ' 条');
const list = [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh'));
for (const [k, files2] of list) {
  console.log('    - ' + JSON.stringify(k) + '   ← ' + [...files2].join(', '));
}
fs.writeFileSync(path.join(process.env.TEMP || '.', 'missing-i18n.json'), JSON.stringify(list.map(([k, f]) => ({ key: k, files: [...f] })), null, 2), 'utf8');
console.log('  明细已写入 %TEMP%\\missing-i18n.json');
