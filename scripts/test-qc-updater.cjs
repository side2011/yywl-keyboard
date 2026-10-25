// 更新单测：断言 .download 命名与清理逻辑
const fs = require('fs');
const src = fs.readFileSync('quick-config/electron.js', 'utf8');
let pass = 0; let fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n)); };
check('下载落地名带 .download', src.includes("rel + '.download'"));
check('应用脚本源文件为 app.asar.download', src.includes("resources\\\\app.asar.download'") || src.includes('app.asar.download'));
check('残留检查用 .download', src.includes("'app.asar.download'"));
check('启动清理空更新目录', src.includes('已清理无用的更新目录'));
check('写权限预检', src.includes('canWriteAppDir'));
check('PowerShell 带 BOM 写入', src.includes("'\\uFEFF'"));
// 生成脚本内容校验
const start = src.indexOf('function buildApplyScript');
const end = src.indexOf('\n}\n', start) + 3;
const fn = new Function('return ' + src.slice(start, end))();
const sc = fn('C:\\u', 'D:\\app', 'C:\\log.txt', 'D:\\app\\a.exe', 42);
check('脚本复制源为 .download', sc.includes("Join-Path $src 'resources\\app.asar.download'"));
check('脚本目标为 app.asar', sc.includes("Join-Path $dst 'resources\\app.asar'"));
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);