import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, CodePurpose } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Database, serializable } from '../common/database';
import { AccessDto, ForgotDto, LoginDto, RegisterDto, ResetDto, VerifyDto } from './auth.dto';
import { Actor } from './auth.guard';
import { MailService } from './mail.service';

@Injectable()
export class AuthService {
  private limits = new Map<string, { count: number; until: number }>();
  constructor(
    private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}
  private throttle(key: string, maximum: number, minutes = 15) {
    const now = Date.now();
    for (const [k, v] of this.limits) if (v.until <= now) this.limits.delete(k);
    const item = this.limits.get(key);
    if (item && item.count >= maximum)
      throw new HttpException('Too many attempts. Please try again later.', 429);
    this.limits.set(
      key,
      item ? { ...item, count: item.count + 1 } : { count: 1, until: now + minutes * 60000 },
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
  private digest(code: string, userId: string, purpose: CodePurpose) {
    return createHmac('sha256', process.env.JWT_SECRET!)
      .update(`${purpose}:${userId}:${code}`)
      .digest('hex');
  }
  private async issue(userId: string, email: string, purpose: CodePurpose) {
    const code = randomInt(100000, 1000000).toString();
    const challenge = await serializable(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const latest = await tx.passwordReset.findFirst({
        where: { userId, purpose, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < 60000)
        throw new HttpException('Please wait 60 seconds before requesting another code.', 429);
      await tx.passwordReset.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return tx.passwordReset.create({
        data: {
          userId,
          purpose,
          codeHash: this.digest(code, userId, purpose),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
    });
    try {
      await this.mail.code(email, code, purpose);
    } catch (error) {
      await this.db.passwordReset.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw error;
    }
    return { ...this.mail.publicInfo(), expiresInSeconds: 600, resendAfterSeconds: 60 };
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
        status: 'PENDING',
      },
    });
    const delivery = await this.issue(user.id, user.email, 'VERIFY_EMAIL');
    return {
      message: 'Account created. Verify your email, then a manager can approve workspace access.',
      email: user.email,
      requiresVerification: true,
      ...delivery,
    };
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
    if (!user.emailVerifiedAt)
      throw new ForbiddenException({
        message: 'Verify your email before signing in.',
        code: 'EMAIL_UNVERIFIED',
        email: user.email,
      });
    if (user.status !== 'ACTIVE')
      throw new ForbiddenException(
        user.status === 'PENDING'
          ? 'Your email is verified. A manager must approve your workspace access.'
          : 'Your account is disabled. Contact a manager.',
      );
    this.limits.delete(`identity:${identity}`);
    return {
      token: await this.jwt.signAsync({ sub: user.id, version: user.tokenVersion }),
      user: this.identity(user),
    };
  }
  async logout(id: string) {
    await this.db.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  }
  async resend(dto: ForgotDto, ip: string) {
    this.throttle(`verify-send:${ip}`, 10);
    const email = dto.email.toLowerCase();
    this.throttle(`verify-email:${email}`, 5);
    const user = await this.db.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt && user.status !== 'DISABLED')
      await this.issue(user.id, email, 'VERIFY_EMAIL');
    return {
      message: 'If this account needs verification, a new code has been sent.',
      email,
      ...this.mail.publicInfo(),
      resendAfterSeconds: 60,
    };
  }
  async verify(dto: VerifyDto, ip: string) {
    this.throttle(`verify:${ip}`, 20);
    const email = dto.email.toLowerCase();
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || !(await compare(dto.password, user.passwordHash)))
      throw new BadRequestException('Check your email, account password, and verification code.');
    const success = await this.consume(user.id, dto.code, 'VERIFY_EMAIL', async (tx) => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (current.status === 'DISABLED') return false;
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date(), tokenVersion: { increment: 1 } },
      });
      return true;
    });
    if (!success)
      throw new BadRequestException(
        'The code is invalid, expired, or already used. Request a new code.',
      );
    return {
      message:
        'Email verified. Ask your inventory manager to approve your account in Settings → Team.',
      verified: true,
    };
  }
  async forgot(dto: ForgotDto, ip: string) {
    this.throttle(`forgot:${ip}`, 10);
    const email = dto.email.toLowerCase();
    this.throttle(`forgot-email:${email}`, 3);
    const user = await this.db.user.findUnique({ where: { email } });
    if (user && user.status !== 'DISABLED') await this.issue(user.id, email, 'RESET_PASSWORD');
    return {
      message: 'If this email is registered, a reset code has been sent.',
      ...this.mail.publicInfo(),
      resendAfterSeconds: 60,
    };
  }
  private async consume(
    userId: string,
    code: string,
    purpose: CodePurpose,
    action: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<boolean>,
  ) {
    return serializable(this.db, async (tx) => {
      const challenge = await tx.passwordReset.findFirst({
        where: {
          userId,
          purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: 5 },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!challenge) return false;
      await tx.passwordReset.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      if (
        !timingSafeEqual(
          Buffer.from(challenge.codeHash, 'hex'),
          Buffer.from(this.digest(code, userId, purpose), 'hex'),
        )
      )
        return false;
      if (!(await action(tx))) return false;
      await tx.passwordReset.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return true;
    });
  }
  async reset(dto: ResetDto, ip: string) {
    this.throttle(`reset:${ip}`, 15);
    const user = await this.db.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const passwordHash = await hash(dto.password, 12);
    const success =
      user &&
      (await this.consume(user.id, dto.code, 'RESET_PASSWORD', async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash, tokenVersion: { increment: 1 } },
        });
        return true;
      }));
    if (!success)
      throw new BadRequestException(
        'The code is invalid, expired, or already used. Request a new code.',
      );
    return { message: 'Password updated. Sign in with your new password.' };
  }
  async access(id: string, dto: AccessDto, actor: Actor) {
    if (id === actor.id)
      throw new BadRequestException('Ask another manager to change your own access.');
    return serializable(this.db, async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('User not found.');
      if (dto.status === AccountStatus.ACTIVE && !user.emailVerifiedAt)
        throw new BadRequestException('The user must verify their email before approval.');
      if (
        user.role === 'MANAGER' &&
        (dto.role === 'STAFF' || dto.status !== 'ACTIVE') &&
        (await tx.user.count({ where: { role: 'MANAGER', status: 'ACTIVE' } })) <= 1
      )
        throw new BadRequestException('Keep at least one active manager.');
      return tx.user.update({
        where: { id },
        data: { status: dto.status, role: dto.role, tokenVersion: { increment: 1 } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
        },
      });
    });
  }
}
