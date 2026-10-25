const fs = require('fs');
const path = require('path');
const os = require('os');
const OUT = path.join(os.tmpdir(), 'asar-probe-result.txt');
const lines = ['Electron ' + process.versions.electron];
const files = [path.join(os.tmpdir(), 'probe-app.asar'), path.join(os.tmpdir(), 'probe-app.asar.download')];
for (const f of files) {
  try { fs.unlinkSync(f); } catch {}
  try {
    fs.writeFileSync(f, 'hello-asar');
    lines.push('[OK]   writeFileSync ' + path.basename(f) + ' -> ' + fs.statSync(f).size + 'B');
  } catch (e) {
    lines.push('[FAIL] writeFileSync ' + path.basename(f) + ' -> ' + (e.code || e.message));
  }
}
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
const { app } = require('electron');
try { app.quit(); } catch {}