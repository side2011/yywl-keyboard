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
$KNOWN_VIDS = @('1189', '514C', '413D', '8808', '4C4A')
$KNOWN_PIDS = @('8842', '8840', '8830', '8831', '8832', '8833', '8834', '8850', '4155', '553A', '553B', '6600', '6601', '6602', '6603', '6604', '6605')

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
    Say '没有找到我们的键盘（VID 1189 / 514C / 413D / 8808）' 'bad'
    Say '  可能原因: ① 线没插好/换线试试  ② 插在 USB3.0 口（Win7 常见）  ③ 设备管理器里有"无法识别的 USB 设备"' 'warn'
    Say '  请把下面的"有问题的设备"列表一并发给我们' 'warn'
  }
} catch {
  Say "枚举 USB 设备失败: $($_.Exception.Message)" 'warn'
}
Say ''

# ---------- 4.5 所有 HID 设备（判断键盘有没有被枚举成键盘）----------
try {
  $hids = Get-WmiObject Win32_PnPEntity | Where-Object { $_.DeviceID -match '^HID\\' }
  if ($hids.Count -gt 0) {
    Say "HID 设备 $($hids.Count) 个（判断我们的键盘有没有被识别成键盘）:"
    foreach ($h in $hids) {
      $ours = $h.DeviceID -match 'VID_514C|VID_1189|VID_413D|VID_8808|VID_4C4A'
      $tag = if ($ours) { ' ★我们的键盘' } else { '' }
      Say "  - $($h.Name)  [$($h.DeviceID)]$tag" $(if ($ours) { 'ok' } else { 'info' })
    }
    $ourHid = $hids | Where-Object { $_.DeviceID -match 'VID_514C|VID_1189|VID_413D|VID_8808|VID_4C4A' }
    if ($ourHid.Count -gt 0) {
      $isKbd = $ourHid | Where-Object { $_.Name -match '键盘|Keyboard' }
      if ($isKbd) { Say '我们的键盘已被识别为「键盘」——按键应该能打字' 'ok' }
      else { Say '我们的键盘只被识别成 HID 设备，没有"键盘"接口：这台电脑上按键不会产生字符（多见于蓝牙款仅走 USB 供电）' 'bad' }
    }
  } else {
    Say '系统里没有任何 HID 设备（异常）' 'warn'
  }
} catch {
  Say "枚举 HID 设备失败: $($_.Exception.Message)" 'warn'
}
Say ''

# ---------- 4.8 键盘驱动绑定检测（Win7/XP 最常见的"驱动没上去"）----------
# Windows 自带 HID 键盘驱动 kbdhid.sys：
#   · 键盘接口绑定 kbdhid  → 系统认定是键盘，按键能出字符
#   · 只绑到 HidUsb        → 只是普通 HID 设备，按键不出字符（客户说的"驱动没上去"）
# 注意：一个键盘有多个接口（厂商配置通道 / 用户控制 / 键盘），只有键盘接口需要 kbdhid。
try {
  $osVer = [Environment]::OSVersion.Version
  if ($osVer.Major -lt 6) {
    Say '当前是 Windows XP：HID 键盘免驱，但对 USB 描述符要求更严格' 'warn'
    Say '  · 必须插 USB2.0 口，且系统打到 SP3' 'warn'
    Say '  · 网页版与桌面版配置工具都不支持 XP —— 请先在 Win10 电脑配好再用' 'warn'
  }

  $ours = Get-WmiObject Win32_PnPEntity | Where-Object {
    $_.DeviceID -match '^HID\\VID_(514C|1189|413D|8808|4C4A)' -or
    $_.DeviceID -match '^USB\\VID_(514C|1189|413D|8808|4C4A)'
  }

  if (-not $ours -or $ours.Count -eq 0) {
    Say '没有找到我们的设备（VID 514C/1189/413D/8808/4C4A）—— 先确认线材与端口' 'warn'
    Say '  设备管理器里如果有"无法识别的 USB 设备"，说明系统连设备都没认出来' 'warn'
  } else {
    $kbdIface = @()
    $otherIface = @()
    foreach ($d in $ours) {
      $svc = [string]$d.Service
      $err = $d.ConfigManagerErrorCode
      $isKbdIface = ($svc -eq 'kbdhid') -or ($d.Name -match '键盘|Keyboard')
      if ($isKbdIface) { $kbdIface += $d } else { $otherIface += $d }
    }

    if ($kbdIface.Count -gt 0) {
      Say "键盘接口：$($kbdIface.Count) 个" 'ok'
      foreach ($d in $kbdIface) {
        $errText = if ($d.ConfigManagerErrorCode -eq 0) { '正常' } else { "错误码 $($d.ConfigManagerErrorCode)" }
        Say "  ✓ $($d.Name)  Service=$($d.Service)  $errText" $(if ($d.ConfigManagerErrorCode -eq 0) { 'ok' } else { 'bad' })
        Say "      $($d.DeviceID)"
      }
    } else {
      Say '键盘接口：0 个（系统没把我们识别成键盘）' 'bad'
    }

    if ($otherIface.Count -gt 0) {
      Say "其它接口（配置通道/用户控制等，不需要键盘驱动）：$($otherIface.Count) 个"
      foreach ($d in $otherIface) { Say "  · $($d.Name)  Service=$($d.Service)" }
    }

    Say ''
    if ($kbdIface.Count -gt 0) {
      Say '结论：系统已把设备识别为键盘，按键应该能正常输出' 'ok'
      Say '  若仍打不出字：检查输入法/键盘布局/游戏模式，或换台电脑对照' 'warn'
    } else {
      Say '结论：设备没有被识别为键盘 —— 这就是"驱动没上去"的真实表现' 'bad'
      Say '  按顺序排查：' 'warn'
      Say '  ① 换 USB2.0 黑色口（Win7 的蓝色 USB3.0 口常因缺驱动直接不识别）' 'warn'
      Say '  ② 换一根确定能传数据的线（有些线只供电）' 'warn'
      Say '  ③ 设备管理器里卸载该设备 → 拔插一次让系统重装驱动' 'warn'
      Say '  ④ 报错 43（无法识别的 USB 设备）多为端口供电/线材，换口换线' 'warn'
      Say '  ⑤ 都不行 → 该型号的 HID 描述符在这版系统上不被接受，需要固件加兼容（联系厂家）' 'warn'
    }
  }
} catch {
  Say "键盘绑定检测失败: $($_.Exception.Message)" 'warn'
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
