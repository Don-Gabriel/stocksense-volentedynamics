// Verify SMTP authentication without sending a message or printing credentials.
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const nodemailer = require('nodemailer');
async function main() {
  if (process.env.MAIL_MODE !== 'smtp')
    throw new Error('External email is not configured. Run scripts/configure-gmail.ps1 locally.');
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD)
    throw new Error('SMTP configuration is incomplete.');
  const secure = process.env.SMTP_SECURE === 'true';
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure,
    requireTLS: !secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 7000,
    greetingTimeout: 7000,
    socketTimeout: 10000,
  });
  try {
    await transport.verify();
    console.log(
      'SMTP connection and authentication succeeded. No email was sent. Use signup with a real recipient to verify inbox delivery.',
    );
  } catch {
    throw new Error(
      'SMTP verification failed. Check the Gmail app password, 2-Step Verification, account restrictions, and network. Credentials were not printed.',
    );
  } finally {
    transport.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
