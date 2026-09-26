import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let message: string | string[] = 'Something went wrong. Please try again.';
    let extra: { code?: string; email?: string } = {};
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const detail = exception.getResponse();
      if (typeof detail === 'object') {
        const data = detail as { code?: string; email?: string };
        extra = { code: data.code, email: data.email };
      }
      message =
        typeof detail === 'string' ? detail : (detail as { message: string | string[] }).message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        message = 'This record already exists. Use a unique code, name, or email.';
      }
      if (['P2003', 'P2025'].includes(exception.code)) {
        status = 400;
        message = 'A referenced record is missing or is still in use.';
      }
      if (exception.code === 'P2034') {
        status = 409;
        message = 'Stock changed during this request. Please refresh and retry.';
      }
    }
    if (status === 500)
      console.error(exception instanceof Error ? exception.message : 'Unhandled server error');
    response.status(status).json({ statusCode: status, message, ...extra });
  }
}

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  const origins = (process.env.WEB_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-StockSense-Client'],
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (
        req.headers['x-stocksense-client'] !== 'web' ||
        (req.headers.origin && !origins.includes(req.headers.origin))
      ) {
        res.status(403).json({ message: 'Request origin is not permitted.' });
        return;
      }
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
