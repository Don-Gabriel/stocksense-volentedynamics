import { Body, Controller, Get, Module, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { ReportService } from './report.service';
import { FilterDto, OperationDto } from './inventory.dto';
import { AuthRequest } from '../auth/auth.guard';

@Controller('operations')
class OperationsController {
  constructor(private readonly inventory: InventoryService) {}
  @Get() list(@Query() filter: FilterDto) {
    return this.inventory.list(filter);
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.inventory.detail(id);
  }
  @Post() create(@Body() dto: OperationDto, @Req() req: AuthRequest) {
    return this.inventory.create(dto, req.user);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() dto: OperationDto,
    @Req() req: AuthRequest,
  ) {
    return this.inventory.update(id, dto, req.user);
  }
  @Post(':id/:action') action(
    @Param('id') id: string,
    @Param('action') action: string,
    @Req() req: AuthRequest,
  ) {
    return this.inventory.action(id, action, req.user);
  }
}
@Controller()
class ReportsController {
  constructor(private readonly reports: ReportService) {}
  @Get('inventory/stock') stock(@Query() filter: FilterDto) {
    return this.reports.stock(filter);
  }
  @Get('inventory/ledger') ledger(@Query() filter: FilterDto) {
    return this.reports.ledger(filter);
  }
  @Get('dashboard') dashboard(@Query() filter: FilterDto) {
    return this.reports.dashboard(filter);
  }
}
@Module({
  controllers: [OperationsController, ReportsController],
  providers: [InventoryService, ReportService],
  exports: [InventoryService, ReportService],
})
export class InventoryModule {}
