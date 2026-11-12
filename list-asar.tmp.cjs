const asar = require('@electron/asar');
const path = require('path');
const file = path.join(process.env.TEMP, 'pkg-1419-app.asar');
const list = asar.listPackage(file);
console.log('  总条目: ' + list.length);
const cjs = list.filter((p) => /\.cjs$/.test(p));
console.log('  .cjs 文件:');
cjs.forEach((p) => console.log('    ' + p));
const need = ['desktop-main.cjs', 'desktop-actions.cjs', 'ps-worker.cjs', 'desktop-update-apply.cjs', 'desktop-updater.cjs', 'package.json'];
for (const n of need) {
  const found = list.some((p) => p.replace(/\\/g, '/').endsWith('/' + n));
  console.log('  ' + (found ? '✓' : '✗') + ' ' + n);
}
