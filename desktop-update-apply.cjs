// 原地更新脚本（Windows）：等旧进程退出 → robocopy 覆盖 → 启动新版
// 抽成独立模块便于单测（不起 Electron）
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * 生成更新脚本内容
 * @param {{newRoot:string,targetDir:string,exeName:string,logPath:string,pid:number,versionText?:string,waitLoops?:number}} o
 */
function buildApplyScript(o) {
  const q = (s) => String(s).replace(/'/g, "''");
  const waitLoops = o.waitLoops == null ? 100 : o.waitLoops;   // 100*300ms = 30s
  return [
    "$ErrorActionPreference = 'Stop'",
    `$log = '${q(o.logPath)}'`,
    "function L($m){ try { \"$([DateTime]::Now.ToString('HH:mm:ss')) $m\" | Out-File -FilePath $log -Append -Encoding utf8 } catch {} }",
    `L '=== 开始更新 -> ${q(o.versionText || '')} (PID ${o.pid}) ==='`,
    `L '新版本目录: ${q(o.newRoot)}'`,
    `L '目标目录: ${q(o.targetDir)}'`,
    `for ($i=0; $i -lt ${waitLoops}; $i++) { if (-not (Get-Process -Id ${o.pid} -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 300 }`,
    `if (Get-Process -Id ${o.pid} -ErrorAction SilentlyContinue) {`,
    "  L '旧进程等待超时，强制结束'",
    `  try { Stop-Process -Id ${o.pid} -Force -ErrorAction SilentlyContinue } catch { L ('Stop-Process 失败: ' + $_.Exception.Message) }`,
    "  Start-Sleep -Milliseconds 1500",
    "}",
    "Start-Sleep -Milliseconds 600",
    "$ok = $false",
    "for ($k=1; $k -le 3; $k++) {",
    `  $rc = (Start-Process -FilePath 'robocopy.exe' -ArgumentList '${q(o.newRoot)}','${q(o.targetDir)}','/E','/R:5','/W:2','/NFL','/NDL','/NJH','/NJS' -Wait -PassThru -WindowStyle Hidden).ExitCode`,
    "  L ('robocopy 第' + $k + '轮退出码: ' + $rc)",
    "  if ($rc -lt 8) { $ok = $true; break }",
    "  Start-Sleep -Milliseconds 2000",
    "}",
    "if (-not $ok) { L 'robocopy 三轮均失败（<8 才算成功），放弃启动' }",
    `$exe = '${q(path.join(o.targetDir, o.exeName))}'`,
    "if (Test-Path -LiteralPath $exe) {",
    "  $fi = Get-Item -LiteralPath $exe",
    "  L ('目标 exe: ' + $fi.FullName + '  大小=' + $fi.Length + '  修改时间=' + $fi.LastWriteTime)",
    "} else { L ('目标 exe 不存在: ' + $exe) }",
    "if ($ok -and (Test-Path -LiteralPath $exe)) {",
    "  L '启动新版本...'",
    o.launch === false ? "  L '（测试模式：跳过启动）'" : `  Start-Process -FilePath $exe -WorkingDirectory '${q(o.targetDir)}'`,
    "} elseif (-not $ok) {",
    "  L '未启动：复制未成功，请手动覆盖'",
    "} else {",
    "  L '未启动：找不到目标 exe'",
    "}",
    `Remove-Item -LiteralPath '${q(o.newRoot)}' -Recurse -Force -ErrorAction SilentlyContinue`,
    `Remove-Item -LiteralPath '${q(o.scriptPath)}' -Force -ErrorAction SilentlyContinue`,
    "L '=== 结束 ==='",
  ].join('\n');
}

/** 写脚本并后台启动（返回 {scriptPath, logPath}） */
function applyInBackground({ newRoot, targetDir, exeName, versionText, pid, tempDir }) {
  const stamp = Date.now();
  const scriptPath = path.join(tempDir, `yywl-apply-${stamp}.ps1`);
  const logPath = path.join(tempDir, 'yywl-update-apply.log');
  const ps = buildApplyScript({ newRoot, targetDir, exeName, logPath, pid, versionText, scriptPath });
  fs.writeFileSync(scriptPath, '\ufeff' + ps, 'utf8');
  const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return { scriptPath, logPath };
}

module.exports = { buildApplyScript, applyInBackground };
