// Start the browser-test API in an isolated database; never touch the demo database.
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const url = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/stocksense_test')
  throw new Error('Refusing to reset a database other than local stocksense_test:55432.');
const cwd = path.resolve(__dirname, '../apps/api');
const env = {
  ...process.env,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  PORT: '3002',
  WEB_ORIGIN: 'http://127.0.0.1:5174',
  DEMO_PASSWORD: 'StockSense!2026',
  MAIL_MODE: 'local',
};
async function main() {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd,
    env,
    stdio: 'inherit',
  });
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try {
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "LedgerEntry", "Reservation", "OperationLine", "Operation", "StockBalance", "ReorderRule", "PasswordReset", "Product", "Category", "Location", "Warehouse", "Contact", "User" RESTART IDENTITY CASCADE',
    );
  } finally {
    await db.$disconnect();
  }
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {
    cwd,
    env,
    stdio: 'inherit',
  });
  const child = spawn(process.execPath, ['dist/main.js'], { cwd, env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      child.kill();
      process.exit();
    });
  child.on('exit', (code) => process.exit(code || 0));
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
