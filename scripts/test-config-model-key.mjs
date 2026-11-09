// 回归测试：网页导出的配置要带 modelKey，快速配置导入要按 modelKey/机型归一
// 现场事故：6 键新协议配置导进快速配置后挂在「AC632N」组里，永远"非当前机型"
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- 网页端 ----
const store = readFileSync('src/services/config-storage.js', 'utf8');
check('存储层 addConfig 接受 modelKey', store.includes('modelKey, keyConfigs') && store.includes('modelKey: modelKey || keyboardId'));
check('存储层 updateConfig 保留 modelKey', store.includes('modelKey: modelKey || all[idx].modelKey || keyboardId'));

const panel = readFileSync('src/components/ConfigListPanel.jsx', 'utf8');
check('ConfigListPanel 透传 modelKey（保存）', panel.includes('modelKey: modelKey || modelId'));
check('ConfigListPanel 透传 modelKey（更新）', panel.split('modelKey: modelKey || modelId').length - 1 >= 2);

const np = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
check('新协议页给 ConfigListPanel 传 ${keyCount}K', np.includes('modelKey={`${keyCount}K'));
check('新协议页仍保留 keyboardId=AC632N（向后兼容）', np.includes("modelId={modelId || 'AC632N'}"));

const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
check('蓝牙页 modelId 仍是 BT-x+y', bt.includes('modelId={`BT-${keyCount}+${knobCount}`}'));

// ---- 快速配置端 ----
const qc = readFileSync('quick-config/src/App.jsx', 'utf8');
check('quick-config 有 normModelKey', qc.includes('const normModelKey'));
check('优先使用 modelKey', qc.includes('if (cfg.modelKey) return String(cfg.modelKey);'));
check('AC632N 归一成 nK', qc.includes("if (/^AC\\d/i.test(kid)) return `${n}K`;"));
check('导入存盘用 normModelKey', qc.includes('const mk = normModelKey(cfg, cfgProto, n);'));
check('inferProto 优先看 modelKey', qc.includes("if (String(cfg.modelKey || '').startsWith('BT-')) return 'bt';"));

// 与 getModelKey 对齐：新协议设备的 key = `${keyCount}K` (+E/L)
check('getModelKey 新协议仍生成 nK(-En-Lm)', qc.includes('const parts = [`${info.keyCount}K`];'));

// ---- 版本号 ----
const pkg = JSON.parse(readFileSync('quick-config/package.json', 'utf8'));
check('quick-config 版本号 = 1.1.17', pkg.version === '1.1.17', pkg.version);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
