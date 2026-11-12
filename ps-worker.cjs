// 常驻 PowerShell 输入代理（Windows）
//
// 为什么需要它：
//   原来每次 sendKeys / mouseClick 都 spawn 一个 powershell，
//   里面用 Add-Type -TypeDefinition 现场编译 C#（keybd_event 的 P/Invoke），
//   单这一项就要 400~900ms；客户看到的就是"粘贴文本延迟一秒左右"。
//   改成常驻进程：C# 只编译一次，之后的按键事件 5~20ms。
//
// 协议：stdin 每行 `id base64(ps命令)`；stdout 回 `DONE id` 或 `ERR id 消息`。
const { spawn } = require('child_process');

// 只包含 C# 类型定义（YywlSend）的 PowerShell 片段。
// 常驻代理与"单次 spawn 兜底"都要用，所以单独导出，避免两边漂移。
const ADD_TYPE_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class YywlSend {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
}
"@
`;

// 常驻代理：类型定义 + 读 stdin 循环
const WORKER_PS = ADD_TYPE_PS + `
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq 'QUIT') { break }
  $space = $line.IndexOf(' ')
  $id = $line.Substring(0, $space)
  $b64 = $line.Substring($space + 1)
  try {
    $cmd = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
    Invoke-Expression $cmd | Out-Null
    [Console]::Out.WriteLine("DONE $id")
  } catch {
    [Console]::Out.WriteLine("ERR $id " + $_.Exception.Message.Replace([char]10, ' ').Replace([char]13, ' '))
  }
  [Console]::Out.Flush()
}
`;

class PowerShellWorker {
  constructor() {
    this.child = null;
    this.ready = null;
    this.queue = new Map();
    this.nextId = 1;
    this.buffer = '';
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
      );
      this.child = child;
      let started = false;
      const timer = setTimeout(() => {
        if (!started) { try { child.kill(); } catch { /* 忽略 */ } reject(new Error('PowerShell 代理启动超时')); }
      }, 15000);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        let idx;
        while ((idx = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, idx).trim();
          this.buffer = this.buffer.slice(idx + 1);
          if (!line) continue;
          if (line === 'READY') {
            started = true;
            clearTimeout(timer);
            resolve();
            continue;
          }
          const m = /^(DONE|ERR) (\d+)(?: (.*))?$/.exec(line);
          if (!m) continue;
          const id = Number(m[2]);
          const pending = this.queue.get(id);
          if (!pending) continue;
          this.queue.delete(id);
          clearTimeout(pending.timer);
          if (m[1] === 'DONE') pending.resolve();
          else pending.reject(new Error(m[3] || 'PowerShell 执行失败'));
        }
      });

      child.on('error', (e) => {
        clearTimeout(timer);
        if (!started) reject(e);
      });
      child.on('exit', () => {
        this.child = null;
        this.ready = null;
        for (const [, p] of this.queue) { clearTimeout(p.timer); p.reject(new Error('PowerShell 代理已退出')); }
        this.queue.clear();
      });

      child.stdin.write(WORKER_PS);
      child.stdin.write('\n');
    });
    return this.ready;
  }

  async exec(code, timeoutMs = 8000) {
    await this.start();
    const id = this.nextId++;
    const payload = Buffer.from(code, 'utf8').toString('base64');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.queue.delete(id);
        reject(new Error('PowerShell 执行超时'));
      }, timeoutMs);
      this.queue.set(id, { resolve, reject, timer });
      try {
        this.child.stdin.write(`${id} ${payload}\n`);
      } catch (e) {
        clearTimeout(timer);
        this.queue.delete(id);
        reject(e);
      }
    });
  }

  stop() {
    if (this.child) {
      try { this.child.stdin.write('QUIT\n'); } catch { /* 忽略 */ }
      setTimeout(() => { try { if (this.child) this.child.kill(); } catch { /* 忽略 */ } }, 300);
    }
  }
}

module.exports = { PowerShellWorker, WORKER_PS, ADD_TYPE_PS };
