// 连接引导弹窗的结构回归测试：用 React 服务端渲染出静态 HTML 再断言。
// 这样不需要浏览器也能验证：文案、步骤、动画节点、无障碍属性是否齐全。
// 用法: node scripts/test-connect-guide.cjs
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'components', 'ConnectGuide.jsx');

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name); }
};

function loadComponent() {
  const src = fs.readFileSync(SRC, 'utf8');
  const code = esbuild.transformSync(src, {
    loader: 'jsx', format: 'cjs', jsx: 'automatic', target: 'node18',
  }).code;
  const tmp = path.join(ROOT, 'node_modules', '.cache-connect-guide.cjs');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, code);
  delete require.cache[tmp];
  const mod = require(tmp);
  return mod.default || mod;
}

const ConnectGuideModal = loadComponent();
const render = (props) => renderToStaticMarkup(React.createElement(ConnectGuideModal, props));

// 1) 关闭时不渲染
check('open=false 不渲染任何内容', render({ open: false, lang: 'zh' }) === '');

// 2) 中文弹窗
const zh = render({ open: true, lang: 'zh' });
const zhExpect = [
  ['标题', '接下来会弹出'],
  ['副标题', '浏览器的安全授权'],
  ['步骤① 选设备', 'USB Keyboard'],
  ['步骤② 点连接', '【连接】'],
  ['步骤③ 拔插重试', '拔插 USB 线'],
  ['取消说明', '不会进入配置页'],
  ['无弹窗提示', 'Chrome / Edge'],
  ['不再提示', '不再提示'],
  ['主按钮', '我知道了，开始选择'],
];
for (const [name, kw] of zhExpect) check(name + '：' + kw, zh.includes(kw));
check('4 段动画节点齐全', ['yy-p1', 'yy-p2', 'yy-p3', 'yy-p4'].every((c) => zh.includes(c)));
check('三段步骤序号（圆圈 1/2/3，不再重复 ①②③）',
  ['yy-guide-num">1<', 'yy-guide-num">2<', 'yy-guide-num">3<'].every((c) => zh.includes(c))
  && !zh.includes('①'));
check('设备名说明是通用描述（不写死 USB Keyboard 一种）', zh.includes('你的键盘') && zh.includes('USB Keyboard / YYWL'));
check('遮罩层 class', zh.includes('yy-guide-mask'));
check('无障碍 aria-modal', zh.includes('aria-modal="true"'));
check('对话框角色', zh.includes('role="dialog"'));

// 3) 英文弹窗
const en = render({ open: true, lang: 'en' });
check('英文标题', en.includes('Select a device'));
check('英文主按钮', en.includes('Got it, open the picker'));

// 4) 未知语言回退英文/中文都不能崩
const fallback = render({ open: true, lang: 'fr' });
check('未知语言不崩溃且回退中文', fallback.includes('接下来会弹出'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
