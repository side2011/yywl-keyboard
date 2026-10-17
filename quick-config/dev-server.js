// dev-server.js — 启动 Vite dev server + Electron
const { spawn } = require('child_process');
const electron = require('electron');
const vite = require('vite');

(async () => {
  const server = await vite.createServer({
    configFile: __dirname + '/vite.config.js',
  });
  await server.listen();
  const info = server.resolvedUrls;
  const url = info.local[0] || 'http://localhost:5173/';
  console.log('[dev] Vite server running at', url);

  const child = spawn(electron, ['.'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });

  child.on('close', () => {
    server.close();
    process.exit();
  });
})();
