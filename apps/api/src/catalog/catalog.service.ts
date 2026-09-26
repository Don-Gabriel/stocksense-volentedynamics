import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Database, serializable } from '../common/database';
import { ContactDto, LocationDto, ProductDto, RuleDto } from './catalog.dto';
import { InventoryService } from '../inventory/inventory.service';
import { Actor } from '../auth/auth.guard';

@Injectable()
export class CatalogService {
  constructor(
    private readonly db: Database,
    private readonly inventory: InventoryService,
  ) {}
  async location(id: string, dto: LocationDto) {
    return serializable(this.db, async (tx) => {
      const location = await tx.location.findUnique({ where: { id } });
      if (!location) throw new NotFoundException('Location not found.');
      if (
        location.warehouseId !== dto.warehouseId &&
        (await tx.operation.count({ where: { OR: [{ sourceId: id }, { destinationId: id }] } }))
      )
        throw new BadRequestException(
          'A location used in inventory documents cannot move to another warehouse. Create a new location and transfer its stock.',
        );
      return tx.location.update({
        where: { id },
        data: { ...dto, code: dto.code.toUpperCase(), name: dto.name.trim() },
      });
    });
  }
  async contact(id: string, dto: ContactDto) {
    return serializable(this.db, async (tx) => {
      const contact = await tx.contact.findUnique({ where: { id } });
      if (!contact) throw new NotFoundException('Contact not found.');
      if (contact.type !== dto.type && (await tx.operation.count({ where: { contactId: id } })))
        throw new BadRequestException(
          'A contact used in inventory documents cannot change type. Add a separate supplier or customer record.',
        );
      return tx.contact.update({ where: { id }, data: { ...dto, name: dto.name.trim() } });
    });
  }
  async all(actor?: Actor) {
    const [products, categories, warehouses, locations, contacts, users, rules] =
      await this.db.$transaction([
        this.db.product.findMany({
          include: { category: true, balances: true },
          orderBy: { name: 'asc' },
        }),
        this.db.category.findMany({ orderBy: { name: 'asc' } }),
        this.db.warehouse.findMany({
          include: { _count: { select: { locations: true } } },
          orderBy: { name: 'asc' },
        }),
        this.db.location.findMany({ include: { warehouse: true }, orderBy: { name: 'asc' } }),
        this.db.contact.findMany({ orderBy: { name: 'asc' } }),
        this.db.user.findMany({
          where:
            actor?.role === 'MANAGER' ? {} : { status: 'ACTIVE', emailVerifiedAt: { not: null } },
          select: {
            id: true,
            name: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            ...(actor?.role === 'MANAGER' ? { email: true } : {}),
          },
          orderBy: { name: 'asc' },
        }),
        this.db.reorderRule.findMany({
          include: { product: true, location: { include: { warehouse: true } } },
        }),
      ]);
    return { products, categories, warehouses, locations, contacts, users, rules };
  }
  async product(dto: ProductDto, actor: Actor, id?: string) {
    if (dto.active === false && dto.initialStock)
      throw new BadRequestException('An archived product cannot have opening stock.');
    if (id && (dto.initialStock !== undefined || dto.locationId))
      throw new BadRequestException('Use an adjustment to change existing stock.');
    if (dto.unit === 'PCS' && dto.initialStock && !Number.isInteger(dto.initialStock))
      throw new BadRequestException('Opening stock must be a whole number for pieces.');
    if (dto.initialStock && !dto.locationId)
      throw new BadRequestException('Choose a location for opening stock.');
    return serializable(this.db, async (tx) => {
      if (id) {
        const existing = await tx.product.findUnique({
          where: { id },
          include: { _count: { select: { lines: true } } },
        });
        if (!existing) throw new NotFoundException('Product not found.');
        if (existing.unit !== dto.unit && existing._count.lines)
          throw new BadRequestException('The unit cannot change after inventory documents exist.');
        if (
          dto.active === false &&
          (await tx.operationLine.count({
            where: { productId: id, operation: { status: { in: ['DRAFT', 'WAITING', 'READY'] } } },
          }))
        )
          throw new BadRequestException(
            'Complete or cancel open operations before archiving this product.',
          );
        if (
          dto.active === false &&
          (await tx.stockBalance.count({ where: { productId: id, onHand: { gt: 0 } } }))
        )
          throw new BadRequestException('Clear remaining stock before archiving this product.');
      }
      const data = {
        name: dto.name.trim(),
        sku: dto.sku.toUpperCase(),
        unit: dto.unit,
        categoryId: dto.categoryId,
        unitCost: dto.unitCost,
        description: dto.description?.trim() || '',
        active: dto.active ?? true,
      };
      const product = id
        ? await tx.product.update({ where: { id }, data })
        : await tx.product.create({ data });
      if (!id && dto.initialStock)
        await this.inventory.openingStock(tx, product.id, dto.locationId!, dto.initialStock, actor);
      return product;
    });
  }
  async rule(dto: RuleDto) {
    if (dto.target < dto.minimum)
      throw new BadRequestException('Target quantity must be at least the minimum.');
    const product = await this.db.product.findUnique({ where: { id: dto.productId } });
    if (!product || !product.active) throw new BadRequestException('Choose an active product.');
    if (product.unit === 'PCS' && (!Number.isInteger(dto.minimum) || !Number.isInteger(dto.target)))
      throw new BadRequestException('Use whole quantities for piece-based products.');
    return this.db.reorderRule.upsert({
      where: { productId_locationId: { productId: dto.productId, locationId: dto.locationId } },
      create: dto,
      update: { minimum: dto.minimum, target: dto.target },
    });
  }
}
