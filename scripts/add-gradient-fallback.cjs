// 给所有渐变元素补一个"纯色底"兜底
//
// 背景：个别客户机器上（高对比度模式 / 老旧浏览器内核 / 部分 GPU 驱动），
// linear-gradient 不渲染，而按钮文字是白色 → 整个按钮看起来是"一块空白"。
// 渐变本身是用 background-image 画的；只要同时给 background-color，
// 渐变正常时看不出来（渐变盖在纯色上），渐变失效时就退化成纯色按钮，文字始终可见。
const fs = require('fs');

const files = [
  'src/components/BtConfigurator.jsx',
  'src/components/KeyboardConfigurator.jsx',
  'src/components/KeyboardConnector.jsx',
  'src/components/KeyTestPage.jsx',
  'src/components/MicGuidePage.jsx',
  'src/components/NewProtoConfigurator.jsx',
];

// from 色 → 兜底纯色（与渐变主色一致，深浅按文字颜色选）
const FALLBACK = {
  'indigo-600': 'bg-indigo-600',
  'indigo-500': 'bg-indigo-500',
  'indigo-50': 'bg-indigo-50',
  'amber-400': 'bg-amber-400',
  'red-500': 'bg-red-500',
  'blue-500': 'bg-blue-500',
  'slate-50': 'bg-slate-50',
  'gray-50': 'bg-gray-50',
  'gray-700': 'bg-gray-700',
};

let changed = 0;
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const before = c;
  // 逐行处理：只在该行有 bg-gradient-to-xxx 且还没有对应 bg-<from> 时补
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/bg-gradient-to-[a-z]+/.test(line)) continue;
    const from = (line.match(/from-([a-z]+-\d+)/) || [])[1];
    if (!from || !FALLBACK[from]) continue;
    const solid = FALLBACK[from];
    // 已经有同名纯色类就跳过（避免重复）
    if (new RegExp(`(^|[\\s"'$])${solid}([\\s"'\`]|$)`) .test(line)) continue;
    lines[i] = line.replace(/bg-gradient-to-([a-z]+)/, `${solid} bg-gradient-to-$1`);
  }
  c = lines.join('\n');
  if (c !== before) {
    fs.writeFileSync(f, c);
    changed += 1;
    console.log('  已补兜底底色: ' + f);
  }
}
console.log('  共修改 ' + changed + ' 个文件');
