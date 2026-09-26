import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  configuration() {
    const mode = process.env.MAIL_MODE || 'local';
    if (!['local', 'smtp'].includes(mode))
      throw new ServiceUnavailableException('Email delivery mode is not configured correctly.');
    const local = mode === 'local';
    const host = local ? '127.0.0.1' : process.env.SMTP_HOST;
    const port = local ? 1025 : Number(process.env.SMTP_PORT || 465);
    const secure = !local && process.env.SMTP_SECURE === 'true';
    if (
      !local &&
      (!host || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM)
    )
      throw new ServiceUnavailableException(
        'Email delivery needs a sender account. Contact your manager.',
      );
    return { local, host: host!, port, secure };
  }
  publicInfo() {
    const { local } = this.configuration();
    return {
      delivery: local ? 'local' : 'smtp',
      ...(local ? { previewUrl: 'http://127.0.0.1:8025' } : {}),
    };
  }
  async code(email: string, code: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    const { local, host, port, secure } = this.configuration();
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !local && !secure,
      ...(!local ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {}),
      connectionTimeout: 7000,
      greetingTimeout: 7000,
      socketTimeout: 10000,
    });
    const label = purpose === 'VERIFY_EMAIL' ? 'email verification' : 'password reset';
    try {
      await transport.sendMail({
        from: local ? 'StockSense <no-reply@stocksense.local>' : process.env.SMTP_FROM,
        to: email,
        subject: `Your StockSense ${label} code`,
        text: `Your StockSense ${label} code is ${code}.\n\nIt expires in 10 minutes and can be used once. Never share it. If you did not request this code, ignore this email.`,
      });
    } catch {
      throw new ServiceUnavailableException(
        'We could not send the email. Check the sender configuration and request a new code.',
      );
    } finally {
      transport.close();
    }
  }
}
