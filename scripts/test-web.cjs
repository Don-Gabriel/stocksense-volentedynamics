const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(
  process.execPath,
  [path.resolve(__dirname, '../node_modules/vite/bin/vite.js'), '--port', '5174'],
  {
    cwd: path.resolve(__dirname, '../apps/web'),
    env: { ...process.env, API_TARGET: 'http://127.0.0.1:3002' },
    stdio: 'inherit',
  },
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    child.kill();
    process.exit();
  });
child.on('exit', (code) => process.exit(code || 0));
