const { PowerShellWorker } = require('E:/AI项目/yywl-keyboard-app/ps-worker.cjs');
(async () => {
  const t0 = Date.now();
  const w = new PowerShellWorker();
  await w.start();
  const boot = Date.now() - t0;
  console.log('启动 + C# 编译耗时:', boot, 'ms');

  const times = [];
  for (let i = 0; i < 5; i += 1) {
    const s = Date.now();
    await w.exec('$null = 1 + 1');
    times.push(Date.now() - s);
  }
  console.log('后续 5 次调用(ms):', times.join(', '));

  const { execFile } = require('child_process');
  const ps = 'Add-Type -TypeDefinition @"\nusing System;\nusing System.Runtime.InteropServices;\npublic class YywlSendT { [DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte b,byte s,uint f,IntPtr e); }\n"@\n$null = 1';
  const s2 = Date.now();
  await new Promise((res) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => res()));
  const oldMs = Date.now() - s2;
  console.log('老做法（每次 spawn + 编译）单次:', oldMs, 'ms');

  w.stop();
  const best = Math.min(...times);
  console.log('后续最快:', best, 'ms  → 提速约', Math.round(oldMs / Math.max(best, 1)), '倍');
  process.exit(best * 3 < oldMs ? 0 : 1);
})();