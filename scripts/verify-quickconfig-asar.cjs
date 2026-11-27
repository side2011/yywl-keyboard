// 校验打包产物里 old-protocol 的灯光读取修复是否生效
const asar = require('@electron/asar');
const path = require('path');

const p = path.join(process.cwd(), 'quick-config', 'dist-electron', 'win-unpacked', 'resources', 'app.asar');
const list = asar.listPackage(p).map((x) => x.replace(/\\/g, '/'));
const f = list.find((x) => x.endsWith('/old-protocol.js'));
console.log('  包内 old-protocol.js: ' + f);
if (!f) process.exit(1);
const src = asar.extractFile(p, f.replace(/^\//, '')).toString();
const pkg = JSON.parse(asar.extractFile(p, 'package.json').toString());

let bad = 0;
const check = (name, ok) => {
  console.log('    ' + (ok ? '✓' : '✗') + ' ' + name);
  if (!ok) bad += 1;
};
check('包内版本 1.1.18', pkg.version === '1.1.18');
check('含灯光等待逻辑（wantLed）', src.includes('const wantLed'));
check('按键收齐后仍等灯光（ledWaitTimer）', src.includes('ledWaitTimer'));
check('旧的"收齐按键即结束"已移除', !src.includes('收齐所有按键配置后提前结束'));
check('3 秒兜底超时存在', src.includes('setTimeout(finish, 3000)'));

const main = asar.extractFile(p, 'electron.js').toString();
check('主进程有灯光重试（没读到就重发）', main.includes('没读到灯光报告，重试'));

console.log(bad ? '  ❌ ' + bad + ' 项未通过' : '  ✅ 打包产物已包含修复');
process.exit(bad ? 1 : 0);
