// 回归测试：配置列表必须按「机型」分开，不能所有新协议款共用 AC632N 一个列表
// 现场事故：2 键新协议设备上看到 6 键的配置（键帽标识 6 键）
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const store = readFileSync('src/services/config-storage.js', 'utf8');
const panel = readFileSync('src/components/ConfigListPanel.jsx', 'utf8');
const np = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
const kc = readFileSync('src/components/KeyboardConfigurator.jsx', 'utf8');

// ---- 存储层 ----
check('有 scopeKeyOf（modelKey 优先，回落 keyboardId）',
  store.includes('function scopeKeyOf(c)') && store.includes('return c.modelKey || c.keyboardId;'));
check('getConfigs 按作用域过滤', store.includes('scopeKeyOf(c) === key'));
check('新增判重按作用域（不同机型可同名）',
  store.includes('scopeKeyOf(c) === (modelKey || keyboardId)'));
check('更新判重按作用域', store.includes('scopeKeyOf(c) === (modelKey || keyboardId) && c.id !== id'));
check('导出按作用域', store.includes('export function exportConfigs(key)') && store.includes('getConfigs(key)'));
check('导入判重按作用域', store.includes('scopeKeyOf(c) === scopeKeyOf(cfg)'));
check('有老数据迁移函数', store.includes('export function migrateLegacyModelKeys(protocolId)'));
check('迁移按键数生成 nK', store.includes('c.modelKey = `${n}K`;'));

// ---- 面板 ----
check('面板用 scopeKey（modelKey 优先）', panel.includes('const scopeKey = modelKey || modelId;'));
check('列表面板按 scopeKey 取数', panel.includes('setConfigs(getConfigs(scopeKey))'));
check('新协议页会迁移老 AC632N 配置', panel.includes('migrateLegacyModelKeys(modelId)'));
check('导出用 scopeKey', panel.includes('exportConfigs(scopeKey)'));

// ---- 各页面传入的机型 key ----
check('新协议页传 modelKey=${keyCount}K', np.includes('modelKey={`${keyCount}K'));
check('蓝牙页仍是 BT-x+y（本来就是机型级）', bt.includes('modelId={`BT-${keyCount}+${knobCount}`}'));
check('老协议页仍按具体型号', kc.includes('modelId={modelId}'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
