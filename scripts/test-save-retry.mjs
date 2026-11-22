// 回归测试：新协议保存的「偶发 Response timeout」加固
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const np = readFileSync('src/services/new-protocol.js', 'utf8');
const ui = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
const i18n = readFileSync('src/i18n.js', 'utf8');

// ---- 1) 单键写入重试 ----
check('有 writeWithRetry 包装', np.includes('const writeWithRetry = async (fn, label, attempts = 3)'));
check('重试默认 3 次', np.includes('attempts = 3'));
check('每次尝试前 drain（清过期响应）', /const writeWithRetry[\s\S]{0,400}this\._drain\(150\)/.test(np));
check('重试之间退避 400ms', /attempts; a \+= 1\)[\s\S]{0,600}setTimeout\(r, 400\)/.test(np));
check('写键走重试', np.includes('writeWithRetry(() => this.writeKey(layer, i, cfg), stepLabel)'));
check('清键走重试', np.includes('writeWithRetry(() => this.clearKey(layer, i), stepLabel)'));
check('写宏走重试', np.includes('writeWithRetry(() => this.writeMacro(layer, i, cfg.macroSteps), stepLabel)'));
check('失败信息带"已重试 3 次"', np.includes('（已重试 3 次）'));

// ---- 2) ACK 超时缩短（失败快、重试快）----
check('WRITE_KEY ACK 超时 8s', np.includes('_waitForAck(CMD.WRITE_KEY, layer, actionIdx, 8000)'));
check('CLEAR_KEY ACK 超时 8s', np.includes('_waitForAck(CMD.CLEAR_KEY, layer, actionIdx, 8000)'));
check('WRITE_MACRO ACK 超时 8s', np.includes('_waitForAck(CMD.WRITE_MACRO, layer, actionIdx, 8000)'));
check('不再有 20s 的写 ACK 超时', !np.includes('actionIdx, 20000'));

// ---- 3) 保存前先确认设备在线 ----
check('保存前发 DEV_INFO 预检', /saveAll\(layer, keyConfigs, currentLayer\)[\s\S]{0,600}_sendPacket\(CMD\.READ_DEVICE_INFO/.test(np));
check('预检 1.5s 超时', np.includes('b[0] === CMD.READ_DEVICE_INFO || b[0] === CMD.NAK, 1500'));
check('离线提示明确（睡眠/断开/蓝牙）', np.includes('键盘没有响应（可能在睡眠或已断开）'));

// ---- 4) UI 提示与看门狗 ----
check('UI 对超时类错误追加排查提示', ui.includes('如果反复出现：换一个 USB 口 / 换数据线'));
check('只在超时类错误时提示（普通 NAK 不打扰）', ui.includes('const isTimeout = /timeout|没有响应|未响应/i.test(msg)'));
check('新协议看门狗放宽到 300s（含重试）', ui.includes('}, 300000);'));

// ---- 5) 英文 ----
check('英文：排查提示', i18n.includes("'如果反复出现：换一个 USB 口 / 换数据线；关掉其它连接这个键盘的设备（蓝牙、其它浏览器页面）后重试。':"));
check('英文：离线提示', i18n.includes("'键盘没有响应（可能在睡眠或已断开）：请拔插 USB 线后重试；若同时连着蓝牙，请先断开蓝牙':"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
