// 回归测试：三个配置页都支持「拖到另一个按键上互换功能」
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- 共用 hook ----
const hook = readFileSync('src/services/key-drag-swap.js', 'utf8');
check('hook 导出 useKeyDragSwap', hook.includes('export function useKeyDragSwap'));
check('hook 导出 swapItems', hook.includes('export function swapItems'));
check('拖拽需要 setData（Firefox 兼容）', hook.includes("setData('text/plain'"));
check('dragover 里 preventDefault 才允许放下', hook.includes('e.preventDefault()'));
check('拖到自己身上不触发交换', hook.includes('from === i'));
check('disabled 时不响应拖拽', hook.includes('if (disabled) return;'));

// ---- 三个页面都接上了 ----
const pages = [
  ['新协议页', 'src/components/NewProtoConfigurator.jsx', 'handleSwapKeys'],
  ['蓝牙页', 'src/components/BtConfigurator.jsx', 'handleSwapSlots'],
  ['老协议页', 'src/components/KeyboardConfigurator.jsx', 'handleSwapKeys'],
];
for (const [label, file, fn] of pages) {
  const src = readFileSync(file, 'utf8');
  check(label + '：引入 useKeyDragSwap', src.includes('useKeyDragSwap'));
  check(label + '：有交换处理函数 ' + fn, src.includes(`const ${fn} = `));
  check(label + '：有拖拽视觉反馈（opacity-40）', src.includes("dragIndex === i ? 'opacity-40'") || src.includes("dragIndex === idx ? 'opacity-40'"));
  check(label + '：有放置高亮（ring-2 ring-indigo-400）', src.includes('ring-2 ring-indigo-400'));
  check(label + '：拖拽事件已绑定到卡片', src.includes('{...dragProps('));
}

// ---- 交换后要提示用户保存 ----
for (const [label, file] of pages) {
  const src = readFileSync(file, 'utf8');
  check(label + '：提示「记得点保存到键盘」', src.includes('记得点「保存到键盘」'));
}

// ---- swapItems 行为验证 ----（直接求值，避免打包）
const mod = hook.match(/export function swapItems[\s\S]*?\n}/);
check('找到 swapItems 实现', !!mod);
if (mod) {
  const fnSrc = mod[0].replace('export function swapItems', 'function swapItems');
  // eslint-disable-next-line no-eval
  const swapItems = eval(`(${fnSrc.replace('function swapItems', 'function')})`);
  const a = [{ v: 1 }, { v: 2 }, { v: 3 }];
  const b = swapItems(a, 0, 2);
  check('交换 0 和 2', b[0].v === 3 && b[2].v === 1 && b[1].v === 2, JSON.stringify(b.map((x) => x.v)));
  check('原数组不被修改', a[0].v === 1, String(a[0].v));
  check('交换同一位置不变', swapItems(a, 1, 1)[1].v === 2);
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
