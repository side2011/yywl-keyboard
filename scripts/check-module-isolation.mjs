// 模块隔离检查：蓝牙(bt) / 新协议(new) / 老协议(old) 三个协议模块互不侵入
//
// 背景：蓝牙无线款(16 键旧固件)的 K16 定位、单独修饰键编码、灯光 nibble 格式等修复，
//       必须只落在蓝牙模块里；不能顺手改到新协议/老协议共用的地方。
//
// 检查项：
//   1) 三个协议实现文件互不 import
//   2) 蓝牙专有常量/函数（BT_MOD_TOKENS / BT_LED_MODES / isBtWirelessDevice /
//      parseBtKeyRecord / serializeBtKeyRecord / pickBestRecord / BtProtocolHandler）
//      只允许出现在蓝牙相关文件里
//   3) 老协议页面（KeyboardConfigurator）不 import 蓝牙或新协议实现
//   4) 新协议页面（NewProtoConfigurator）不 import 蓝牙实现
//   5) hid-constants.js 保持"纯常量"，不 import 任何协议实现
//
// 用法: node scripts/check-module-isolation.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const read = (f) => readFileSync(f, 'utf8');
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
};

// ---- 1) 协议实现互不引用 ----
const btImpl = join(SRC, 'services', 'bt-protocol.js');
const newImpl = join(SRC, 'services', 'new-protocol.js');
const btSrc = read(btImpl);
const newSrc = read(newImpl);

check('bt-protocol.js 不引用新协议实现', !/from\s+['"].*new-protocol/.test(btSrc));
check('new-protocol.js 不引用蓝牙实现', !/from\s+['"].*bt-protocol/.test(newSrc));

// ---- 2) 蓝牙专有标识符只能出现在蓝牙文件里 ----
const BT_ONLY = [
  'BT_MOD_TOKENS',
  'BT_LED_MODES',
  'BT_MEDIA_KEYS',
  'BT_MOUSE_ACTIONS',
  'isBtWirelessDevice',
  'BtProtocolHandler',
  'parseBtKeyRecord',
  'serializeBtKeyRecord',
  'serializeBtClearRecord',
  'pickBestRecord',
];
const BT_FILES = new Set([
  'src/services/bt-protocol.js',
  'src/components/BtConfigurator.jsx',
  'src/components/BtVirtualKeyboard.jsx',
  'src/components/KeyboardConnector.jsx', // 负责识别蓝牙款并路由，允许引用 isBtWirelessDevice/BtProtocolHandler
  'src/context/DeviceContext.jsx',        // 同上
]);
const leaks = [];
for (const f of files) {
  const r = rel(f);
  if (BT_FILES.has(r)) continue;
  const src = read(f);
  for (const id of BT_ONLY) {
    if (new RegExp(`\\b${id}\\b`).test(src)) leaks.push(`${r} 用了 ${id}`);
  }
}
check('蓝牙专有实现没有泄漏到其它模块', leaks.length === 0, leaks.join('\n      '));

// ---- 3) 老协议页面不引用蓝牙 / 新协议 ----
const oldPage = join(SRC, 'components', 'KeyboardConfigurator.jsx');
const oldSrc = read(oldPage);
check('老协议页面不引用蓝牙实现', !/bt-protocol/.test(oldSrc));
check('老协议页面不引用新协议实现', !/new-protocol/.test(oldSrc));

// ---- 4) 新协议页面不引用蓝牙实现 ----
const newPage = join(SRC, 'components', 'NewProtoConfigurator.jsx');
const newPageSrc = read(newPage);
check('新协议页面不引用蓝牙实现', !/bt-protocol/.test(newPageSrc));

// ---- 5) hid-constants 保持纯常量 ----
const hidConst = read(join(SRC, 'services', 'hid-constants.js'));
check('hid-constants.js 不 import 任何协议实现',
  !/from\s+['"].*(bt-protocol|new-protocol)/.test(hidConst));

// ---- 6) 蓝牙修复的关键点必须都在蓝牙模块内 ----
const btHasPositional = btSrc.includes('按"收到的第几条"定位') || btSrc.includes('键号字节');
const btHasModCount0 = /rec\[9\]\s*=\s*0;[\s\S]{0,200}rec\[10\]\s*=\s*\(cfg\.modifierMask/.test(btSrc);
const btHasNibble = btSrc.includes('旧-nibble') || btSrc.includes('旧固件(版本<10)');
check('K16 顺序定位逻辑在 bt-protocol.js 内', btHasPositional);
check('单独修饰键(组数=0)编码在 bt-protocol.js 内', btHasModCount0);
check('旧固件灯光 nibble 格式在 bt-protocol.js 内', btHasNibble);

check('新协议实现里没有蓝牙修复的痕迹',
  !newSrc.includes('键号字节') && !newSrc.includes('旧-nibble') && !newSrc.includes('modifierMask = '));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
