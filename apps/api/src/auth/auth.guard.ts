import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Database } from '../common/database';
import { Role } from '@prisma/client';
import type { Request } from 'express';

export const Public = () => SetMetadata('public', true);
export const Manager = () => SetMetadata('manager', true);
export type Actor = { id: string; username: string; email: string; name: string; role: Role };
export type AuthRequest = Request & { user: Actor };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: Database,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public', [context.getHandler(), context.getClass()]))
      return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.stocksense_session;
    if (!token) throw new UnauthorizedException('Please sign in to continue.');
    let payload: { sub: string; version: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Your session expired. Please sign in again.');
    }
    const user = await this.db.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.version)
      throw new UnauthorizedException('Please sign in again.');
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    if (
      this.reflector.getAllAndOverride('manager', [context.getHandler(), context.getClass()]) &&
      user.role !== 'MANAGER'
    )
      throw new ForbiddenException('This action needs a manager account.');
    return true;
  }
}
