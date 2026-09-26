import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { Database } from '../src/common/database';
import { configureApp } from '../src/common/http';
import { InventoryService } from '../src/inventory/inventory.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { ReportService } from '../src/inventory/report.service';
import { Actor } from '../src/auth/auth.guard';
import { OperationDto } from '../src/inventory/inventory.dto';

config({ path: resolve(__dirname, '../.env'), quiet: true });
const testUrl = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
if (
  testUrl.hostname !== '127.0.0.1' ||
  testUrl.port !== '55432' ||
  testUrl.pathname !== '/stocksense_test'
)
  throw new Error('Tests require the isolated local stocksense_test database on port 55432.');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.WEB_ORIGIN = 'http://127.0.0.1:5174';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1025';
delete process.env.SMTP_USER;
delete process.env.SMTP_PASSWORD;

describe('Inventory and authentication against real PostgreSQL', () => {
  let app: INestApplication,
    db: Database,
    inventory: InventoryService,
    catalog: CatalogService,
    reports: ReportService;
  let manager: Actor,
    staff: Actor,
    from: string,
    to: string,
    supplier: string,
    customer: string,
    category: string;
  let sequence = 0;
  beforeAll(async () => {
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { cwd: resolve(__dirname, '..'), env: process.env, stdio: 'pipe' },
    );
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(Database);
    inventory = app.get(InventoryService);
    catalog = app.get(CatalogService);
    reports = app.get(ReportService);
    // The URL guard above deliberately rejects the development database and all remote hosts.
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "LedgerEntry", "Reservation", "OperationLine", "Operation", "StockBalance", "ReorderRule", "PasswordReset", "Product", "Category", "Location", "Warehouse", "Contact", "User" RESTART IDENTITY CASCADE',
    );
    const passwordHash = await hash('TestPassword!2026', 4);
    manager = await db.user.create({
      data: {
        name: 'Test Manager',
        username: 'manager',
        email: 'manager@test.local',
        role: 'MANAGER',
        passwordHash,
      },
    });
    staff = await db.user.create({
      data: {
        name: 'Test Staff',
        username: 'staffer',
        email: 'staff@test.local',
        role: 'STAFF',
        passwordHash,
      },
    });
    const wh = await db.warehouse.create({ data: { name: 'Test warehouse', code: 'TEST' } });
    from = (
      await db.location.create({ data: { name: 'Stock', code: 'STOCK', warehouseId: wh.id } })
    ).id;
    to = (await db.location.create({ data: { name: 'Rack', code: 'RACK', warehouseId: wh.id } }))
      .id;
    supplier = (await db.contact.create({ data: { name: 'Supplier', type: 'SUPPLIER' } })).id;
    customer = (await db.contact.create({ data: { name: 'Customer', type: 'CUSTOMER' } })).id;
    category = (await db.category.create({ data: { name: 'Test category' } })).id;
  });
  afterAll(async () => {
    await app?.close();
  });
  const product = async (unit: 'PCS' | 'KG' = 'PCS') =>
    db.product.create({
      data: { name: `Item ${++sequence}`, sku: `TEST-${sequence}`, categoryId: category, unit },
    });
  const dto = (type: OperationDto['type'], id: string, quantity: number): OperationDto => ({
    type,
    scheduledAt: new Date().toISOString(),
    lines: [{ productId: id, quantity }],
    ...(type === 'RECEIPT'
      ? { destinationId: from, contactId: supplier }
      : type === 'DELIVERY'
        ? { sourceId: from, contactId: customer }
        : type === 'TRANSFER'
          ? { sourceId: from, destinationId: to }
          : { destinationId: from, reason: 'Physical count' }),
  });
  const create = (type: OperationDto['type'], id: string, quantity: number) =>
    inventory.create(dto(type, id, quantity), manager);
  const receive = async (id: string, quantity: number) => {
    const op = await create('RECEIPT', id, quantity);
    await inventory.action(op.id, 'confirm', manager);
    return inventory.action(op.id, 'validate', manager);
  };
  const balance = async (id: string, locationId = from) =>
    Number(
      (
        await db.stockBalance.findUnique({
          where: { productId_locationId: { productId: id, locationId } },
        })
      )?.onHand || 0,
    );
  const mutate = (path: string, body: object = {}, cookie?: string) => {
    const req = request(app.getHttpServer())
      .post('/api' + path)
      .set('X-StockSense-Client', 'web')
      .send(body);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('receipt posts only on validation; concurrent repeat validation is idempotent', async () => {
    const p = await product();
    const op = await create('RECEIPT', p.id, 100);
    expect(await balance(p.id)).toBe(0);
    await expect(inventory.action(op.id, 'validate', manager)).rejects.toThrow(/Confirm/);
    await inventory.action(op.id, 'confirm', manager);
    expect(await balance(p.id)).toBe(0);
    const results = await Promise.all([
      inventory.action(op.id, 'validate', manager),
      inventory.action(op.id, 'validate', manager),
    ]);
    expect(results.every((r) => r.status === 'DONE')).toBe(true);
    expect(await balance(p.id)).toBe(100);
    expect(await db.ledgerEntry.count({ where: { productId: p.id } })).toBe(1);
    await expect(inventory.action(op.id, 'cancel', manager)).rejects.toThrow(/cannot be changed/);
    await expect(inventory.update(op.id, dto('RECEIPT', p.id, 50), manager)).rejects.toThrow(
      /Only drafts/,
    );
  });
  it('competing deliveries cannot reserve the same stock; cancellation releases it', async () => {
    const p = await product();
    await receive(p.id, 10);
    const a = await create('DELIVERY', p.id, 7),
      b = await create('DELIVERY', p.id, 7);
    const outcomes = await Promise.all([
      inventory.action(a.id, 'confirm', manager),
      inventory.action(b.id, 'confirm', manager),
    ]);
    expect(outcomes.map((x) => x.status).sort()).toEqual(['READY', 'WAITING']);
    const rows = await reports.stockRows({ productId: p.id, locationId: from });
    expect(rows[0]).toMatchObject({ onHand: 10, reserved: 7, available: 3 });
    const ready = outcomes.find((x) => x.status === 'READY')!,
      waiting = outcomes.find((x) => x.status === 'WAITING')!;
    await inventory.action(ready.id, 'cancel', manager);
    expect((await inventory.action(waiting.id, 'confirm', manager)).status).toBe('READY');
    expect(await balance(p.id)).toBe(10);
  });
  it('delivery requires pick then pack and posts the outgoing quantity once', async () => {
    const p = await product();
    await receive(p.id, 12);
    const op = await create('DELIVERY', p.id, 5);
    await inventory.action(op.id, 'confirm', manager);
    await expect(inventory.action(op.id, 'pack', manager)).rejects.toThrow(/picked/);
    await expect(inventory.action(op.id, 'validate', manager)).rejects.toThrow(/Pick and pack/);
    await inventory.action(op.id, 'pick', manager);
    await inventory.action(op.id, 'pack', manager);
    await inventory.action(op.id, 'validate', manager);
    expect(await balance(p.id)).toBe(7);
    const rows = await reports.stockRows({ productId: p.id, locationId: from });
    expect(rows[0].reserved).toBe(0);
    const ledger = await db.ledgerEntry.findMany({ where: { line: { operationId: op.id } } });
    expect(ledger.map((e) => Number(e.delta))).toEqual([-5]);
  });
  it('transfers conserve total stock and write both locations in the ledger', async () => {
    const p = await product();
    await receive(p.id, 100);
    const op = await create('TRANSFER', p.id, 30);
    await inventory.action(op.id, 'confirm', manager);
    await inventory.action(op.id, 'validate', manager);
    expect(await balance(p.id)).toBe(70);
    expect(await balance(p.id, to)).toBe(30);
    const entries = await db.ledgerEntry.findMany({ where: { line: { operationId: op.id } } });
    expect(entries.map((e) => Number(e.delta)).sort((a, b) => a - b)).toEqual([-30, 30]);
    expect(entries.reduce((sum, e) => sum + Number(e.delta), 0)).toBe(0);
  });
  it('a short multi-line operation reserves none of its products', async () => {
    const a = await product(),
      b = await product();
    await receive(a.id, 10);
    await receive(b.id, 2);
    const op = await inventory.create(
      {
        ...dto('DELIVERY', a.id, 5),
        lines: [
          { productId: a.id, quantity: 5 },
          { productId: b.id, quantity: 3 },
        ],
      },
      manager,
    );
    expect((await inventory.action(op.id, 'confirm', manager)).status).toBe('WAITING');
    expect(await db.reservation.count({ where: { line: { operationId: op.id } } })).toBe(0);
    expect(await balance(a.id)).toBe(10);
  });
  it('counts record a signed delta, support zero, and reject stale snapshots', async () => {
    const p = await product();
    await receive(p.id, 10);
    const count = await create('ADJUSTMENT', p.id, 7);
    await inventory.action(count.id, 'confirm', manager);
    await inventory.action(count.id, 'validate', manager);
    expect(await balance(p.id)).toBe(7);
    expect(
      Number(
        (await db.ledgerEntry.findFirstOrThrow({ where: { line: { operationId: count.id } } }))
          .delta,
      ),
    ).toBe(-3);
    const stale = await create('ADJUSTMENT', p.id, 6);
    await inventory.action(stale.id, 'confirm', manager);
    await receive(p.id, 2);
    await expect(inventory.action(stale.id, 'validate', manager)).rejects.toThrow(
      /stock changed since counting/,
    );
    expect(await balance(p.id)).toBe(9);
    const zero = await create('ADJUSTMENT', p.id, 0);
    await inventory.action(zero.id, 'confirm', manager);
    await inventory.action(zero.id, 'validate', manager);
    expect(await balance(p.id)).toBe(0);
  });
  it('an adjustment conflicting with reservations rolls every line back', async () => {
    const a = await product(),
      b = await product();
    await receive(a.id, 10);
    await receive(b.id, 10);
    const delivery = await create('DELIVERY', b.id, 8);
    await inventory.action(delivery.id, 'confirm', manager);
    const count = await inventory.create(
      {
        ...dto('ADJUSTMENT', a.id, 5),
        lines: [
          { productId: a.id, quantity: 5 },
          { productId: b.id, quantity: 5 },
        ],
      },
      manager,
    );
    await inventory.action(count.id, 'confirm', manager);
    await expect(inventory.action(count.id, 'validate', manager)).rejects.toThrow(/reserved goods/);
    expect(await balance(a.id)).toBe(10);
    expect(await balance(b.id)).toBe(10);
    expect(await db.ledgerEntry.count({ where: { line: { operationId: count.id } } })).toBe(0);
  });
  it('supports decimal units without accepting fractional pieces', async () => {
    const kg = await product('KG'),
      pcs = await product();
    await receive(kg.id, 0.3);
    await receive(kg.id, 0.2);
    expect(await balance(kg.id)).toBe(0.5);
    await expect(create('RECEIPT', pcs.id, 0.5)).rejects.toThrow(/whole pieces/);
    await expect(create('RECEIPT', pcs.id, -1)).rejects.toThrow(/positive quantity/);
    await expect(
      inventory.create({ ...dto('TRANSFER', pcs.id, 1), destinationId: from }, manager),
    ).rejects.toThrow(/different source/);
  });
  it('opening stock and replenishment rules use the same recorded balances', async () => {
    const p = await catalog.product(
      {
        name: 'Opening product',
        sku: 'OPENING',
        categoryId: category,
        unit: 'PCS',
        unitCost: 12,
        initialStock: 5,
        locationId: from,
      },
      manager,
    );
    expect(await balance(p.id)).toBe(5);
    expect(await db.ledgerEntry.count({ where: { productId: p.id } })).toBe(1);
    await catalog.rule({ productId: p.id, locationId: from, minimum: 6, target: 20 });
    expect((await reports.stockRows({ productId: p.id, locationId: from }))[0]).toMatchObject({
      status: 'LOW_STOCK',
      suggested: 15,
      available: 5,
    });
  });
  it('rejects unauthenticated, forged-origin, extra-field, and manager-only requests', async () => {
    await request(app.getHttpServer()).get('/api/catalog').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identity: 'manager', password: 'TestPassword!2026' })
      .expect(403);
    await mutate('/auth/login', { identity: 'manager', password: 'TestPassword!2026' })
      .set('Origin', 'https://untrusted.example')
      .expect(403);
    const login = await mutate('/auth/login', {
      identity: 'staffer',
      password: 'TestPassword!2026',
    }).expect(201);
    const cookie = login.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(login.body.passwordHash).toBeUndefined();
    await mutate('/catalog/categories', { name: 'Forbidden' }, cookie).expect(403);
    const p = await product();
    await mutate('/operations', dto('ADJUSTMENT', p.id, 1), cookie).expect(403);
    await mutate('/operations', { ...dto('RECEIPT', p.id, 1), status: 'DONE' }, cookie).expect(400);
    await mutate('/auth/logout', {}, cookie).expect(201);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
  it('signup creates staff and enforces username, email, and password rules', async () => {
    await mutate('/auth/register', {
      name: 'New User',
      username: 'abc',
      email: 'bad',
      password: 'weak',
    }).expect(400);
    const dto = {
      name: 'New User',
      username: 'newuser',
      email: 'new@test.local',
      password: 'ValidPassword!2026',
    };
    await mutate('/auth/register', { ...dto, role: 'MANAGER' }).expect(400);
    await mutate('/auth/register', { ...dto, password: 'Aa!' + 'x'.repeat(70) }).expect(400);
    const registered = await mutate('/auth/register', dto).expect(201);
    expect(registered.body.role).toBe('STAFF');
    expect(registered.body.passwordHash).toBeUndefined();
    await mutate('/auth/register', dto).expect(409);
  });
  it('OTP is one-time, has a retry limit, and revokes old sessions', async () => {
    const login = await mutate('/auth/login', {
      identity: 'newuser',
      password: 'ValidPassword!2026',
    }).expect(201);
    const cookie = login.headers['set-cookie'][0];
    const user = await db.user.findUniqueOrThrow({ where: { username: 'newuser' } });
    const codeHash = createHmac('sha256', process.env.JWT_SECRET!).update('123456').digest('hex');
    const challenge = await db.passwordReset.create({
      data: { userId: user.id, codeHash, expiresAt: new Date(Date.now() + 600000) },
    });
    await mutate('/auth/reset-password', {
      email: user.email,
      code: '000000',
      password: 'NewPassword!2026',
    }).expect(400);
    expect(
      (await db.passwordReset.findUniqueOrThrow({ where: { id: challenge.id } })).attempts,
    ).toBe(1);
    await mutate('/auth/reset-password', {
      email: user.email,
      code: '123456',
      password: 'NewPassword!2026',
    }).expect(201);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await mutate('/auth/reset-password', {
      email: user.email,
      code: '123456',
      password: 'AgainPassword!2026',
    }).expect(400);
    await db.passwordReset.create({
      data: { userId: user.id, codeHash, attempts: 5, expiresAt: new Date(Date.now() + 600000) },
    });
    await mutate('/auth/reset-password', {
      email: user.email,
      code: '123456',
      password: 'AgainPassword!2026',
    }).expect(400);
    await mutate('/auth/login', { identity: 'newuser', password: 'NewPassword!2026' }).expect(201);
  });
  it('expired reset challenges cannot change a password', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { username: 'newuser' } });
    await db.passwordReset.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await db.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: createHmac('sha256', process.env.JWT_SECRET!).update('654321').digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await mutate('/auth/reset-password', {
      email: user.email,
      code: '654321',
      password: 'ExpiredPassword!2026',
    }).expect(400);
  });
  it('sends a usable reset code through local SMTP without exposing it in the API', async () => {
    const email = 'mailtest@stocksense.local';
    await db.user.create({
      data: {
        name: 'Mail Tester',
        username: 'mailtest',
        email,
        passwordHash: await hash('MailPassword!2026', 4),
      },
    });
    const result = await mutate('/auth/forgot-password', { email }).expect(201);
    expect(result.body.code).toBeUndefined();
    const missing = await mutate('/auth/forgot-password', {
      email: 'missing@stocksense.local',
    }).expect(201);
    expect(missing.body.message).toBe(result.body.message);
    const inbox = (await (await fetch('http://127.0.0.1:8025/api/v1/messages')).json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const entry = inbox.messages.find((message) => message.To.some((to) => to.Address === email));
    expect(entry).toBeDefined();
    const message = (await (
      await fetch(`http://127.0.0.1:8025/api/v1/message/${entry!.ID}`)
    ).json()) as { Text: string };
    const code = message.Text.match(/\b\d{6}\b/)?.[0];
    expect(code).toHaveLength(6);
    await mutate('/auth/reset-password', { email, code, password: 'NewMailPassword!2026' }).expect(
      201,
    );
    await mutate('/auth/login', { identity: 'mailtest', password: 'NewMailPassword!2026' }).expect(
      201,
    );
  });
  it('protects historical product units, warehouse ownership, and contact types', async () => {
    const p = await product();
    await receive(p.id, 5);
    await expect(
      catalog.product(
        { name: p.name, sku: p.sku, categoryId: category, unit: 'KG', unitCost: 0 },
        manager,
        p.id,
      ),
    ).rejects.toThrow(/unit cannot change/);
    await expect(
      catalog.product(
        { name: p.name, sku: p.sku, categoryId: category, unit: 'PCS', unitCost: 0, active: false },
        manager,
        p.id,
      ),
    ).rejects.toThrow(/Clear remaining stock/);
    const wh = await db.warehouse.create({ data: { name: 'Another warehouse', code: 'OTHER' } });
    await expect(
      catalog.location(from, { name: 'Moved Stock', code: 'STOCK', warehouseId: wh.id }),
    ).rejects.toThrow(/cannot move to another warehouse/);
    await expect(catalog.contact(supplier, { name: 'Supplier', type: 'CUSTOMER' })).rejects.toThrow(
      /cannot change type/,
    );
  });
  it('the ledger reconciles exactly with every persisted balance', async () => {
    const balances = await db.stockBalance.findMany();
    for (const b of balances) {
      const sum = await db.ledgerEntry.aggregate({
        where: { productId: b.productId, locationId: b.locationId },
        _sum: { delta: true },
      });
      expect(Number(sum._sum.delta)).toBe(Number(b.onHand));
    }
  });
  it('dashboard counts a low-stock product once across multiple locations', async () => {
    const p = await product();
    await receive(p.id, 3);
    await catalog.rule({ productId: p.id, locationId: from, minimum: 5, target: 10 });
    await catalog.rule({ productId: p.id, locationId: to, minimum: 5, target: 10 });
    const dashboard = await reports.dashboard({ productId: p.id });
    expect(dashboard.metrics).toMatchObject({
      products: 1,
      inStock: 1,
      lowStock: 1,
      outOfStock: 0,
    });
    expect(dashboard.alerts).toHaveLength(2);
  });
});
