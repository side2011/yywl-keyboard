// ============================================================
// desktop-actions.cjs —— 扩展动作执行器
//
// 设计要点:
//   · 键盘只能发 HID 码, 所以"扩展动作"靠桌面版监听保留热键触发 (见 desktop-main.cjs)
//   · 一个动作用「步骤数组」表达, 天然支持 "贴图 → 延时 → 点击 → 组合键" 这类串联
//   · 平台差异全部收在本文件里: Windows 用 PowerShell, macOS 用 osascript, Linux 用 xdotool
//   · 输出文字**一律走剪贴板 + 粘贴**, 不逐字模拟 —— 逐字打不了中文, 长文本还会卡死
//
// 步骤类型:
//   { type: 'openPath',   path }            打开文件夹或文件
//   { type: 'openUrl',    url }             用默认浏览器打开网址
//   { type: 'pasteText',  text }            把文字粘贴到当前窗口
//   { type: 'pasteImage', image }           把图片粘贴到当前窗口
//   { type: 'keyPress',   keys: ['ctrl','v'] }   发送组合键
//   { type: 'mouseClick', x, y, button? }   移动鼠标并点击
//   { type: 'delay',      ms }              等待
//   { type: 'runApp',     path, args? }     启动程序
// ============================================================
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLATFORM = process.platform; // win32 / darwin / linux

// ---------- 平台工具: 发送按键 ----------

// SendKeys 转义: + ^ % ~ ( ) { } [ ]
function sendKeysToken(key) {
  const map = {
    ctrl: '^', control: '^', alt: '%', shift: '+', win: '#', cmd: '^', command: '^', meta: '#',
    enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}',
    space: ' ', backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}',
    up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
    home: '{HOME}', end: '{END}', pgup: '{PGUP}', pgdn: '{PGDN}',
    insert: '{INSERT}', printscreen: '{PRTSC}',
  };
  const k = String(key).toLowerCase();
  if (map[k]) return map[k];
  if (/^f\d{1,2}$/.test(k)) return `{${k.toUpperCase()}}`;
  if (/^[a-z0-9]$/i.test(k)) return k;
  // 其它单字符做转义
  return `{${key}}`;
}

function buildSendKeys(keys) {
  const mods = [];
  const rest = [];
  for (const k of keys) {
    const lk = String(k).toLowerCase();
    if (['ctrl', 'control', 'alt', 'shift', 'win', 'cmd', 'command', 'meta'].includes(lk)) mods.push(sendKeysToken(k));
    else rest.push(sendKeysToken(k));
  }
  return mods.join('') + rest.join('');
}

function buildXdotoolKey(keys) {
  const map = { ctrl: 'ctrl', control: 'ctrl', alt: 'alt', shift: 'shift', win: 'super', cmd: 'ctrl', command: 'ctrl', meta: 'super',
    enter: 'Return', return: 'Return', esc: 'Escape', escape: 'Escape', space: 'space', tab: 'Tab',
    backspace: 'BackSpace', delete: 'Delete', up: 'Up', down: 'Down', left: 'Left', right: 'Right',
    home: 'Home', end: 'End', pgup: 'Prior', pgdn: 'Next' };
  return keys.map((k) => {
    const lk = String(k).toLowerCase();
    if (map[lk]) return map[lk];
    if (/^f\d{1,2}$/.test(lk)) return lk.toUpperCase();
    return String(k);
  }).join('+');
}

function buildAppleScriptKeys(keys) {
  const mods = [];
  let key = '';
  for (const k of keys) {
    const lk = String(k).toLowerCase();
    if (['ctrl', 'control'].includes(lk)) mods.push('control down');
    else if (lk === 'alt') mods.push('option down');
    else if (lk === 'shift') mods.push('shift down');
    else if (['cmd', 'command', 'meta', 'win'].includes(lk)) mods.push('command down');
    else key = lk;
  }
  const using = mods.length ? ` using {${mods.join(', ')}}` : '';
  const special = { enter: 'return', return: 'return', tab: 'tab', esc: 'escape', space: 'space', backspace: 'delete' };
  if (special[key]) return `key code ${key === 'enter' || key === 'return' ? 36 : key === 'tab' ? 48 : key === 'esc' ? 53 : key === 'space' ? 49 : 51}`;
  if (/^f\d{1,2}$/.test(key)) {
    const n = Number(key.slice(1));
    // F1-F12 与 F13-F20 的 macOS 键码不同; F21 以上 Mac 键盘没有对应键码
    const codes = {
      1: 122, 2: 120, 3: 99, 4: 118, 5: 96, 6: 97, 7: 98, 8: 100, 9: 101, 10: 109, 11: 103, 12: 111,
      13: 105, 14: 107, 15: 113, 16: 106, 17: 64, 18: 79, 19: 80, 20: 90,
    };
    if (codes[n]) return `key code ${codes[n]}${using}`;
    throw new Error(`macOS 不支持 F${n}（只支持 F1-F20）`);
  }
  return `keystroke "${key === ' ' ? ' ' : key}"${using}`;
}

// ---------- 执行器 ----------

/**
 * @param {object} deps  { clipboard, nativeImage, shell } —— 由主进程注入 electron 模块
 * @param {object} [opts] { dryRun: boolean, platform: string }
 */
function createExecutor(deps, opts = {}) {
  const platform = opts.platform || PLATFORM;
  const dryRun = !!opts.dryRun;
  const commands = [];   // dryRun 模式下记录将要执行的命令, 便于测试

  const run = (file, args, timeoutMs = 15000) => new Promise((resolve, reject) => {
    commands.push({ file, args });
    if (dryRun) return resolve({ stdout: '', stderr: '', dryRun: true });
    execFile(file, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${file} 执行失败: ${stderr || err.message}`));
      resolve({ stdout, stderr });
    });
  });

  // ---- 平台输入实现 ----

  async function sendKeys(keys) {
    if (!Array.isArray(keys) || !keys.length) throw new Error('keyPress 缺少 keys');
    if (platform === 'win32') {
      const seq = buildSendKeys(keys);
      const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${seq.replace(/'/g, "''")}')`;
      await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
      return;
    }
    if (platform === 'darwin') {
      const cmd = buildAppleScriptKeys(keys);
      await run('osascript', ['-e', `tell application "System Events" to ${cmd}`]);
      return;
    }
    const combo = buildXdotoolKey(keys);
    await run('xdotool', ['key', '--clearmodifiers', combo]);
  }

  async function pasteFromClipboard() {
    // Windows 用 Ctrl+V; macOS 用 Cmd+V; Linux 用 Ctrl+V
    const pasteKeys = platform === 'darwin' ? ['cmd', 'v'] : ['ctrl', 'v'];
    await sendKeys(pasteKeys);
  }

  async function mouseClick({ x, y, button = 'left' }) {
    if (typeof x !== 'number' || typeof y !== 'number') throw new Error('mouseClick 需要 x/y 坐标');
    if (platform === 'win32') {
      const btn = button === 'right' ? '0x0008' : button === 'middle' ? '0x0020' : '0x0002';
      const up = button === 'right' ? '0x0010' : button === 'middle' ? '0x0040' : '0x0004';
      const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class YywlMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);
}
"@
[YywlMouse]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds 60
[YywlMouse]::mouse_event(${btn}, 0, 0, 0, 0)
Start-Sleep -Milliseconds 40
[YywlMouse]::mouse_event(${up}, 0, 0, 0, 0)`;
      await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
      return;
    }
    if (platform === 'darwin') {
      // 优先用 cliclick (brew install cliclick), 没有则给出明确指引
      try {
        await run('cliclick', [`m:${Math.round(x)},${Math.round(y)}`, `c:${Math.round(x)},${Math.round(y)}`]);
      } catch (e) {
        throw new Error('macOS 需要 cliclick 才能模拟鼠标点击。安装方法：终端执行  brew install cliclick');
      }
      return;
    }
    await run('xdotool', ['mousemove', String(Math.round(x)), String(Math.round(y)), 'click', button === 'right' ? '3' : button === 'middle' ? '2' : '1']);
  }

  async function pasteImage(imagePath) {
    if (!fs.existsSync(imagePath)) throw new Error(`图片不存在: ${imagePath}`);
    if (dryRun) { commands.push({ file: 'clipboard.writeImage', args: [imagePath] }); }
    else {
      const img = deps.nativeImage.createFromPath(imagePath);
      if (!img || img.isEmpty()) throw new Error(`无法读取图片: ${imagePath}`);
      deps.clipboard.writeImage(img);
    }
    await new Promise((r) => setTimeout(r, 120)); // 等剪贴板写入
    await pasteFromClipboard();
  }

  async function pasteText(text) {
    if (typeof text !== 'string' || !text) throw new Error('pasteText 缺少文本');
    if (dryRun) commands.push({ file: 'clipboard.writeText', args: [text.slice(0, 40)] });
    else deps.clipboard.writeText(text);
    await new Promise((r) => setTimeout(r, 120));
    await pasteFromClipboard();
  }

  // 取当前鼠标位置（与 mouseClick 用同一坐标系，避免 DPI 缩放导致偏移）
  async function getMousePosition() {
    if (platform === 'win32') {
      const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class YywlCursor {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
}
"@
$p = New-Object YywlCursor+POINT
[YywlCursor]::GetCursorPos([ref]$p) | Out-Null
Write-Output ("{0},{1}" -f $p.X, $p.Y)`;
      const { stdout } = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
      const [x, y] = String(stdout).trim().split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      throw new Error('读取鼠标位置失败');
    }
    if (platform === 'darwin') {
      try {
        const { stdout } = await run('cliclick', ['p']);
        const [x, y] = String(stdout).trim().split(',').map((v) => Number(v.split(':').pop()));
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
        throw new Error('解析失败');
      } catch {
        throw new Error('macOS 需要 cliclick 才能取鼠标位置：brew install cliclick');
      }
    }
    const { stdout } = await run('xdotool', ['getmouselocation']);
    const m = String(stdout).match(/x:(\d+)\s+y:(\d+)/);
    if (m) return { x: Number(m[1]), y: Number(m[2]) };
    throw new Error('读取鼠标位置失败（需要 xdotool）');
  }
  // ---------- 宏录制（Windows）----------
  // 不用全局钩子(SetWindowsHookEx)，改为轮询 GetAsyncKeyState + GetCursorPos：
  // 效果一样，但不会像键盘记录器那样被杀软重点盯防。
  const VK_MODS = { 0x10: 'shift', 0x11: 'ctrl', 0x12: 'alt', 0x5B: 'win', 0x5C: 'win' };
  const VK_MOUSE = { 0x01: 'left', 0x02: 'right', 0x04: 'middle' };
  const VK_KEYS = {
    0x08: 'backspace', 0x09: 'tab', 0x0D: 'enter', 0x1B: 'esc', 0x20: 'space',
    0x21: 'pgup', 0x22: 'pgdn', 0x23: 'end', 0x24: 'home',
    0x25: 'left', 0x26: 'up', 0x27: 'right', 0x28: 'down',
    0x2D: 'insert', 0x2E: 'delete',
  };
  const VK_STOP = 0x79; // F10 结束录制

  function recordVkList() {
    const vks = new Set([...Object.keys(VK_MODS), ...Object.keys(VK_MOUSE), ...Object.keys(VK_KEYS), VK_STOP]
      .map((v) => Number(v)));
    for (let v = 0x30; v <= 0x39; v += 1) vks.add(v); // 0-9
    for (let v = 0x41; v <= 0x5A; v += 1) vks.add(v); // A-Z
    for (let v = 0x70; v <= 0x7B; v += 1) vks.add(v); // F1-F12
    return [...vks].sort((a, b) => a - b);
  }

  function vkToKey(vk) {
    if (VK_MODS[vk] || VK_MOUSE[vk]) return null;
    if (VK_KEYS[vk]) return VK_KEYS[vk];
    if (vk >= 0x30 && vk <= 0x39) return String.fromCharCode(vk);
    if (vk >= 0x41 && vk <= 0x5A) return String.fromCharCode(vk).toLowerCase();
    if (vk >= 0x70 && vk <= 0x7B) return `f${vk - 0x6F}`;
    return null;
  }

  function recordScript(durationMs) {
    const vks = recordVkList().join(',');
    return [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -TypeDefinition @\"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class YywlRec {',
      '  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }',
      '  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);',
      '  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);',
      '}',
      '\"@',
      `$vks = @(${vks})`,
      `$duration = ${Math.round(durationMs)}`,
      '$sw = [System.Diagnostics.Stopwatch]::StartNew()',
      '$prev = @{}',
      '# Pre-fill with false; otherwise null comparison marks every key as down on the first poll',
      'foreach ($vk in $vks) { $prev[$vk] = $false }',
      '$lines = New-Object System.Collections.ArrayList',
      '$stop = $false',
      'while (-not $stop -and $sw.ElapsedMilliseconds -lt $duration) {',
      '  $pt = New-Object YywlRec+POINT',
      '  [void][YywlRec]::GetCursorPos([ref]$pt)',
      '  foreach ($vk in $vks) {',
      '    $st = [YywlRec]::GetAsyncKeyState($vk)',
      '    $isDown = ($st -band 0x8000) -ne 0',
      '    # 低位 = "自上次调用以来按下过"，用来兜住比轮询间隔还快的点击/按键',
      '    $since = ($st -band 0x0001) -ne 0',
      '    if ($isDown -ne $prev[$vk]) {',
      '      $prev[$vk] = $isDown',
      '      [Console]::Out.WriteLine(("{0}`t{1}`t{2}`t{3}`t{4}" -f $sw.ElapsedMilliseconds, $vk, [int]$isDown, $pt.X, $pt.Y))',
      `      if ($vk -eq ${VK_STOP} -and $isDown) { $stop = $true }`,
      '    } elseif ($since -and (-not $isDown) -and (-not $prev[$vk])) {',
      '      # 整个按下-抬起都发生在两次轮询之间：补一对 down/up',
      '      [Console]::Out.WriteLine(("{0}`t{1}`t{2}`t{3}`t{4}" -f $sw.ElapsedMilliseconds, $vk, 1, $pt.X, $pt.Y))',
      '      [Console]::Out.WriteLine(("{0}`t{1}`t{2}`t{3}`t{4}" -f $sw.ElapsedMilliseconds, $vk, 0, $pt.X, $pt.Y))',
      '    }',
      '  }',
      '  Start-Sleep -Milliseconds 15',
      '}',
    ].join('\n');
  }

  // 录制：边录边把事件抛给 onEvent（HUD 实时显示），结束时返回完整事件数组
  async function record(durationMs = 15000, opts = {}) {
    if (platform !== 'win32') throw new Error('宏录制目前只支持 Windows');
    const onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : null;
    const file = path.join(os.tmpdir(), `yywl-record-${process.pid}.ps1`);
    const script = recordScript(durationMs);
    // 带 BOM 写入：PowerShell 5.1 读无 BOM 的 UTF-8 会按 ANSI 解析，注释里的中文会拆坏后续行
    fs.writeFileSync(file, '\uFEFF' + script, 'utf8');
    const events = [];
    const handleLine = (line) => {
      const parts = String(line).trim().split('\t');
      if (parts.length < 5) return;
      const [t, vk, down, x, y] = parts;
      const ev = { t: Number(t), vk: Number(vk), down: Number(down) === 1, x: Number(x), y: Number(y) };
      if (!Number.isFinite(ev.vk)) return;
      events.push(ev);
      if (onEvent) { try { onEvent(ev); } catch { /* 忽略 */ } }
    };
    try {
      await new Promise((resolve, reject) => {
        const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
        let buf = '';
        child.stdout.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            handleLine(buf.slice(0, idx));
            buf = buf.slice(idx + 1);
          }
        });
        child.on('error', reject);
        child.on('exit', () => {
          if (buf.trim()) handleLine(buf);
          resolve();
        });
        // 兜底：脚本卡住也不能让 UI 一直等
        setTimeout(() => { try { child.kill(); } catch { /* 忽略 */ } }, durationMs + 8000);
      });
      return events;
    } finally {
      try { fs.unlinkSync(file); } catch { /* 忽略 */ }
    }
  }

  // 把原始事件压成步骤序列
  function eventsToSteps(events, { maxSteps = 80, includeMouse = true, includeKeyboard = true } = {}) {
    const steps = [];
    const held = Object.create(null);
    let lastT = 0;
    const pushDelay = (gap) => {
      if (gap >= 80 && steps.length) {
        steps.push({ type: 'delay', ms: Math.min(Math.round(gap), 3000) });
      }
    };

    // 先把修饰键配成"按住区间"。轮询可能在同一个周期里看到按下+抬起
    // （瞬时组合，比如程序模拟的 Ctrl+A），这时 start==end，
    // 后面判断时给这类瞬时按下留 150ms 的容差，否则组合键会丢修饰键。
    const modIntervals = [];
    const openMods = Object.create(null);
    for (const ev of events) {
      const name = VK_MODS[ev.vk];
      if (!name) continue;
      if (ev.down) {
        openMods[name] = ev.t;
      } else if (openMods[name] != null) {
        modIntervals.push({ name, start: openMods[name], end: ev.t });
        delete openMods[name];
      }
    }
    Object.keys(openMods).forEach((name) => modIntervals.push({ name, start: openMods[name], end: Infinity }));
    const modsAt = (t) => {
      const out = new Set();
      for (const m of modIntervals) {
        const effEnd = m.end === Infinity ? Infinity : Math.max(m.end, m.start + 150);
        if (t >= m.start && t <= effEnd) out.add(m.name);
      }
      return [...out];
    };

    for (const ev of events) {
      if (steps.length >= maxSteps) break;
      const { t, vk, down, x, y } = ev;
      if (VK_MOUSE[vk]) {
        if (!includeMouse || !down || steps.length >= maxSteps) continue;
        pushDelay(t - lastT);
        steps.push({ type: 'mouseClick', x, y, button: VK_MOUSE[vk] });
        lastT = t;
        continue;
      }
      if (VK_MODS[vk]) continue; // 修饰键只参与组合，不单独成步
      if (!includeKeyboard) continue;
      const key = vkToKey(vk);
      if (!key) continue;
      if (!down) { delete held[key]; continue; }
      if (held[key]) continue; // 长按的自动重复，只记一次
      held[key] = true;
      pushDelay(t - lastT);
      steps.push({ type: 'keyPress', keys: [...modsAt(t), key] });
      lastT = t;
    }
    // 去掉结尾的 F10（那是"结束录制"用的）和结尾多余的等待
    const last = steps[steps.length - 1];
    if (last && last.type === 'keyPress' && last.keys.length === 1 && last.keys[0] === 'f10') steps.pop();
    while (steps.length && steps[steps.length - 1].type === 'delay') steps.pop();
    return steps;
  }
  // ---- 步骤调度 ----

  async function executeStep(step) {
    switch (step.type) {
      case 'openPath': {
        const p = step.path;
        if (!p) throw new Error('openPath 缺少 path');
        // 先校验存在性, 再决定是否 dryRun —— 配置界面"测试"时也要能发现问题
        if (!fs.existsSync(p)) throw new Error(`路径不存在: ${p}`);
        if (dryRun) { commands.push({ file: 'shell.openPath', args: [p] }); return; }
        const err = await deps.shell.openPath(p);
        if (err) throw new Error(`打开失败: ${err}`);
        return;
      }
      case 'openUrl': {
        const u = step.url;
        if (!u || !/^https?:\/\//i.test(u)) throw new Error('openUrl 需要以 http(s):// 开头的网址');
        if (dryRun) { commands.push({ file: 'shell.openExternal', args: [u] }); return; }
        await deps.shell.openExternal(u);
        return;
      }
      case 'pasteText': return pasteText(step.text);
      case 'pasteImage': return pasteImage(step.image);
      case 'keyPress': {
        // 支持单个组合（keys）和多个组合连发（chords: [['alt','x'], ['enter']]）
        if (Array.isArray(step.chords) && step.chords.length) {
          for (const chord of step.chords) {
            if (Array.isArray(chord) && chord.length) await sendKeys(chord);
            await new Promise((r) => setTimeout(r, 120));
          }
          return;
        }
        return sendKeys(step.keys || []);
      }
      case 'mouseClick': return mouseClick(step);
      case 'delay': {
        const ms = Math.min(Math.max(Number(step.ms) || 0, 0), 60000);
        if (dryRun) { commands.push({ file: 'delay', args: [ms] }); return; }
        await new Promise((r) => setTimeout(r, ms));
        return;
      }
      case 'runApp': {
        if (!step.path) throw new Error('runApp 缺少 path');
        if (dryRun) { commands.push({ file: 'spawn', args: [step.path, ...(step.args || [])] }); return; }
        const { spawn } = require('child_process');
        const child = spawn(step.path, step.args || [], { detached: true, stdio: 'ignore' });
        child.unref();
        return;
      }
      default:
        throw new Error(`未知步骤类型: ${step.type}`);
    }
  }

  async function runAction(action) {
    const steps = Array.isArray(action.steps) ? action.steps : [];
    if (!steps.length) return { ok: false, error: '该动作没有任何步骤' };
    const started = Date.now();
    for (let i = 0; i < steps.length; i++) {
      try {
        await executeStep(steps[i]);
      } catch (e) {
        return { ok: false, error: `第 ${i + 1} 步失败 (${steps[i].type}): ${e.message}`, stepIndex: i };
      }
    }
    return { ok: true, ms: Date.now() - started, commands: dryRun ? commands : undefined };
  }

  // 给 HUD 用的按键名（把 VK 转成 F13 / A / Enter 这种）
  function vkLabel(vk) {
    if (VK_MOUSE[vk]) return { left: '左键', right: '右键', middle: '中键' }[VK_MOUSE[vk]];
    if (VK_MODS[vk]) return { shift: 'Shift', ctrl: 'Ctrl', alt: 'Alt', win: 'Win' }[VK_MODS[vk]];
    return vkToKey(vk) || '';
  }

  return { runAction, executeStep, commands, sendKeys, mouseClick, pasteText, pasteImage, getMousePosition, record, eventsToSteps, vkLabel };
}

module.exports = {
  createExecutor,
  buildSendKeys,
  buildXdotoolKey,
  buildAppleScriptKeys,
  PLATFORM,
};
