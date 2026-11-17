// 回归测试：旋钮左右对调开关（4+1 / 6+2 默认开启，用户可在主界面直接关掉）
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
const order = readFileSync('src/services/knob-order.js', 'utf8');
const i18n = readFileSync('src/i18n.js', 'utf8');

// ---- 1) 默认规则不变（其它款式不受影响）----
check('默认规则仍只含 4+1 与 6+2', /\(keys === 4 && knob === 1\) \|\| \(keys === 6 && knob === 2\)/.test(order));
check('无旋钮返回空数组', /if \(!knob\) return \[\];/.test(order));

// ---- 2) 存储键升版（旧的手动覆盖不会盖住新默认）----
check('swap 键为 bt-knob-swap7', bt.includes('bt-knob-swap7:'));
check('manual 键为 bt-knob-manual6', bt.includes('bt-knob-manual6:'));

// ---- 3) 主界面（物理按键卡片内）有开关 ----
const cardStart = bt.indexOf("{t('物理按键')}");
const cardEnd = bt.indexOf('{/* 操作 */}');
const card = bt.slice(cardStart, cardEnd);
check('开关在「物理按键」卡片里，无需打开固件信息', card.includes('toggleKnobSwap(n, e.target.checked)'));
check('开关文案：转左边却执行右转的动作？', card.includes('转左边却执行右转的动作？打开这个开关即可对调'));
check('单旋钮时显示「旋钮左右对调」', card.includes("t('旋钮左右对调')"));
check('多旋钮时按序号显示', card.includes("`${t('旋钮')} ${n + 1} ${t('左右对调')}`"));
check('开关只对带旋钮的款式显示', card.includes('{knobCount > 0 && ('));
check('勾选态绑定 knobSwap[n]', card.includes('checked={!!knobSwap[n]}'));

// ---- 4) 开关注释说明了用途 ----
check('注释说明按型号记住', card.includes('按型号记住'));

// ---- 5) 英文翻译齐备 ----
check('英文：转左边却执行右转的动作', i18n.includes("'转左边却执行右转的动作？打开这个开关即可对调':"));
check('英文：旋钮左右对调', i18n.includes("'旋钮左右对调':"));
check('英文：按型号记住', i18n.includes("'按型号记住，换电脑需重新设置':"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
