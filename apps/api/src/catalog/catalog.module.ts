import { Body, Controller, Get, Module, Param, Patch, Post, Req } from '@nestjs/common';
import { Database } from '../common/database';
import { AuthRequest, Manager } from '../auth/auth.guard';
import { InventoryModule } from '../inventory/inventory.module';
import { CatalogService } from './catalog.service';
import { ContactDto, LocationDto, NameDto, ProductDto, RuleDto, WarehouseDto } from './catalog.dto';
@Controller('catalog')
class CatalogController {
  constructor(
    private readonly db: Database,
    private readonly catalog: CatalogService,
  ) {}
  @Get() all() {
    return this.catalog.all();
  }
  @Manager() @Post('products') product(@Body() dto: ProductDto, @Req() req: AuthRequest) {
    return this.catalog.product(dto, req.user);
  }
  @Manager() @Patch('products/:id') updateProduct(
    @Param('id') id: string,
    @Body() dto: ProductDto,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.product(dto, req.user, id);
  }
  @Manager() @Post('categories') category(@Body() dto: NameDto) {
    return this.db.category.create({ data: { name: dto.name.trim() } });
  }
  @Manager() @Patch('categories/:id') updateCategory(
    @Param('id') id: string,
    @Body() dto: NameDto,
  ) {
    return this.db.category.update({ where: { id }, data: { name: dto.name.trim() } });
  }
  @Manager() @Post('warehouses') warehouse(@Body() dto: WarehouseDto) {
    return this.db.warehouse.create({
      data: { ...dto, code: dto.code.toUpperCase(), name: dto.name.trim() },
    });
  }
  @Manager() @Patch('warehouses/:id') updateWarehouse(
    @Param('id') id: string,
    @Body() dto: WarehouseDto,
  ) {
    return this.db.warehouse.update({
      where: { id },
      data: { ...dto, code: dto.code.toUpperCase(), name: dto.name.trim() },
    });
  }
  @Manager() @Post('locations') location(@Body() dto: LocationDto) {
    return this.db.location.create({
      data: { ...dto, code: dto.code.toUpperCase(), name: dto.name.trim() },
    });
  }
  @Manager() @Patch('locations/:id') updateLocation(
    @Param('id') id: string,
    @Body() dto: LocationDto,
  ) {
    return this.catalog.location(id, dto);
  }
  @Manager() @Post('contacts') contact(@Body() dto: ContactDto) {
    return this.db.contact.create({ data: { ...dto, name: dto.name.trim() } });
  }
  @Manager() @Patch('contacts/:id') updateContact(
    @Param('id') id: string,
    @Body() dto: ContactDto,
  ) {
    return this.catalog.contact(id, dto);
  }
  @Manager() @Post('rules') rule(@Body() dto: RuleDto) {
    return this.catalog.rule(dto);
  }
}
@Module({
  imports: [InventoryModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
