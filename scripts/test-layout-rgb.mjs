// 回归测试：8 键款 4x2 布局 + 老协议灯光读取重试
// 用法: node scripts/test-layout-rgb.mjs
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const hid = readFileSync('src/services/hid-constants.js', 'utf8');
const kc = readFileSync('src/components/KeyboardConfigurator.jsx', 'utf8');

// ---- 8 键机型都标了 grid4x2 ----
for (const model of ['8K', '8KDZ6', '8K-new']) {
  const re = new RegExp(`'${model}':\\s*\\{[^}]*layout:\\s*'grid4x2'`);
  check(`${model} 标记为 grid4x2`, re.test(hid));
}
check('8 键 modelId 仍为 3 个（没误改别的机型）',
  (hid.match(/keyCount: 8,/g) || []).length >= 3);

// ---- 渲染：8 键 = 4 列 ----
check('布局按 grid4x2 走 4 列',
  kc.includes("layout === 'grid4x2' || keyCount === 8 ? 4 : 3"));
check('≤4 键仍单排', kc.includes('keyCount <= 4 ? keyCount :'));

// ---- 老协议灯光读取重试 ----
check('有 rgbSeenRef 标记', kc.includes('const rgbSeenRef = useRef(false);'));
check('收到 rgb_mode 时置位', kc.includes('rgbSeenRef.current = true;'));
check('读取最多重试 3 次', kc.includes('const MAX_TRY = 3;'));
check('每次重试前重置标记', kc.includes('rgbSeenRef.current = false;'));
check('有重试等待（避开刚上电忙期）', /setTimeout\(r, 350 \+ attempt \* 150\)/.test(kc));
check('只有支持灯光的机型才重试', kc.includes('if (!hasRgb || rgbSeenRef.current) break;'));
check('最终没读到只告警、不报错', kc.includes('灯光模式始终没读到，界面保持默认'));

// ---- 不影响其它协议 ----
const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
check('蓝牙款未引入 rgbSeenRef（协议隔离）', !bt.includes('rgbSeenRef'));
const np = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
check('新协议未引入 rgbSeenRef（协议隔离）', !np.includes('rgbSeenRef'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
