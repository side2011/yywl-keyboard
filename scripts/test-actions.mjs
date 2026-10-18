// ============================================================
// scripts/test-actions.mjs —— 扩展动作执行器的自测
//
// 用 dryRun 模式检查"步骤 → 系统命令"的映射是否正确, 不真的动鼠标键盘,
// 避免在自动化环境里误操作。另外单独验证三种平台的按键字符串生成。
//
// 运行: node scripts/test-actions.mjs
// ============================================================
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const { createExecutor, buildSendKeys, buildXdotoolKey, buildAppleScriptKeys } = require(path.join(ROOT, 'desktop-actions.cjs'));

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

const fakeDeps = {
  clipboard: { writeText() {}, writeImage() {} },
  nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
  shell: { openPath: async () => '', openExternal: async () => {} },
};

// ---------- 1. 按键字符串 (三平台) ----------
console.log('\n[1] 按键字符串生成');
check('Windows Ctrl+V', buildSendKeys(['ctrl', 'v']) === '^v', buildSendKeys(['ctrl', 'v']));
check('Windows Ctrl+Alt+Shift+F1', buildSendKeys(['ctrl', 'alt', 'shift', 'F1']) === '^%+{F1}', buildSendKeys(['ctrl', 'alt', 'shift', 'F1']));
check('Windows 单键字母', buildSendKeys(['a']) === 'a');
check('Windows 功能键 F13', buildSendKeys(['F13']) === '{F13}', buildSendKeys(['F13']));
check('Windows Enter', buildSendKeys(['enter']) === '{ENTER}');
check('Linux Ctrl+V', buildXdotoolKey(['ctrl', 'v']) === 'ctrl+v', buildXdotoolKey(['ctrl', 'v']));
check('Linux Ctrl+Alt+Shift+F1', buildXdotoolKey(['ctrl', 'alt', 'shift', 'F1']) === 'ctrl+alt+shift+F1');
check('Linux Enter', buildXdotoolKey(['enter']) === 'Return');
check('macOS Cmd+V', buildAppleScriptKeys(['cmd', 'v']).includes('command down'), buildAppleScriptKeys(['cmd', 'v']));
check('macOS F13', buildAppleScriptKeys(['F13']).startsWith('key code'), buildAppleScriptKeys(['F13']));

// ---------- 2. 步骤调度 (dryRun) ----------
console.log('\n[2] 步骤执行 (dryRun, 不会真的操作鼠标键盘)');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yywl-act-'));
const txtFile = path.join(tmpDir, 'note.txt');
const imgFile = path.join(tmpDir, 'pic.png');
fs.writeFileSync(txtFile, 'hello');
fs.writeFileSync(imgFile, Buffer.from('89504e470d0a1a0a', 'hex'));

const ex = createExecutor(fakeDeps, { dryRun: true, platform: 'win32' });

const mixed = await ex.runAction({
  name: '测试',
  steps: [
    { type: 'openPath', path: tmpDir },
    { type: 'openUrl', url: 'https://key.itytsoft.com' },
    { type: 'pasteText', text: '张三 13800138000' },
    { type: 'delay', ms: 300 },
    { type: 'pasteImage', image: imgFile },
    { type: 'mouseClick', x: 100, y: 200 },
    { type: 'keyPress', keys: ['ctrl', 'enter'] },
  ],
});
check('多步骤动作全部执行成功', mixed.ok === true, JSON.stringify(mixed));
check('记录到 7 个步骤命令', mixed.commands && mixed.commands.length >= 7, String(mixed.commands && mixed.commands.length));

const badPath = await ex.runAction({ steps: [{ type: 'openPath', path: path.join(tmpDir, 'not-exist') }] });
check('路径不存在时报错', badPath.ok === false && /路径不存在/.test(badPath.error), badPath.error);

const badUrl = await ex.runAction({ steps: [{ type: 'openUrl', url: 'ftp://x' }] });
check('非 http(s) 网址被拒', badUrl.ok === false && /http/.test(badUrl.error), badUrl.error);

const badType = await ex.runAction({ steps: [{ type: 'evalScript', code: '1' }] });
check('未知步骤类型被拒', badType.ok === false && /未知步骤类型/.test(badType.error), badType.error);

const empty = await ex.runAction({ steps: [] });
check('空动作被拒', empty.ok === false && /没有任何步骤/.test(empty.error));

const mouseNoXY = await ex.runAction({ steps: [{ type: 'mouseClick', x: 'a' }] });
check('mouseClick 缺坐标报错', mouseNoXY.ok === false && /坐标/.test(mouseNoXY.error), mouseNoXY.error);

// ---------- 3. 平台差异: macOS 鼠标点击无 cliclick 时的提示 ----------
console.log('\n[3] 平台差异提示');
const macEx = createExecutor(fakeDeps, { dryRun: false, platform: 'darwin' });
// dryRun=false 会真的尝试执行, 但 cliclick 不存在 → 应抛带指引的错误
let macErr = '';
try { await macEx.runAction({ steps: [{ type: 'mouseClick', x: 1, y: 2 }] }); }
catch (e) { macErr = e.message; }
const macRes = await macEx.runAction({ steps: [{ type: 'mouseClick', x: 1, y: 2 }] }).catch((e) => ({ ok: false, error: e.message }));
check('macOS 缺 cliclick 时给出安装指引', /cliclick|brew/.test(macRes.error || ''), macRes.error);

// ---------- 4. 步骤数量上限与延时钳位 ----------
console.log('\n[4] 参数钳位');
const delayEx = createExecutor(fakeDeps, { dryRun: true, platform: 'win32' });
const clamped = await delayEx.runAction({ steps: [{ type: 'delay', ms: 999999 }] });
check('延时钳位到 60000ms', clamped.ok && clamped.commands.some((c) => c.file === 'delay' && c.args[0] === 60000), JSON.stringify(clamped.commands));

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
