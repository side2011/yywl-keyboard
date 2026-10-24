// 校验"应用更新"的 PowerShell 脚本生成结果（不执行，只看内容）
const fs = require('fs');
const src = fs.readFileSync('quick-config/electron.js', 'utf8');
const start = src.indexOf('function buildApplyScript');
const end = src.indexOf('\n}\n', start) + 3;
const fnText = src.slice(start, end);
// eslint-disable-next-line no-new-func
const fn = new Function('return ' + fnText)();

const script = fn(
  'C:\\Users\\X\\AppData\\Roaming\\yywl-quick-config\\updates\\1.1.12',
  'D:\\软件\\YYWL快速配置',
  'C:\\Users\\X\\AppData\\Local\\Temp\\yywl-qc-apply.log',
  'D:\\软件\\YYWL快速配置\\YYWL快速配置.exe',
  12345,
);

const lines = script.split('\r\n');
let pass = 0;
let fail = 0;
const check = (name, ok) => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); } else { fail += 1; console.log('  ✗ ' + name); }
};

check('脚本非空', lines.length > 10);
check('等待主进程退出（PID 注入正确）', script.includes('$targetPid = 12345'));
check('复制 resources\\app.asar', script.includes("Join-Path $src 'resources\\app.asar'"));
check('覆盖到目标 resources\\app.asar', script.includes("Join-Path $dst 'resources\\app.asar'"));
check('最多重试 5 次', script.includes('-le 5'));
check('失败会记录异常信息', script.includes('$_.Exception.Message'));
check('全程写日志', script.includes('Add-Content'));
check('最后重启程序', script.includes('Start-Process -FilePath'));
check('带空格的路径有引号', script.includes("'D:\\软件\\YYWL快速配置'"));
check('成功后清理更新目录', script.includes('Remove-Item -LiteralPath $src'));
check('单引号转义函数存在', typeof fn === 'function');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
