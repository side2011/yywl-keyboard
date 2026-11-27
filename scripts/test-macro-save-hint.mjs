// 回归测试：新协议「宏太大导致 Flash 没写进去」必须有提示
import { readFileSync } from 'node:fs';
import { readFileSync as rf } from 'node:fs';
// new-protocol.js 里 import 的是无扩展名路径（vite 能解析、node 不行），
// 这里只把 estimateMacroUsage 函数体抽出来求值，避免拉起整模块。
const protoSrc = rf('src/services/new-protocol.js', 'utf8');
const fnStart = protoSrc.indexOf('export function estimateMacroUsage');
const fnEnd = protoSrc.indexOf('\n}\n', fnStart) + 3;
const fnCode = protoSrc.slice(fnStart, fnEnd).replace('export function', 'function');
const estimateMacroUsage = new Function(fnCode + '; return estimateMacroUsage;')();

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---------- 1) 宏体积估算 ----------
const mk = (steps) => ({ mode: 5, macroSteps: Array.from({ length: steps }, () => ({ action: 1, keyCode: 4 })) });
const usage = estimateMacroUsage([mk(10), { mode: 1, keyCode: 5 }, null, mk(3)]);
check('统计宏键数量', usage.macroKeys === 2, String(usage.macroKeys));
check('单键字节 = 9 + 1 + 步数×4（10 步 = 50 字节）', usage.perKey[0].bytes === 50, String(usage.perKey[0].bytes));
check('合计字节 = 50 + 22', usage.totalBytes === 72, String(usage.totalBytes));
check('最大键字节 = 50', usage.maxKeyBytes === 50, String(usage.maxKeyBytes));
check('最大键下标 = 0', usage.maxKeyIdx === 0, String(usage.maxKeyIdx));
check('普通键/空配置不参与统计', estimateMacroUsage([{ mode: 1 }, null]).totalBytes === 0);
check('空步骤的宏键不计入', estimateMacroUsage([{ mode: 5, macroSteps: [] }]).macroKeys === 0);
check('大宏能算出来（200 步 = 810 字节）', estimateMacroUsage([mk(200)]).totalBytes === 810, String(estimateMacroUsage([mk(200)]).totalBytes));

// ---------- 2) 协议层：NAK 文案 + Flash 失败提示 ----------
const proto = readFileSync('src/services/new-protocol.js', 'utf8');
check('NAK 0x03 说明含"Flash 写入失败"', proto.includes('设备 Flash 写入失败（数据可能太大，只留在了内存里）'));
check('NAK 0x04 说明含"存储空间不足"', proto.includes('设备存储空间不足（宏数据太大，没能写进 Flash）'));
check('saveLayer 失败信息含"拔掉线后会丢失"', proto.includes('保存到 Flash 失败（拔掉线后会丢失）'));
check('SAVE_LAYER ACK 有日志', proto.includes("SAVE_LAYER ACK（设备已确认写入）"));

// ---------- 3) 界面：保存前体积提示 + 失败提示 + 成功建议 ----------
const ui = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
check('引用了 estimateMacroUsage', ui.includes("import { estimateMacroUsage }"));
check('保存前有体积阈值判断', ui.includes('MACRO_WARN_TOTAL') && ui.includes('MACRO_WARN_PER_KEY'));
check('超阈值弹确认框（仍然保存/取消）', ui.includes('open={!!macroWarn}') && ui.includes("t('仍然保存')"));
check('确认后带 skipMacroWarn 继续保存', ui.includes('handleSaveToDevice({ skipMacroWarn: true })'));
check('保存成功后提醒拔插验证', ui.includes('np-macro-hint'));
check('容量类错误单独提示', ui.includes("isCapacity") && ui.includes('这是设备存储空间不足'));

// ---------- 4) 英文 ----------
const i18n = readFileSync('src/i18n.js', 'utf8');
check('英文：宏太大提示', i18n.includes("'宏数据较大，可能存不进设备':"));
check('英文：仍要保存', i18n.includes("'仍然保存':"));
check('英文：拔插验证建议', i18n.includes("'本层宏数据较大（约 {n} 字节）"));
check('英文：容量不足说明', i18n.includes("'这是设备存储空间不足：宏数据太大，没能写进 Flash（拔掉线后会丢失）。请减少宏步骤、或删掉部分宏后再保存。':"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
