// 功能级验证：真正跑一遍存储逻辑（伪造 localStorage）
// 验证 2 键设备看不到 6 键配置、老 AC632N 数据会按机型迁移
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

// 伪造 localStorage
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const src = readFileSync('src/services/config-storage.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-config-storage.cjs');
writeFileSync(file, out);
const require = createRequire(import.meta.url);
const store = require(file);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const mkCfg = (n) => Array.from({ length: n }, () => ({ mode: 1, keyCode: 4, modifier: 0 }));

// 老数据：只有 keyboardId=AC632N，没有 modelKey（6 键、2 键各一条）
localStorage.setItem('yywl_keyconfigs', JSON.stringify([
  { id: 'old6', configName: '键帽标识', keyboardId: 'AC632N', keyConfigs: mkCfg(6), layers: [mkCfg(6)] },
  { id: 'old2', configName: '二键测试', keyboardId: 'AC632N', keyConfigs: mkCfg(2), layers: [mkCfg(2)] },
]));

// 迁移后：6 键归 6K，2 键归 2K
const moved = store.migrateLegacyModelKeys('AC632N');
check('迁移 2 条老配置', moved === 2, String(moved));
check('6K 列表只有 6 键那条', store.getConfigs('6K').map((c) => c.id).join(',') === 'old6', store.getConfigs('6K').map((c) => c.id).join(','));
check('2K 列表只有 2 键那条', store.getConfigs('2K').map((c) => c.id).join(',') === 'old2', store.getConfigs('2K').map((c) => c.id).join(','));
check('AC632N 下已无残留', store.getConfigs('AC632N').length === 0, String(store.getConfigs('AC632N').length));
check('再次迁移不重复（幂等）', store.migrateLegacyModelKeys('AC632N') === 0);

// 新增：不同机型可同名，同机型不可同名
store.addConfig({ configName: '共用名', keyboardId: 'AC632N', modelKey: '2K', keyConfigs: mkCfg(2) });
store.addConfig({ configName: '共用名', keyboardId: 'AC632N', modelKey: '6K', keyConfigs: mkCfg(6) });
check('不同机型允许同名', store.getConfigs('2K').some((c) => c.configName === '共用名') && store.getConfigs('6K').some((c) => c.configName === '共用名'));
let dupRejected = false;
try { store.addConfig({ configName: '共用名', keyboardId: 'AC632N', modelKey: '6K', keyConfigs: mkCfg(6) }); } catch { dupRejected = true; }
check('同机型同名被拒', dupRejected);
check('2K 列表仍是 2 条（老+新）', store.getConfigs('2K').length === 2, String(store.getConfigs('2K').length));
check('6K 列表仍是 2 条（老+新）', store.getConfigs('6K').length === 2, String(store.getConfigs('6K').length));

// 导出按机型
const exported = JSON.parse(store.exportConfigs('2K'));
check('导出只含 2K 的配置', exported.length === 2 && exported.every((c) => (c.modelKey || c.keyboardId) === '2K'), String(exported.length));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
