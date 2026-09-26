import { Controller, Get, Module } from '@nestjs/common';
import { Database, DatabaseModule } from './common/database';
import { AuthModule } from './auth/auth.module';
import { Public } from './auth/auth.guard';
import { InventoryModule } from './inventory/inventory.module';
import { CatalogModule } from './catalog/catalog.module';
@Controller('health')
class HealthController {
  constructor(private readonly db: Database) {}
  @Public() @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
@Module({
  imports: [DatabaseModule, AuthModule, InventoryModule, CatalogModule],
  controllers: [HealthController],
})
export class AppModule {}
