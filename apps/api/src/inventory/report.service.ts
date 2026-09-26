import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from '../common/database';
import { FilterDto } from './inventory.dto';
import { operationWhere } from './inventory.service';

@Injectable()
export class ReportService {
  constructor(private readonly db: Database) {}
  async stockRows(filter: FilterDto) {
    const [products, locations] = await Promise.all([
      this.db.product.findMany({
        where: {
          active: true,
          ...(filter.productId ? { id: filter.productId } : {}),
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
          ...(filter.search
            ? {
                OR: [
                  { name: { contains: filter.search, mode: 'insensitive' } },
                  { sku: { contains: filter.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { category: true, balances: { include: { reservations: true } }, rules: true },
        orderBy: { name: 'asc' },
      }),
      this.db.location.findMany({
        where: {
          ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
          ...(filter.locationId ? { id: filter.locationId } : {}),
        },
        include: { warehouse: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return products.flatMap((product) =>
      locations.map((location) => {
        const balance = product.balances.find((x) => x.locationId === location.id),
          rule = product.rules.find((x) => x.locationId === location.id);
        const onHand = Number(balance?.onHand || 0),
          reserved = balance?.reservations.reduce((sum, r) => sum + Number(r.quantity), 0) || 0;
        const available = Math.round((onHand - reserved) * 1000) / 1000,
          minimum = Number(rule?.minimum || 0),
          target = Number(rule?.target || 0);
        return {
          id: `${product.id}:${location.id}`,
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            unit: product.unit,
            unitCost: product.unitCost,
            category: product.category,
          },
          location,
          onHand,
          reserved,
          available,
          minimum,
          target,
          hasRule: !!rule,
          suggested:
            rule && available <= minimum
              ? Math.max(0, Math.round((target - available) * 1000) / 1000)
              : 0,
          status: onHand === 0 ? 'OUT_OF_STOCK' : available <= minimum ? 'LOW_STOCK' : 'IN_STOCK',
        };
      }),
    );
  }
  async stock(filter: FilterDto) {
    const rows = (await this.stockRows(filter)).filter(
        (row) => !filter.stockStatus || row.status === filter.stockStatus,
      ),
      page = filter.page || 1,
      limit = filter.limit || 30;
    return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit };
  }
  async ledger(filter: FilterDto) {
    const where: Prisma.LedgerEntryWhereInput = {
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.locationId ? { locationId: filter.locationId } : {}),
      ...(filter.warehouseId ? { location: { warehouseId: filter.warehouseId } } : {}),
      ...(filter.categoryId ? { product: { categoryId: filter.categoryId } } : {}),
      line: { operation: operationWhere({ type: filter.type, status: filter.status }) },
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { product: { name: { contains: filter.search, mode: 'insensitive' } } },
              { product: { sku: { contains: filter.search, mode: 'insensitive' } } },
              {
                line: {
                  operation: { reference: { contains: filter.search, mode: 'insensitive' } },
                },
              },
              {
                line: {
                  operation: {
                    contact: { name: { contains: filter.search, mode: 'insensitive' } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const page = filter.page || 1,
      limit = filter.limit || 30;
    const [items, total] = await this.db.$transaction([
      this.db.ledgerEntry.findMany({
        where,
        include: {
          product: true,
          location: { include: { warehouse: true } },
          actor: { select: { name: true } },
          line: {
            include: {
              operation: {
                include: {
                  source: { include: { warehouse: true } },
                  destination: { include: { warehouse: true } },
                  contact: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.ledgerEntry.count({ where }),
    ]);
    return { items, total, page, limit };
  }
  async dashboard(filter: FilterDto) {
    const [stock, operations, recent] = await Promise.all([
      this.stockRows(filter),
      this.db.operation.findMany({
        where: operationWhere(filter),
        include: {
          contact: true,
          source: true,
          destination: true,
          responsible: { select: { name: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      this.ledger({ ...filter, limit: 6 }),
    ]);
    const pending = operations.filter((x) => !['DONE', 'CANCELED'].includes(x.status));
    const totals = new Map<string, number>();
    for (const row of stock)
      totals.set(row.product.id, (totals.get(row.product.id) || 0) + row.onHand);
    const types = ['RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT'] as const;
    const activity = Array.from({ length: 7 }, (_, offset) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - offset));
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setDate(end.getDate() + 1);
      return {
        date: day.toISOString(),
        received: operations.filter(
          (x) =>
            x.type === 'RECEIPT' && x.completedAt && x.completedAt >= day && x.completedAt < end,
        ).length,
        delivered: operations.filter(
          (x) =>
            x.type === 'DELIVERY' && x.completedAt && x.completedAt >= day && x.completedAt < end,
        ).length,
      };
    });
    return {
      metrics: {
        inStock: [...totals.values()].filter((x) => x > 0).length,
        products: totals.size,
        lowStock: new Set(
          stock
            .filter(
              (x) => x.hasRule && x.available <= x.minimum && (totals.get(x.product.id) || 0) > 0,
            )
            .map((x) => x.product.id),
        ).size,
        outOfStock: [...totals.values()].filter((x) => x === 0).length,
        pendingReceipts: pending.filter((x) => x.type === 'RECEIPT').length,
        pendingDeliveries: pending.filter((x) => x.type === 'DELIVERY').length,
        transfers: pending.filter((x) => x.type === 'TRANSFER').length,
      },
      cards: types.map((type) => {
        const list = pending.filter((x) => x.type === type);
        return {
          type,
          total: list.length,
          ready: list.filter((x) => x.status === 'READY').length,
          waiting: list.filter((x) => x.status === 'WAITING').length,
          late: list.filter((x) => x.scheduledAt < new Date()).length,
        };
      }),
      attention: pending.slice(0, 8),
      alerts: stock
        .filter((x) => x.hasRule && x.available <= x.minimum)
        .sort((a, b) => a.available - b.available)
        .slice(0, 8),
      recent: recent.items,
      activity,
    };
  }
}
