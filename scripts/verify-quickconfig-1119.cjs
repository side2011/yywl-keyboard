// 校验打包产物：快速配置 1.1.19 是否带上「左右互换」修复 + 老协议灯光读取修复
const asar = require('@electron/asar');
const path = require('path');

const p = path.join(process.cwd(), 'quick-config', 'dist-electron', 'win-unpacked', 'resources', 'app.asar');
// quick-config 的 asar 内部条目是反斜杠，统一成正斜杠再匹配
const list = asar.listPackage(p).map((x) => x.replace(/\\/g, '/'));
const pkg = JSON.parse(asar.extractFile(p, 'package.json').toString());

let bad = 0;
const check = (name, ok, extra = '') => {
  console.log('    ' + (ok ? '✓' : '✗') + ' ' + name + (ok ? '' : '  → ' + extra));
  if (!ok) bad += 1;
};

console.log('  包内文件数: ' + list.length);
check('版本 1.1.19', pkg.version === '1.1.19', pkg.version);

const bundles = list.filter((x) => /dist\/assets\/index-.*\.js$/.test(x));
check('找到前端 bundle', bundles.length > 0, JSON.stringify(bundles.slice(0, 3)));

// asar 里取文件要用原始路径（反斜杠）
const rawList = asar.listPackage(p);
const rawBundle = rawList.find((x) => /dist[\\/]assets[\\/]index-.*\.js$/.test(x));
const js = rawBundle ? asar.extractFile(p, rawBundle.replace(/^[\\/]/, '')).toString() : '';
check('前端含「左右互换」开关', js.includes('左右互换'));
// 打包后变量名会被压缩，改查「字符串字面量 + 数组反转调用」
check('前端含顺序翻转逻辑（持久化 key + reverse()）', js.includes('qc-slot-reverse') && js.includes('.reverse()'), 'qc-slot-reverse=' + js.includes('qc-slot-reverse') + ' reverse=' + js.includes('.reverse()'));
check('前端含 2 键默认开启判断', js.includes('===2') || js.includes('=== 2'));

const rawOld = rawList.find((x) => /protocols[\\/]old-protocol\.js$/.test(x));
const oldSrc = rawOld ? asar.extractFile(p, rawOld.replace(/^[\\/]/, '')).toString() : '';
check('老协议灯光等待逻辑仍在（ledWaitTimer）', oldSrc.includes('ledWaitTimer'));

console.log(bad ? '  ❌ ' + bad + ' 项未通过' : '  ✅ 打包产物包含全部修复');
process.exit(bad ? 1 : 0);
