import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { Database, serializable } from '../common/database';
import { ForgotDto, LoginDto, RegisterDto, ResetDto } from './auth.dto';
import { Actor } from './auth.guard';

@Injectable()
export class AuthService {
  private limits = new Map<string, { count: number; until: number }>();
  constructor(
    private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}
  private throttle(key: string, maximum: number, minutes = 15) {
    const now = Date.now();
    if (this.limits.size > 1000)
      for (const [k, v] of this.limits) if (v.until < now) this.limits.delete(k);
    const item = this.limits.get(key);
    if (item && item.until > now && item.count >= maximum)
      throw new HttpException('Too many attempts. Please try again later.', 429);
    this.limits.set(
      key,
      item && item.until > now
        ? { ...item, count: item.count + 1 }
        : { count: 1, until: now + minutes * 60000 },
    );
  }
  private identity(user: Actor) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
  private async session(user: Actor & { tokenVersion: number }) {
    return {
      token: await this.jwt.signAsync({ sub: user.id, version: user.tokenVersion }),
      user: this.identity(user),
    };
  }
  async register(dto: RegisterDto, ip: string) {
    this.throttle(`register:${ip}`, 10);
    const user = await this.db.user.create({
      data: {
        username: dto.username.toLowerCase(),
        email: dto.email.toLowerCase(),
        name: dto.name.trim(),
        passwordHash: await hash(dto.password, 12),
        role: 'STAFF',
      },
    });
    return this.session(user);
  }
  async login(dto: LoginDto, ip: string) {
    this.throttle(`login:${ip}`, 30);
    const identity = dto.identity.trim().toLowerCase();
    this.throttle(`identity:${identity}`, 15);
    const user = await this.db.user.findFirst({
      where: { OR: [{ username: identity }, { email: identity }] },
    });
    if (!user || !(await compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException('Invalid login ID or password.');
    this.limits.delete(`identity:${identity}`);
    return this.session(user);
  }
  async logout(id: string) {
    await this.db.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  }
  private digest(code: string) {
    return createHmac('sha256', process.env.JWT_SECRET!).update(code).digest('hex');
  }
  async forgot(dto: ForgotDto, ip: string) {
    this.throttle(`forgot:${ip}`, 10);
    const email = dto.email.toLowerCase();
    this.throttle(`forgot-email:${email}`, 3);
    const user = await this.db.user.findUnique({ where: { email } });
    if (user) {
      const code = randomInt(100000, 1000000).toString();
      const reset = await serializable(this.db, async (tx) => {
        await tx.passwordReset.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        return tx.passwordReset.create({
          data: {
            userId: user.id,
            codeHash: this.digest(code),
            expiresAt: new Date(Date.now() + 10 * 60000),
          },
        });
      });
      try {
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST || '127.0.0.1',
          port: Number(process.env.SMTP_PORT || 1025),
          secure: process.env.SMTP_SECURE === 'true',
          ...(process.env.SMTP_USER
            ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
            : {}),
          connectionTimeout: 5000,
        });
        await transport.sendMail({
          from: process.env.SMTP_FROM || 'StockSense <no-reply@stocksense.local>',
          to: email,
          subject: 'Your StockSense password reset code',
          text: `Your StockSense reset code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
        });
      } catch {
        await this.db.passwordReset.update({
          where: { id: reset.id },
          data: { consumedAt: new Date() },
        });
        throw new ServiceUnavailableException(
          'Email is unavailable. Start the local mail service or contact your administrator.',
        );
      }
    }
    return {
      message: 'If this email is registered, a reset code has been sent.',
      previewUrl: process.env.NODE_ENV === 'production' ? undefined : process.env.MAIL_PREVIEW_URL,
    };
  }
  async reset(dto: ResetDto, ip: string) {
    this.throttle(`reset:${ip}`, 15);
    const passwordHash = await hash(dto.password, 12);
    const success = await serializable(this.db, async (tx) => {
      const user = await tx.user.findUnique({ where: { email: dto.email.toLowerCase() } });
      if (!user) return false;
      const reset = await tx.passwordReset.findFirst({
        where: {
          userId: user.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: 5 },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!reset) return false;
      await tx.passwordReset.update({
        where: { id: reset.id },
        data: { attempts: { increment: 1 } },
      });
      if (
        !timingSafeEqual(
          Buffer.from(reset.codeHash, 'hex'),
          Buffer.from(this.digest(dto.code), 'hex'),
        )
      )
        return false;
      await tx.passwordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      return true;
    });
    if (!success)
      throw new BadRequestException(
        'The code is invalid, expired, or already used. Request a new code.',
      );
    return { message: 'Password updated. Sign in with your new password.' };
  }
}
