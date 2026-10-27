// 日志缓冲/导出 的单元测试（用最小 DOM/Blob 桩，不需要浏览器）
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

// ---- 最小环境桩 ----
const appended = [];
globalThis.window = {};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-test' }, configurable: true });
globalThis.location = { href: 'https://key.itytsoft.com/bt' };
globalThis.document = {
  body: { appendChild() {} },
  createElement() {
    return {
      set href(v) { this._href = v; },
      get href() { return this._href; },
      set download(v) { this._download = v; },
      get download() { return this._download; },
      click() { appended.push({ download: this._download, href: this._href }); },
      remove() {},
    };
  },
};
globalThis.URL.createObjectURL = () => 'blob:test';
globalThis.URL.revokeObjectURL = () => {};

const src = readFileSync('src/services/log-buffer.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-log-buffer.cjs');
writeFileSync(file, out);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { installLogCapture, dumpLogs, downloadLogs } = require(file);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

installLogCapture();
console.log('[BtProto] 写键 keyNo=1 组数=4');
console.warn('[BtProto] 延时不一致（写 100ms，读 0ms）');
console.log('这条无关日志不应该进入缓冲');

const dump = dumpLogs();
check('包含协议日志', dump.includes('[BtProto] 写键 keyNo=1 组数=4'));
check('包含 warn', dump.includes('延时不一致'));
check('忽略无关日志', !dump.includes('无关日志'));
check('带环境头（UA/页面）', dump.includes('node-test') && dump.includes('key.itytsoft.com'));
check('有导出时间戳', /\d{4}\/\d+\/\d+/.test(dump) || dump.includes('导出时间'));

const name = downloadLogs('bt-save');
check('导出返回文件名', typeof name === 'string' && name.startsWith('yywl-bt-save-') && name.endsWith('.txt'), String(name));
check('触发了浏览器下载', appended.length === 1 && String(appended[0].download).startsWith('yywl-bt-save-'), JSON.stringify(appended[0]));


console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
