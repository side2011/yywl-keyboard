// 回归测试：老协议灯光模式表必须与 C# 的 cbo_RGB 下拉顺序逐项一致
//   C# 里写入/读取都是直接使用 cbo_RGB.SelectedIndex（K8Form.cs:245 / :422），
//   也就是说"下拉索引 == 设备值"，顺序一旦错位，客户选 A 效果却是 B。
// 用法: node scripts/test-rgb-modes.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

const require = createRequire(import.meta.url);

// 1) 从 Resources.resx 取资源中文
const resx = readFileSync('yywlkey/Hid_Common/Properties/Resources.resx', 'utf8');
const RES = {};
for (const m of resx.matchAll(/<data name="(str_RGB_\w+)"[^>]*>\s*<value>([^<]*)<\/value>/g)) {
  RES[m[1]] = m[2];
}

// 2) 从每个 Designer 里取 cbo_RGB 顺序
function csharpOrder(file) {
  const src = readFileSync(file, 'utf8');
  const labelRes = {};
  for (const m of src.matchAll(/this\.(duiLabel\d+)\.Text\s*=\s*global::HID_SIMPLE\.Properties\.Resources\.(\w+)/g)) {
    labelRes[m[1]] = m[2];
  }
  const order = [...src.matchAll(/this\.cbo_RGB\.Items\.Add\(this\.(duiLabel\d+)\)/g)].map((m) => m[1]);
  return order.map((lbl) => RES[labelRes[lbl]] || labelRes[lbl]);
}

// 3) 取我们 JS 的表
const bundle = await esbuild.build({
  stdin: {
    contents: `export { getRgbModesForModel } from './src/services/hid-constants.js';`,
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true, format: 'cjs', platform: 'node', write: false,
});
const outFile = resolve('node_modules', '.cache-rgb-modes.cjs');
(await import('node:fs')).writeFileSync(outFile, bundle.outputFiles[0].text);
const { getRgbModesForModel } = require(outFile);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
};

const pairs = [
  ['8K', 'yywlkey/Hid_Common/DeviceConfigForm/K8Form.Designer.cs'],
  ['8K-new', 'yywlkey/Hid_Common/DeviceConfigForm/K8NewForm.Designer.cs'],
  ['8KDZ6', 'yywlkey/Hid_Common/DeviceConfigForm/K8DZ6Form.Designer.cs'],
  ['12K', 'yywlkey/Hid_Common/DeviceConfigForm/K12Form.Designer.cs'],
  ['10KDZ1', 'yywlkey/Hid_Common/DeviceConfigForm/K10DZ1Form.Designer.cs'],
];

for (const [modelId, csFile] of pairs) {
  const want = csharpOrder(csFile);
  const got = getRgbModesForModel(modelId);
  const same = want.length === got.length && want.every((v, i) => v === got[i]);
  let detail = '';
  if (!same) {
    const rows = [];
    for (let i = 0; i < Math.max(want.length, got.length); i += 1) {
      if (want[i] !== got[i]) rows.push(`[${i}] C#=${want[i] || '-'}  JS=${got[i] || '-'}`);
    }
    detail = rows.slice(0, 6).join('\n      ');
  }
  check(`${modelId} 灯光模式表与 C# 一致（${want.length} 项）`, same, detail);
}

// 4) K8 系列不应再引用已删除的 Type C
const hid = readFileSync('src/services/hid-constants.js', 'utf8');
check('已删除错误的 RGB_MODES_C 表', !hid.includes('RGB_MODES_C'));
check('8K / 8K-new 指向 Type B', hid.includes("'8K': 'B', '8K-new': 'B'"));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
