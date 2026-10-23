// 守护规则：无灯光判定只允许出现在「蓝牙配置页」/「快速配置的蓝牙分支」
//
// 背景：单键蓝牙款、6 键蓝牙款没有灯珠，界面要隐藏灯光；
//       但**单键 USB 款 / 6 键 USB 款是有灯光的**，绝不能被同一套判据误伤。
//
// 用法: node scripts/check-bt-led-scope.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
};

const read = (p) => readFileSync(p, 'utf8');

// ---------- 1. 网页：判据只能出现在 BtConfigurator ----------
const comps = readdirSync('src/components').filter((f) => f.endsWith('.jsx'));
const offenders = comps.filter((f) => {
  if (f === 'BtConfigurator.jsx') return false;
  return read(join('src/components', f)).includes('BT_NO_LED_KEYCOUNTS');
});
check('网页：BT_NO_LED_KEYCOUNTS 只在 BtConfigurator.jsx 出现', offenders.length === 0, offenders.join(', '));

const bt = read('src/components/BtConfigurator.jsx');
check('网页：蓝牙页判据包含 1 和 6 键', /BT_NO_LED_KEYCOUNTS\s*=\s*\[1,\s*6\]/.test(bt));
check('网页：层选项卡受 hasLighting 控制', bt.includes('...(hasLighting ? [{ label: t(\'灯光\'), mode: LED_TAB }] : [])'.replace(/'/g, "'")) || bt.includes('hasLighting ? [{ label'), '找不到选项卡条件');
check('网页：读灯光被 hasLighting 包住', /if \(hasLighting\) \{\s*\n\s*for \(let l = 0; l < layerCount/.test(bt));
check('网页：写灯光被 hasLighting 包住', /if \(hasLighting\) \{\s*\n\s*for \(let l = 0; l < btLayerCount/.test(bt));

// ---------- 2. 网页：USB 新协议页不受影响 ----------
const np = read('src/components/NewProtoConfigurator.jsx');
check('网页：新协议页没有 BT_NO_LED 判据', !np.includes('BT_NO_LED'));
check('网页：新协议页灯光仍按设备 backlightType 显示', np.includes('hasBacklight'));

// ---------- 3. 快速配置：判据必须与 proto === 'bt' 绑定 ----------
const app = read('quick-config/src/App.jsx');
check(
  '快速配置：hasLighting 显式限定 proto === \'bt\'',
  /const hasLighting = !\(proto === 'bt' && BT_NO_LED_KEYCOUNTS\.includes/.test(app),
);
check('快速配置：蓝牙灯光 UI 条件含 hasLighting', app.includes("{proto === 'bt' && hasLighting && ("));
check('快速配置：USB 旧协议灯光仍按 backlightType', app.includes("proto === 'old' && deviceInfo.backlightType > 0"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
