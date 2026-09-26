import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './common/http';
async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error('Set a random JWT_SECRET of at least 32 characters in apps/api/.env.');
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3001);
  await app.listen(port, '127.0.0.1');
  console.log(`StockSense API ready at http://127.0.0.1:${port}/api`);
}
void main();
