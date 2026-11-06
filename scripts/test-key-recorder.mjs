// 回归测试：多键合一「录制」只影响老协议与蓝牙款，且协议转换正确
// 用法: node scripts/test-key-recorder.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

// 把 key-recorder.js + hid-constants.js 打成一个 CJS 供测试
const rec = readFileSync('src/services/key-recorder.js', 'utf8');
const hid = readFileSync('src/services/hid-constants.js', 'utf8');
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export { toOldProtocolCode, oldProtocolGlobalModifier, DEFAULT_STEP_DELAY_MS } from './src/services/key-recorder.js';
      export { HID_TO_CS_SHIFTED, BROWSER_CODE_TO_HID, BROWSER_MOD_TO_BIT } from './src/services/hid-constants.js';
    `,
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
});
const outFile = resolve('node_modules', '.cache-key-recorder.cjs');
const fsmod = await import('node:fs');
fsmod.default.writeFileSync(outFile, bundle.outputFiles[0].text);
const { toOldProtocolCode, oldProtocolGlobalModifier } = require(outFile);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- 老协议：Shift+符号 → C# shifted code ----
check("Shift+1 → 0x96 ('!')", toOldProtocolCode(0x1E, 0x02) === 0x96);
check("Shift+2 → 0x97 ('@')", toOldProtocolCode(0x1F, 0x02) === 0x97);
check("Shift+a → 0xAB ('A')", toOldProtocolCode(0x04, 0x02) === 0xAB);
check('不带 Shift 的数字保持原码', toOldProtocolCode(0x1E, 0) === 0x1E);
check('Shift+F1 不转换（无 shifted 码）', toOldProtocolCode(0x3A, 0x02) === 0x3A);

// ---- 老协议：全局修饰位（Shift 已折算，剩下 Ctrl/Alt/Win）----
check('Ctrl → 全局修饰位 0x01', oldProtocolGlobalModifier(0x01) === 0x01);
check('Ctrl+Shift → 只剩 0x01', oldProtocolGlobalModifier(0x01 | 0x02) === 0x01);
check('无修饰 → 0', oldProtocolGlobalModifier(0) === 0);

// ---- 三个页面互不影响：新协议不引入录制器/不被修改 ----
const np = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
check('新协议未引入 key-recorder', !np.includes('key-recorder'));
check('新协议仍保留自己的宏录制', np.includes('开始录制'));

const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
check('蓝牙款加入了录制按钮', bt.includes("t('录制按键')"));
check('蓝牙款按 isV10 决定是否记录间隔', bt.includes('isV10 ? Math.min(Math.max(measured, 10), 3000) : 50'));
check('蓝牙款录制仍然写 mask/keyCode/delay 结构', bt.includes('list.push({ mask, keyCode, delay: 50 })'));
check('蓝牙款录制把间隔记到上一行（语义：按下后等多久）', bt.includes('prev.delay = gapForPrev;'));

const kcp = readFileSync('src/components/KeyConfigPanel.jsx', 'utf8');
check('老协议面板加入了录制按钮', kcp.includes("t('录制按键')"));
check('老协议用 toOldProtocolCode 转换', kcp.includes('toOldProtocolCode(hidCode, mask)'));
check('老协议写入全局 modifier', kcp.includes('patch.modifier = globMod'));
check('老协议提示不支持逐键延时', kcp.includes('不支持逐键延时'));

// ---- 录制器行为：不监听时 start/stop 幂等（避免重复监听）----
const recSrc = readFileSync('src/services/key-recorder.js', 'utf8');
check('录制器 start 有幂等保护', recSrc.includes('if (recording) return;'));
check('录制器 stop 有幂等保护', recSrc.includes('if (!recording) return;'));
check('录制器会 preventDefault 防浏览器快捷键', recSrc.includes('e.preventDefault();'));


// ---- 顺序检查：useState 必须声明在引用它的 useEffect 之前 ----
// 踩过的坑：把多键录制 effect 放在 useState 之前 → 依赖数组在渲染时先求值
//            → ReferenceError: Cannot access 'multiRecording' before initialization → 整页白屏
{
  const src = readFileSync('src/components/KeyConfigPanel.jsx', 'utf8');
  const declAt = src.indexOf('const [multiRecording, setMultiRecording] = useState(false);');
  const useAt = src.indexOf('if (!multiRecording) return;');
  check('multiRecording 声明在 effect 之前（防 TDZ 白屏）', declAt > 0 && useAt > 0 && declAt < useAt,
    'decl=' + declAt + ' use=' + useAt);
  // 同理检查蓝牙款
  const btSrc = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
  const btDecl = btSrc.indexOf('const [btRecording, setBtRecording] = useState(false);');
  const btUse = btSrc.indexOf('if (!btRecording) return;');
  check('btRecording 声明在 effect 之前（防 TDZ 白屏）', btDecl > 0 && btUse > 0 && btDecl < btUse,
    'decl=' + btDecl + ' use=' + btUse);
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
