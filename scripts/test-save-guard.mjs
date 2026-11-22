// 回归测试：全部清除后未设置就点「保存到键盘」必须被拦住 + 保存看门狗
import { readFileSync } from 'node:fs';
import { isCfgEmpty, allCfgEmpty, allLayersEmpty } from '../src/services/config-empty.js';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---------- 1) 空配置判定 ----------
check('null 视为空', isCfgEmpty(null) === true);
check('mode=0 视为空', isCfgEmpty({ mode: 0 }) === true);
check('只有修饰键不算空（Ctrl 单独一个键）', isCfgEmpty({ mode: 1, modifier: 1, modifierMask: 1 }) === false);
check('普通按键不算空', isCfgEmpty({ mode: 1, keyCode: 4 }) === false);
check('多媒体键不算空', isCfgEmpty({ mode: 2, mediaCode: 0xE9 }) === false);
check('鼠标动作不算空（新字段）', isCfgEmpty({ mode: 3, mouseButton: 1 }) === false);
check('鼠标动作不算空（旧对象字段）', isCfgEmpty({ mode: 3, mouse: { btn: 1 } }) === false);
check('多键合一有步骤不算空', isCfgEmpty({ mode: 4, multiKeys: [{ keyCode: 4 }] }) === false);
check('多键合一全是空槽仍算空', isCfgEmpty({ mode: 4, multiKeys: [{ keyCode: 0 }, null] }) === true);
check('全部清除后的整层是空', allCfgEmpty([{ mode: 0 }, { mode: 1, keyCode: 0, modifier: 0 }, null]) === true);
check('有一个按键就不算空', allCfgEmpty([{ mode: 0 }, { mode: 1, keyCode: 12 }]) === false);
check('多层都空 → true', allLayersEmpty([[{ mode: 0 }], [null]]) === true);
check('任一层有配置 → false', allLayersEmpty([[{ mode: 0 }], [{ mode: 1, keyCode: 9 }]]) === false);

// ---------- 2) 三个配置页都加了拦截 ----------
const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
const np = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
const kb = readFileSync('src/components/KeyboardConfigurator.jsx', 'utf8');

const guardMsg = '还没有设置任何按键，请先设置好再点「保存到键盘」';
check('蓝牙页：空配置拦截', bt.includes(guardMsg) && bt.includes('allLayersEmpty(snapshot)'));
check('蓝牙页：拦截发生在 setLoading 之前（不发指令）', bt.indexOf('allLayersEmpty(snapshot)') < bt.indexOf("toast.loading(t('正在保存配置到键盘...'), { id: 'bt-save' })"));
check('蓝牙页：改过灯光仍可保存（ledDirty 例外）', bt.includes('!ledDirty'));
check('新协议页：空配置拦截', np.includes(guardMsg) && np.includes('allLayersEmpty(snapshot)'));
check('新协议页：拦截在 isSavingRef 置位之前', np.indexOf('allLayersEmpty(snapshot)') < np.indexOf('isSavingRef.current = true'));
check('旧协议页：空配置拦截', kb.includes(guardMsg) && kb.includes('allCfgEmpty(keyConfigs)'));
check('旧协议页：只改灯光时仍允许保存', kb.includes('!(hasRgb && rgbMode)'));

// ---------- 3) 看门狗 ----------
check('蓝牙页有保存看门狗', bt.includes('__saveWatchdog') && bt.includes('保存超时：键盘没有响应'));
check('新协议页有保存看门狗', np.includes('__saveWatchdog') && np.includes('保存超时：键盘没有响应'));
check('旧协议页有保存看门狗', kb.includes('__saveWatchdog') && kb.includes('保存超时：键盘没有响应'));
check('看门狗在 finally 里被清除', bt.includes('clearTimeout(__saveWatchdog)') && np.includes('clearTimeout(__saveWatchdog)') && kb.includes('clearTimeout(__saveWatchdog)'));

// ---------- 4) 文案有英文 ----------
const i18n = readFileSync('src/i18n.js', 'utf8');
check('英文：空配置提示', i18n.includes("'还没有设置任何按键，请先设置好再点「保存到键盘」':"));
check('英文：保存超时提示', i18n.includes("'保存超时：键盘没有响应，请拔插 USB 线后重试':"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
