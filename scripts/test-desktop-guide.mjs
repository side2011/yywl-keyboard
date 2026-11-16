// 回归测试：桌面版（UA 带 YYWLDesktop）不弹「选择设备」引导
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const src = readFileSync('src/components/KeyboardConnector.jsx', 'utf8');

check('有桌面版判断（UA 含 YYWLDesktop）', /isOwnDesktopHost = \/YYWLDesktop\/i\.test/.test(src));
check('点击连接时桌面版直接连（不弹引导）',
  src.includes('if (isOwnDesktopHost) { connectToKeyboard(); return; }'));
check('引导弹窗在桌面版强制关闭', src.includes('open={guideOpen && !isOwnDesktopHost}'));
check('「再看一次连接提示」对桌面版隐藏', src.includes('{guideSkipped && !isOwnDesktopHost && ('));
check('全局只有一个桌面版判断（无重复/阴影）',
  (src.match(/YYWLDesktop\/i\.test/g) || []).length === 1,
  String((src.match(/YYWLDesktop\/i\.test/g) || []).length));
check('浏览器版仍会弹引导（guideSkipped 判断还在）',
  src.includes('if (!guideSkipped && hidSupported) { setGuideOpen(true); return; }'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
