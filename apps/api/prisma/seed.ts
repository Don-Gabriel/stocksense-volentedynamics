import 'dotenv/config';
import 'reflect-metadata';
import { hash } from 'bcryptjs';
import { Database } from '../src/common/database';
import { InventoryService } from '../src/inventory/inventory.service';
import type { Actor } from '../src/auth/auth.guard';
import { OperationType, Product, Unit } from '@prisma/client';

const db = new Database();
const inventory = new InventoryService(db);
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !['/stocksense', '/stocksense_test'].includes(url.pathname)
  )
    throw new Error('Demo seed is restricted to a local StockSense database.');
  if (await db.user.count()) {
    console.log('Database already has users. Seed skipped; existing data was preserved.');
    return;
  }
  if (!process.env.DEMO_PASSWORD) throw new Error('Set DEMO_PASSWORD before seeding.');
  const passwordHash = await hash(process.env.DEMO_PASSWORD, 12);
  const manager = await db.user.create({
    data: {
      username: 'manager',
      name: 'Alex Morgan',
      email: 'manager@stocksense.local',
      role: 'MANAGER',
      passwordHash,
    },
  });
  const staff = await db.user.create({
    data: {
      username: 'warehouse',
      name: 'Jordan Lee',
      email: 'warehouse@stocksense.local',
      role: 'STAFF',
      passwordHash,
    },
  });
  const actor: Actor = manager;
  const warehouse = await db.warehouse.create({
    data: { code: 'WH', name: 'Central Warehouse', address: '12 Industrial Avenue, Hyderabad' },
  });
  const secondary = await db.warehouse.create({
    data: { code: 'ST', name: 'South Store', address: '8 Market Road, Hyderabad' },
  });
  const stock = await db.location.create({
    data: { warehouseId: warehouse.id, code: 'STOCK', name: 'Main Stock' },
  });
  const production = await db.location.create({
    data: { warehouseId: warehouse.id, code: 'PROD', name: 'Production Rack' },
  });
  const dispatch = await db.location.create({
    data: { warehouseId: warehouse.id, code: 'PACK', name: 'Packing Area' },
  });
  const south = await db.location.create({
    data: { warehouseId: secondary.id, code: 'STOCK', name: 'Store Stock' },
  });
  const categories = await Promise.all(
    ['Raw Materials', 'Furniture', 'Packaging', 'Hardware'].map((name) =>
      db.category.create({ data: { name } }),
    ),
  );
  const suppliers = await Promise.all(
    ['Atlas Metals', 'Northstar Supplies', 'Oak & Co.'].map((name) =>
      db.contact.create({
        data: {
          name,
          type: 'SUPPLIER',
          email: `${name.split(' ')[0].toLowerCase()}@example.com`,
          address: 'Hyderabad, Telangana',
        },
      }),
    ),
  );
  const customers = await Promise.all(
    ['Aurora Interiors', 'Studio Collective', 'Horizon Workspace'].map((name) =>
      db.contact.create({
        data: {
          name,
          type: 'CUSTOMER',
          email: `${name.split(' ')[0].toLowerCase()}@example.com`,
          address: 'Hyderabad, Telangana',
        },
      }),
    ),
  );
  const definitions: [string, string, number, Unit, number, number][] = [
    ['STL-001', 'Steel rods', 0, 'KG', 85, 350],
    ['PLY-002', 'Plywood sheets', 0, 'PCS', 1450, 84],
    ['DSK-003', 'Oak work desk', 1, 'PCS', 6500, 32],
    ['CHR-004', 'Ergonomic chair', 1, 'PCS', 4200, 48],
    ['CTN-005', 'Shipping cartons', 2, 'PCS', 45, 180],
    ['BUB-006', 'Bubble wrap', 2, 'M', 18, 240],
    ['BLT-007', 'Hex bolts M8', 3, 'PCS', 8, 850],
    ['NUT-008', 'Hex nuts M8', 3, 'PCS', 4, 680],
    ['TBL-009', 'Meeting table', 1, 'PCS', 12000, 12],
    ['TAP-010', 'Packing tape', 2, 'PCS', 65, 8],
    ['PAI-011', 'Wood finish', 0, 'L', 320, 6],
    ['BRK-012', 'Shelf brackets', 3, 'PCS', 120, 0],
  ];
  const products: Product[] = [];
  for (const [sku, name, c, unit, unitCost, quantity] of definitions) {
    const product = await db.product.create({
      data: {
        sku,
        name,
        categoryId: categories[c].id,
        unit,
        unitCost,
        description: `${name} for daily warehouse operations.`,
      },
    });
    products.push(product);
    if (quantity > 0) {
      const op = await inventory.create(
        {
          type: 'RECEIPT',
          destinationId: stock.id,
          contactId: suppliers[c % suppliers.length].id,
          scheduledAt: new Date().toISOString(),
          responsibleId: manager.id,
          notes: 'Opening delivery for the demo workspace.',
          lines: [{ productId: product.id, quantity }],
        },
        actor,
      );
      await inventory.action(op.id, 'confirm', actor);
      await inventory.action(op.id, 'validate', actor);
      const ago = new Date();
      ago.setDate(ago.getDate() - (c + 2));
      await db.operation.update({
        where: { id: op.id },
        data: { createdAt: ago, completedAt: ago },
      });
      await db.ledgerEntry.updateMany({
        where: { line: { operationId: op.id } },
        data: { createdAt: ago },
      });
    }
    await db.reorderRule.create({
      data: {
        productId: product.id,
        locationId: stock.id,
        minimum: c === 3 ? 50 : 10,
        target: c === 3 ? 200 : 50,
      },
    });
  }
  const when = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
  async function operation(
    type: OperationType,
    productIndex: number,
    quantity: number,
    state: 'DRAFT' | 'READY' | 'DONE' | 'WAITING',
    days = 1,
    destination = production.id,
  ) {
    const op = await inventory.create(
      {
        type,
        sourceId: type === 'RECEIPT' ? undefined : stock.id,
        destinationId:
          type === 'RECEIPT' ? stock.id : type === 'TRANSFER' ? destination : undefined,
        contactId:
          type === 'RECEIPT'
            ? suppliers[0].id
            : type === 'DELIVERY'
              ? customers[productIndex % 3].id
              : undefined,
        scheduledAt: when(days),
        responsibleId: staff.id,
        deliveryAddress: type === 'DELIVERY' ? 'Banjara Hills, Hyderabad' : undefined,
        lines: [{ productId: products[productIndex].id, quantity }],
      },
      actor,
    );
    if (state !== 'DRAFT') await inventory.action(op.id, 'confirm', actor);
    if (state === 'DONE') {
      if (type === 'DELIVERY') {
        await inventory.action(op.id, 'pick', actor);
        await inventory.action(op.id, 'pack', actor);
      }
      await inventory.action(op.id, 'validate', actor);
    }
    return op;
  }
  await operation('TRANSFER', 0, 30, 'DONE', 0);
  await operation('TRANSFER', 3, 10, 'DONE', 0, south.id);
  await operation('DELIVERY', 2, 6, 'DONE', 0);
  await operation('RECEIPT', 9, 120, 'READY', -1);
  await operation('RECEIPT', 11, 80, 'READY', 1);
  await operation('RECEIPT', 0, 200, 'DRAFT', 2);
  await operation('DELIVERY', 3, 12, 'READY', 0);
  await operation('DELIVERY', 9, 24, 'WAITING', -1);
  await operation('DELIVERY', 2, 8, 'READY', 1);
  await operation('DELIVERY', 8, 2, 'DRAFT', 2);
  await operation('TRANSFER', 4, 30, 'READY', 1, dispatch.id);
  const adjustment = await inventory.create(
    {
      type: 'ADJUSTMENT',
      destinationId: stock.id,
      reason: 'Cycle count',
      scheduledAt: when(0),
      lines: [{ productId: products[10].id, quantity: 5 }],
    },
    actor,
  );
  await inventory.action(adjustment.id, 'confirm', actor);
  console.log(
    'Demo workspace seeded. Login IDs: manager / warehouse. Password is the DEMO_PASSWORD in apps/api/.env.',
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
