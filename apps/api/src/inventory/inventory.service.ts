import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OperationType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Database, decimal, serializable } from '../common/database';
import { Actor } from '../auth/auth.guard';
import { FilterDto, OperationDto } from './inventory.dto';

const include = {
  source: { include: { warehouse: true } },
  destination: { include: { warehouse: true } },
  contact: true,
  responsible: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  lines: { include: { product: { include: { category: true } }, reservation: true, ledger: true } },
} satisfies Prisma.OperationInclude;
type Transaction = Prisma.TransactionClient;
const typeCodes: Record<OperationType, string> = {
  RECEIPT: 'IN',
  DELIVERY: 'OUT',
  TRANSFER: 'INT',
  ADJUSTMENT: 'ADJ',
};
export function operationWhere(filter: FilterDto): Prisma.OperationWhereInput {
  const and: Prisma.OperationWhereInput[] = [];
  if (filter.search)
    and.push({
      OR: [
        { reference: { contains: filter.search, mode: 'insensitive' } },
        { contact: { name: { contains: filter.search, mode: 'insensitive' } } },
        {
          lines: {
            some: {
              product: {
                OR: [
                  { name: { contains: filter.search, mode: 'insensitive' } },
                  { sku: { contains: filter.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ],
    });
  if (filter.locationId)
    and.push({ OR: [{ sourceId: filter.locationId }, { destinationId: filter.locationId }] });
  if (filter.warehouseId)
    and.push({
      OR: [
        { source: { warehouseId: filter.warehouseId } },
        { destination: { warehouseId: filter.warehouseId } },
      ],
    });
  if (filter.categoryId)
    and.push({ lines: { some: { product: { categoryId: filter.categoryId } } } });
  if (filter.productId) and.push({ lines: { some: { productId: filter.productId } } });
  if (filter.late === 'true')
    and.push({ scheduledAt: { lt: new Date() }, status: { in: ['DRAFT', 'WAITING', 'READY'] } });
  if (filter.from || filter.to)
    and.push({
      scheduledAt: {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      },
    });
  return {
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    AND: and,
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly db: Database) {}
  async openingStock(
    tx: Transaction,
    productId: string,
    locationId: string,
    quantity: number,
    actor: Actor,
  ) {
    const location = await tx.location.findUnique({
      where: { id: locationId },
      include: { warehouse: true },
    });
    if (!location) throw new BadRequestException('Choose a valid opening-stock location.');
    const op = await tx.operation.create({
      data: {
        reference: `pending-${randomUUID()}`,
        type: 'ADJUSTMENT',
        status: 'DONE',
        destinationId: locationId,
        responsibleId: actor.id,
        createdById: actor.id,
        scheduledAt: new Date(),
        completedAt: new Date(),
        reason: 'Opening stock',
        lines: { create: { productId, quantity, systemQuantity: 0, expectedVersion: 0 } },
      },
      include: { lines: true },
    });
    await tx.operation.update({
      where: { id: op.id },
      data: { reference: `${location.warehouse.code}/ADJ/${String(op.number).padStart(5, '0')}` },
    });
    await this.post(tx, op.lines[0].id, productId, locationId, decimal(quantity), actor.id);
  }
  private authorize(type: OperationType, actor: Actor) {
    if (type === 'ADJUSTMENT' && actor.role !== 'MANAGER')
      throw new ForbiddenException('Only a manager can adjust physical stock.');
  }
  private async verify(tx: Transaction, dto: OperationDto, actor: Actor) {
    this.authorize(dto.type, actor);
    if (!dto.lines.length || new Set(dto.lines.map((x) => x.productId)).size !== dto.lines.length)
      throw new BadRequestException('Add each product once. Combine duplicate quantities.');
    if (dto.type === 'RECEIPT' && (!dto.destinationId || dto.sourceId))
      throw new BadRequestException(
        'A receipt needs a destination location and no internal source.',
      );
    if (dto.type === 'DELIVERY' && (!dto.sourceId || dto.destinationId))
      throw new BadRequestException(
        'A delivery needs a source location and no internal destination.',
      );
    if (
      dto.type === 'TRANSFER' &&
      (!dto.sourceId || !dto.destinationId || dto.sourceId === dto.destinationId)
    )
      throw new BadRequestException('Choose different source and destination locations.');
    if (dto.type === 'ADJUSTMENT' && (!dto.destinationId || dto.sourceId || !dto.reason?.trim()))
      throw new BadRequestException('An adjustment needs a location and a reason.');
    for (const id of [dto.sourceId, dto.destinationId].filter(Boolean) as string[])
      if (!(await tx.location.findUnique({ where: { id } })))
        throw new BadRequestException('Choose a valid location.');
    if (dto.type === 'RECEIPT' || dto.type === 'DELIVERY') {
      const contact = dto.contactId
        ? await tx.contact.findUnique({ where: { id: dto.contactId } })
        : null;
      if (!contact || contact.type !== (dto.type === 'RECEIPT' ? 'SUPPLIER' : 'CUSTOMER'))
        throw new BadRequestException(
          `Choose a ${dto.type === 'RECEIPT' ? 'supplier' : 'customer'}.`,
        );
    } else if (dto.contactId)
      throw new BadRequestException('Internal operations do not need an external contact.');
    if (dto.responsibleId && !(await tx.user.findUnique({ where: { id: dto.responsibleId } })))
      throw new BadRequestException('Choose a valid responsible user.');
    const products = await tx.product.findMany({
      where: { id: { in: dto.lines.map((x) => x.productId) }, active: true },
    });
    for (const line of dto.lines) {
      const product = products.find((p) => p.id === line.productId);
      if (!product) throw new BadRequestException('One of the products is missing or archived.');
      if (
        !Number.isFinite(line.quantity) ||
        line.quantity < 0 ||
        (dto.type !== 'ADJUSTMENT' && line.quantity <= 0)
      )
        throw new BadRequestException(
          `${product.name}: enter a ${dto.type === 'ADJUSTMENT' ? 'non-negative count' : 'positive quantity'}.`,
        );
      if (product.unit === 'PCS' && !Number.isInteger(line.quantity))
        throw new BadRequestException(`${product.name} is counted in whole pieces.`);
    }
  }
  private async lineData(tx: Transaction, dto: OperationDto) {
    const result = [];
    for (const line of dto.lines) {
      const stock =
        dto.type === 'ADJUSTMENT'
          ? await tx.stockBalance.findUnique({
              where: {
                productId_locationId: { productId: line.productId, locationId: dto.destinationId! },
              },
            })
          : null;
      result.push({
        productId: line.productId,
        quantity: decimal(line.quantity),
        ...(dto.type === 'ADJUSTMENT'
          ? { systemQuantity: stock?.onHand ?? decimal(0), expectedVersion: stock?.version ?? 0 }
          : {}),
      });
    }
    return result;
  }
  async create(dto: OperationDto, actor: Actor) {
    return serializable(this.db, async (tx) => {
      await this.verify(tx, dto, actor);
      const location = await tx.location.findUniqueOrThrow({
        where: { id: dto.sourceId || dto.destinationId! },
        include: { warehouse: true },
      });
      const operation = await tx.operation.create({
        data: {
          reference: `pending-${randomUUID()}`,
          type: dto.type,
          sourceId: dto.sourceId || null,
          destinationId: dto.destinationId || null,
          contactId: dto.contactId || null,
          responsibleId: dto.responsibleId || actor.id,
          createdById: actor.id,
          scheduledAt: new Date(dto.scheduledAt),
          notes: dto.notes?.trim() || '',
          reason: dto.reason?.trim() || '',
          deliveryAddress: dto.deliveryAddress?.trim() || '',
          lines: { create: await this.lineData(tx, dto) },
        },
      });
      return tx.operation.update({
        where: { id: operation.id },
        data: {
          reference: `${location.warehouse.code}/${typeCodes[dto.type]}/${String(operation.number).padStart(5, '0')}`,
        },
        include,
      });
    });
  }
  async update(id: string, dto: OperationDto, actor: Actor) {
    return serializable(this.db, async (tx) => {
      const old = await tx.operation.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Operation not found.');
      if (old.status !== 'DRAFT' || old.type !== dto.type)
        throw new BadRequestException('Only drafts can be edited. Operation type cannot change.');
      await this.verify(tx, dto, actor);
      await tx.operationLine.deleteMany({ where: { operationId: id } });
      return tx.operation.update({
        where: { id },
        data: {
          sourceId: dto.sourceId || null,
          destinationId: dto.destinationId || null,
          contactId: dto.contactId || null,
          responsibleId: dto.responsibleId || actor.id,
          scheduledAt: new Date(dto.scheduledAt),
          notes: dto.notes?.trim() || '',
          reason: dto.reason?.trim() || '',
          deliveryAddress: dto.deliveryAddress?.trim() || '',
          lines: { create: await this.lineData(tx, dto) },
        },
        include,
      });
    });
  }
  async list(filter: FilterDto) {
    const where = operationWhere(filter),
      page = filter.page || 1,
      limit = filter.limit || 30;
    const [items, total] = await this.db.$transaction([
      this.db.operation.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.operation.count({ where }),
    ]);
    return { items, total, page, limit };
  }
  async detail(id: string) {
    const op = await this.db.operation.findUnique({ where: { id }, include });
    if (!op) throw new NotFoundException('Operation not found.');
    const balances = op.sourceId
      ? await this.db.stockBalance.findMany({
          where: { locationId: op.sourceId, productId: { in: op.lines.map((x) => x.productId) } },
          include: { reservations: true },
        })
      : [];
    return {
      ...op,
      lines: op.lines.map((line) => {
        const stock = balances.find((x) => x.productId === line.productId);
        const heldByOthers =
          stock?.reservations
            .filter((r) => r.lineId !== line.id)
            .reduce((sum, r) => sum + Number(r.quantity), 0) || 0;
        return { ...line, available: Number(stock?.onHand || 0) - heldByOthers };
      }),
    };
  }
  async action(id: string, action: string, actor: Actor) {
    await serializable(this.db, async (tx) => {
      const op = await tx.operation.findUnique({ where: { id }, include });
      if (!op) throw new NotFoundException('Operation not found.');
      this.authorize(op.type, actor);
      if (action === 'validate' && op.status === 'DONE') return; // Safe repeated submission.
      if (['DONE', 'CANCELED'].includes(op.status))
        throw new BadRequestException('Completed and canceled operations cannot be changed.');
      if (action === 'cancel') {
        await tx.reservation.deleteMany({ where: { line: { operationId: id } } });
        await tx.operation.update({ where: { id }, data: { status: 'CANCELED' } });
        return;
      }
      if (action === 'confirm') {
        if (!['DRAFT', 'WAITING'].includes(op.status))
          throw new BadRequestException('This operation is already ready.');
        if (op.type === 'RECEIPT' || op.type === 'ADJUSTMENT') {
          await tx.operation.update({ where: { id }, data: { status: 'READY' } });
          return;
        }
        const allocations: { lineId: string; balanceId: string; quantity: Prisma.Decimal }[] = [];
        let sufficient = true;
        for (const line of [...op.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
          const stock = await tx.stockBalance.findUnique({
            where: {
              productId_locationId: { productId: line.productId, locationId: op.sourceId! },
            },
            include: { reservations: true },
          });
          const reserved =
            stock?.reservations.reduce((sum, r) => sum.plus(r.quantity), decimal(0)) || decimal(0);
          if (!stock || stock.onHand.minus(reserved).lt(line.quantity)) sufficient = false;
          else allocations.push({ lineId: line.id, balanceId: stock.id, quantity: line.quantity });
        }
        if (sufficient) await tx.reservation.createMany({ data: allocations });
        await tx.operation.update({
          where: { id },
          data: { status: sufficient ? 'READY' : 'WAITING' },
        });
        return;
      }
      if (op.status !== 'READY')
        throw new BadRequestException(
          'Confirm the operation and resolve availability before continuing.',
        );
      if (action === 'pick' || action === 'pack') {
        if (op.type !== 'DELIVERY')
          throw new BadRequestException('Picking and packing apply to deliveries only.');
        if (action === 'pack' && !op.pickedAt)
          throw new BadRequestException('Mark the goods as picked before packing.');
        await tx.operation.update({
          where: { id },
          data:
            action === 'pick'
              ? { pickedAt: op.pickedAt || new Date() }
              : { packedAt: op.packedAt || new Date() },
        });
        return;
      }
      if (action !== 'validate') throw new BadRequestException('Unknown operation action.');
      if (op.type === 'DELIVERY' && (!op.pickedAt || !op.packedAt))
        throw new BadRequestException('Pick and pack the goods before validating delivery.');
      for (const line of [...op.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        if (op.type === 'DELIVERY' || op.type === 'TRANSFER') {
          if (!line.reservation || !line.reservation.quantity.eq(line.quantity))
            throw new ConflictException(
              'Stock reservation is missing. Cancel and recreate this operation.',
            );
          await tx.reservation.delete({ where: { lineId: line.id } });
          await this.post(
            tx,
            line.id,
            line.productId,
            op.sourceId!,
            line.quantity.negated(),
            actor.id,
          );
        }
        if (op.type === 'RECEIPT' || op.type === 'TRANSFER')
          await this.post(tx, line.id, line.productId, op.destinationId!, line.quantity, actor.id);
        if (op.type === 'ADJUSTMENT') {
          const stock = await tx.stockBalance.findUnique({
            where: {
              productId_locationId: { productId: line.productId, locationId: op.destinationId! },
            },
          });
          if ((stock?.version || 0) !== line.expectedVersion)
            throw new ConflictException(
              `${line.product.name}: stock changed since counting. Cancel this adjustment and recount.`,
            );
          await this.post(
            tx,
            line.id,
            line.productId,
            op.destinationId!,
            line.quantity.minus(stock?.onHand || 0),
            actor.id,
          );
        }
      }
      await tx.operation.update({
        where: { id },
        data: { status: 'DONE', completedAt: new Date() },
      });
    });
    return this.detail(id);
  }
  private async post(
    tx: Transaction,
    lineId: string,
    productId: string,
    locationId: string,
    delta: Prisma.Decimal,
    actorId: string,
  ) {
    const stock = await tx.stockBalance.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: { productId, locationId },
      update: {},
      include: { reservations: true },
    });
    const after = stock.onHand.plus(delta);
    const reserved = stock.reservations.reduce((sum, r) => sum.plus(r.quantity), decimal(0));
    if (after.lt(0))
      throw new ConflictException('Stock is no longer sufficient. Refresh and check availability.');
    if (after.lt(reserved))
      throw new ConflictException(
        'This count conflicts with reserved goods. Cancel the affected reservations, then recount.',
      );
    await tx.stockBalance.update({
      where: { id: stock.id },
      data: { onHand: after, version: { increment: 1 } },
    });
    await tx.ledgerEntry.create({
      data: { lineId, productId, locationId, delta, before: stock.onHand, after, actorId },
    });
  }
}
