// 提取 actions.html 里的中文片段（文本节点 / 属性 / JS 字面量），用于做英文映射
const fs = require('fs');
const html = fs.readFileSync('public/actions.html', 'utf8');
const set = new Set();

// 1) 文本节点里的中文片段（粗略：>...< 之间的内容，含模板 ${} 的跳过）
for (const m of html.matchAll(/>([^<>]*[\u4e00-\u9fa5][^<>]*)</g)) {
  const s = m[1].trim();
  if (s && !s.includes('${')) set.add(s);
}
// 2) 属性值里的中文
for (const m of html.matchAll(/(?:title|placeholder|aria-label)="([^"]*[\u4e00-\u9fa5][^"]*)"/g)) {
  const s = m[1].trim();
  if (s && !s.includes('${')) set.add(s);
}
// 3) JS 字符串字面量（'...' 或 "..." 含中文）
for (const m of html.matchAll(/'([^'\n]*[\u4e00-\u9fa5][^'\n]*)'/g)) {
  const s = m[1].trim();
  if (s && !s.includes('${')) set.add(s);
}
for (const m of html.matchAll(/"([^"\n]*[\u4e00-\u9fa5][^"\n]*)"/g)) {
  const s = m[1].trim();
  if (s && !s.includes('${')) set.add(s);
}

const list = [...set].sort((a, b) => b.length - a.length);
console.log('  唯一中文片段: ' + list.length + ' 条');
const out = list.map((s) => ({ zh: s }));
fs.writeFileSync(process.env.TEMP + '\\actions-zh.json', JSON.stringify(out, null, 2), 'utf8');
list.slice(0, 40).forEach((s) => console.log('    | ' + s.slice(0, 90)));
console.log('  ...');
console.log('  完整列表: %TEMP%\\actions-zh.json');
