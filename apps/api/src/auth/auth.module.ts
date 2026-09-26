import { Body, Controller, Get, Module, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthGuard, AuthRequest, Manager, Public } from './auth.guard';
import { AuthService } from './auth.service';
import {
  AccessDto,
  ForgotDto,
  LoginDto,
  ProfileDto,
  RegisterDto,
  ResetDto,
  VerifyDto,
} from './auth.dto';
import { MailService } from './mail.service';
import { Database } from '../common/database';

@Controller('auth')
class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: Database,
  ) {}
  private cookie(res: Response, token: string) {
    res.cookie('stocksense_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
      maxAge: 8 * 60 * 60 * 1000,
    });
  }
  @Public() @Post('register') async register(
    @Body() dto: RegisterDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.register(dto, req.ip || 'local');
  }
  @Public() @Post('login') async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto, req.ip || 'local');
    this.cookie(res, session.token);
    return session.user;
  }
  @Get('me') me(@Req() req: AuthRequest) {
    return req.user;
  }
  @Post('logout') async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.user.id);
    res.clearCookie('stocksense_session', { path: '/api', httpOnly: true, sameSite: 'strict' });
    return { message: 'Signed out.' };
  }
  @Patch('profile') async profile(@Body() dto: ProfileDto, @Req() req: AuthRequest) {
    return this.db.user.update({
      where: { id: req.user.id },
      data: { name: dto.name.trim() },
      select: { id: true, name: true, username: true, email: true, role: true },
    });
  }
  @Public() @Post('forgot-password') forgot(@Body() dto: ForgotDto, @Req() req: AuthRequest) {
    return this.auth.forgot(dto, req.ip || 'local');
  }
  @Public() @Post('reset-password') reset(@Body() dto: ResetDto, @Req() req: AuthRequest) {
    return this.auth.reset(dto, req.ip || 'local');
  }
  @Public() @Post('verify-email') verify(@Body() dto: VerifyDto, @Req() req: AuthRequest) {
    return this.auth.verify(dto, req.ip || 'local');
  }
  @Public() @Post('resend-verification') resend(@Body() dto: ForgotDto, @Req() req: AuthRequest) {
    return this.auth.resend(dto, req.ip || 'local');
  }
  @Manager() @Patch('users/:id/access') access(
    @Param('id') id: string,
    @Body() dto: AccessDto,
    @Req() req: AuthRequest,
  ) {
    return this.auth.access(id, dto, req.user);
  }
}
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '8h' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MailService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
