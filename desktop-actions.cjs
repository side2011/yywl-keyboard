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
const { execFile } = require('child_process');
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

  const run = (file, args) => new Promise((resolve, reject) => {
    commands.push({ file, args });
    if (dryRun) return resolve({ stdout: '', stderr: '', dryRun: true });
    execFile(file, args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
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
      case 'keyPress': return sendKeys(step.keys);
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

  return { runAction, executeStep, commands, sendKeys, mouseClick, pasteText, pasteImage, getMousePosition };
}

module.exports = {
  createExecutor,
  buildSendKeys,
  buildXdotoolKey,
  buildAppleScriptKeys,
  PLATFORM,
};
