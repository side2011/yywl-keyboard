# ============================================================
#  yywl-env-check.ps1 — 键盘配置环境自检（兼容 Windows 7 及以上）
#
#  用途：客户说"插上键盘没反应 / 无法识别的 USB 设备 / 网页打不开"时，
#        让客户双击 运行环境自检.bat，把生成的报告发回来，
#        我们不用远程也能定位是哪一环出问题。
#
#  检测内容：
#    1. 系统版本 / 架构（Win7 不支持网页版，需要 Win10+）
#    2. 浏览器版本（网页版要 Chrome/Edge 111+）
#    3. USB 控制器 / 是否有 USB3.0（Win7 装不上 USB3 驱动是常见坑）
#    4. 键盘是否被识别（按 VID/PID 匹配），以及设备错误码
#    5. 有问题的设备（ConfigManagerErrorCode ≠ 0）
#    6. 电源管理是否允许关闭 USB 设备（会导致偶发掉线）
#
#  输出：控制台 + 同目录 yywl-环境自检-<时间>.txt
# ============================================================

$ErrorActionPreference = 'Continue'
$OutputEncoding = [System.Text.Encoding]::UTF8

$lines = New-Object System.Collections.Generic.List[string]
function Say($text, $level = 'info') {
  $prefix = switch ($level) { 'ok' { '[通过] ' } 'warn' { '[注意] ' } 'bad' { '[问题] ' } default { '       ' } }
  $line = "$prefix$text"
  Write-Host $line -ForegroundColor $(switch ($level) { 'ok' { 'Green' } 'warn' { 'Yellow' } 'bad' { 'Red' } default { 'Gray' } })
  $lines.Add($line)
}

# 我们键盘的 USB 标识（与网页端 hid-constants.js 保持一致）
$KNOWN_VIDS = @('1189', '514C')
$KNOWN_PIDS = @('8842', '8840', '8830', '8831', '8832', '8833', '8850')

Say '========================================' 
Say '   YYWL 键盘配置环境自检' 
Say '========================================'
Say ''

# ---------- 1. 系统 ----------
try {
  $os = Get-WmiObject Win32_OperatingSystem
  $ver = [Environment]::OSVersion.Version
  $caption = $os.Caption
  $build = $os.BuildNumber
  Say "系统: $caption (Build $build, $($os.OSArchitecture))"
  if ($ver.Major -lt 10) {
    Say '当前是 Windows 7/8：网页版配置工具无法运行（需要 Chrome/Edge 111+，只有 Win10 才支持）' 'bad'
    Say '  解决: ① 换一台 Win10/Win11 电脑配置（配置存在键盘里，配好插回旧电脑照常使用）' 'warn'
    Say '        ② 或升级系统到 Win10 以上' 'warn'
  } else {
    Say '系统版本满足网页版要求（Win10 及以上）' 'ok'
  }
  if ($os.OSArchitecture -match '32') {
    Say '当前是 32 位系统：桌面版只提供 64 位安装包' 'bad'
  }
} catch {
  Say "读取系统信息失败: $($_.Exception.Message)" 'warn'
}
Say ''

# ---------- 2. 浏览器 ----------
function Get-BrowserVersion($exe) {
  $paths = @(
    "$env:ProgramFiles\Google\Chrome\Application\$exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\$exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\$exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\$exe"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) {
      try { return @{ path = $p; version = (Get-Item $p).VersionInfo.ProductVersion } } catch { }
    }
  }
  return $null
}

$chrome = Get-BrowserVersion 'chrome.exe'
$edge = Get-BrowserVersion 'msedge.exe'
if ($chrome) { Say "Chrome: $($chrome.version)" } else { Say 'Chrome: 未安装' 'warn' }
if ($edge) { Say "Edge:   $($edge.version)" } else { Say 'Edge:   未安装' 'warn' }

$major = 0
foreach ($b in @($chrome, $edge)) {
  if ($b -and $b.version) {
    $m = 0
    if ([int]::TryParse(($b.version -split '\.')[0], [ref]$m) -and $m -gt $major) { $major = $m }
  }
}
if ($major -eq 0) {
  Say '没有可用的 Chrome/Edge：网页版无法打开' 'bad'
} elseif ($major -lt 111) {
  Say "浏览器主版本 $major < 111：不支持 WebHID，需要升级浏览器" 'bad'
} else {
  Say "浏览器主版本 $major ≥ 111，支持 WebHID" 'ok'
}
Say ''

# ---------- 3. USB 控制器 ----------
try {
  $controllers = Get-WmiObject Win32_USBController
  Say "USB 控制器数量: $($controllers.Count)"
  foreach ($c in $controllers) { Say "  - $($c.Name)" }
  $hasUsb3 = $controllers | Where-Object { $_.Name -match '3\.0|xHCI|USB 3' }
  if ($hasUsb3) {
    Say '检测到 USB 3.0 控制器' 'ok'
    if ([Environment]::OSVersion.Version.Major -lt 10) {
      Say '  Win7 上的 USB3.0 需要单独装驱动，否则插蓝色口会"无法识别的 USB 设备"' 'warn'
      Say '  解决: 换黑色 USB2.0 口，或安装主板/笔记本厂商的 USB3.0 驱动' 'warn'
    }
  } else {
    Say '只有 USB 2.0 控制器（建议插黑色 USB2.0 口）'
  }
} catch {
  Say "读取 USB 控制器失败: $($_.Exception.Message)" 'warn'
}
Say ''

# ---------- 4. 键盘是否被识别 ----------
$found = @()
try {
  $devices = Get-WmiObject Win32_PnPEntity | Where-Object { $_.DeviceID -match '^USB\\VID_' }
  foreach ($d in $devices) {
    $m = [regex]::Match($d.DeviceID, 'VID_([0-9A-F]{4})&PID_([0-9A-F]{4})')
    if (-not $m.Success) { continue }
    $vid = $m.Groups[1].Value.ToUpper()
    $pidStr = $m.Groups[2].Value.ToUpper()
    if ($KNOWN_VIDS -contains $vid -and $KNOWN_PIDS -contains $pidStr) {
      $found += $d
      $statusText = if ($d.ConfigManagerErrorCode -eq 0) { '正常' } else { "错误码 $($d.ConfigManagerErrorCode)" }
      Say "找到键盘: $($d.Name)  VID_$vid&PID_$pidStr  $statusText" $(if ($d.ConfigManagerErrorCode -eq 0) { 'ok' } else { 'bad' })
    }
  }
  if (-not $found.Count) {
    Say '没有找到我们的键盘（VID 1189/514C）' 'bad'
    Say '  可能原因: ① 线没插好/换线试试  ② 插在 USB3.0 口（Win7 常见）  ③ 设备管理器里有"无法识别的 USB 设备"' 'warn'
    Say '  请把下面的"有问题的设备"列表一并发给我们' 'warn'
  }
} catch {
  Say "枚举 USB 设备失败: $($_.Exception.Message)" 'warn'
}
Say ''

# ---------- 5. 有问题的设备 ----------
try {
  $benign = @(24, 45, 21)   # 24=设备未安装/未连接, 45=当前未连接, 21=正在启动 —— 都不算故障
  $bad = Get-WmiObject Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $benign -notcontains $_.ConfigManagerErrorCode }
  if ($bad.Count -gt 0) {
    Say "有 $($bad.Count) 个设备状态异常:" 'warn'
    foreach ($b in $bad) {
      $code = $b.ConfigManagerErrorCode
      # 28 = 未安装驱动；43 = 设备报告故障（"无法识别的 USB 设备" 常见）；10 = 无法启动；31 = 驱动加载失败
      $meaning = switch ($code) {
        1 { '设备未正确配置' } 10 { '设备无法启动' } 12 { '资源不足' } 18 { '需要重新安装驱动' }
        22 { '设备已禁用' } 28 { '未安装驱动' } 31 { '驱动加载失败' } 43 { '设备报告故障（常见于 USB 供电/线材/端口问题）' }
        45 { '当前未连接' } default { "错误码 $code" }
      }
      Say "  - $($b.Name)  [$meaning]" 'warn'
    }
  } else {
    Say '所有设备状态正常' 'ok'
  }
} catch {
  Say "读取设备状态失败: $($_.Exception.Message)" 'warn'
}

# ---------- 6. 电源管理（USB 选择性暂停会让键盘偶发掉线）----------
try {
  $sel = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -Name 'UsbSelectiveSuspendEnabled' -ErrorAction SilentlyContinue).UsbSelectiveSuspendEnabled
  if ($sel -eq 1) { Say 'USB 选择性暂停: 已开启（可能导致偶发断连，可在电源选项里关闭）' 'warn' }
  else { Say 'USB 选择性暂停: 未开启或无设置' }
} catch { }

Say ''
Say '========================================'
Say '  结论与建议'
Say '========================================'
if (-not $found.Count) {
  Say '① 先换黑色 USB2.0 口；② 换一条数据线；③ 换一台电脑对照' 'warn'
  Say '④ Win7 电脑还需要装 USB3.0 驱动（如果插的是蓝色口）' 'warn'
} else {
  Say '键盘已被系统识别。如果网页仍打不开，请检查浏览器版本与系统版本' 'ok'
}
Say ''
Say '报告已保存，请把这个 txt 文件发给技术支持。'

# ---------- 保存报告 ----------
try {
  $outDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $file = Join-Path $outDir "yywl-环境自检-$stamp.txt"
  $header = @(
    'YYWL 键盘配置环境自检报告',
    "生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "计算机名: $env:COMPUTERNAME",
    "用户: $env:USERNAME",
    ''
  )
  [System.IO.File]::WriteAllLines($file, ($header + $lines), (New-Object System.Text.UTF8Encoding($true)))
  Write-Host ''
  Write-Host "报告文件: $file" -ForegroundColor Cyan
} catch {
  Write-Host "保存报告失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ''
Write-Host '按回车键关闭…' -ForegroundColor Gray
Read-Host | Out-Null
