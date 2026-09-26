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
import { AuthService } from '../src/auth/auth.service';
import { MailService } from '../src/auth/mail.service';
import { ServiceUnavailableException } from '@nestjs/common';

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
process.env.MAIL_MODE = 'local';
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
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        passwordHash,
      },
    });
    staff = await db.user.create({
      data: {
        name: 'Test Staff',
        username: 'staffer',
        email: 'staff@test.local',
        role: 'STAFF',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
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
    expect(registered.body.requiresVerification).toBe(true);
    expect(registered.headers['set-cookie']).toBeUndefined();
    const created = await db.user.findUniqueOrThrow({ where: { username: dto.username } });
    expect(created).toMatchObject({ role: 'STAFF', status: 'PENDING', emailVerifiedAt: null });
    await mutate('/auth/login', { identity: dto.username, password: dto.password }).expect(403);
    // This fixture is activated directly here; the full verification/approval workflow has separate tests.
    await db.user.update({
      where: { id: created.id },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
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
    const codeHash = createHmac('sha256', process.env.JWT_SECRET!)
      .update(`RESET_PASSWORD:${user.id}:123456`)
      .digest('hex');
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
        codeHash: createHmac('sha256', process.env.JWT_SECRET!)
          .update(`RESET_PASSWORD:${user.id}:654321`)
          .digest('hex'),
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
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
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
  it('email verification, manager approval, role changes, and disabling enforce access', async () => {
    const auth = app.get(AuthService);
    const dto = {
      name: 'Verified Person',
      username: 'verified',
      email: 'verified@test.local',
      password: 'VerifyPassword!2026',
    };
    const registered = await mutate('/auth/register', dto).expect(201);
    expect(registered.body.delivery).toBe('local');
    const user = await db.user.findUniqueOrThrow({ where: { email: dto.email } });
    await expect(
      auth.access(user.id, { role: 'STAFF', status: 'ACTIVE' }, manager),
    ).rejects.toThrow(/verify/);
    const inbox = (await (await fetch('http://127.0.0.1:8025/api/v1/messages')).json()) as any;
    const entry = inbox.messages.find((m: any) => m.To.some((t: any) => t.Address === dto.email));
    const mail = (await (
      await fetch(`http://127.0.0.1:8025/api/v1/message/${entry.ID}`)
    ).json()) as any;
    const code = mail.Text.match(/\b\d{6}\b/)[0];
    await mutate('/auth/verify-email', {
      email: dto.email,
      code,
      password: 'WrongPassword!2026',
    }).expect(400);
    await mutate('/auth/verify-email', { email: dto.email, code, password: dto.password }).expect(
      201,
    );
    await mutate('/auth/verify-email', { email: dto.email, code, password: dto.password }).expect(
      400,
    );
    const pending = await mutate('/auth/login', {
      identity: dto.email,
      password: dto.password,
    }).expect(403);
    expect(pending.body.message).toMatch(/manager must approve/);
    await auth.access(user.id, { role: 'STAFF', status: 'ACTIVE' }, manager);
    const login = await mutate('/auth/login', {
      identity: dto.email,
      password: dto.password,
    }).expect(201);
    const cookie = login.headers['set-cookie'][0];
    await request(app.getHttpServer()).get('/api/catalog').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer())
      .patch(`/api/auth/users/${manager.id}/access`)
      .set('X-StockSense-Client', 'web')
      .set('Cookie', cookie)
      .send({ role: 'STAFF', status: 'DISABLED' })
      .expect(403);
    await auth.access(user.id, { role: 'MANAGER', status: 'ACTIVE' }, manager);
    await request(app.getHttpServer()).get('/api/catalog').set('Cookie', cookie).expect(401);
    const elevated = await mutate('/auth/login', {
      identity: dto.email,
      password: dto.password,
    }).expect(201);
    expect(elevated.body.role).toBe('MANAGER');
    await auth.access(user.id, { role: 'STAFF', status: 'DISABLED' }, manager);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', elevated.headers['set-cookie'][0])
      .expect(401);
    await mutate('/auth/login', { identity: dto.email, password: dto.password }).expect(403);
    await auth.access(user.id, { role: 'STAFF', status: 'ACTIVE' }, manager);
    await mutate('/auth/login', { identity: dto.email, password: dto.password }).expect(201);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await expect(
      auth.access(manager.id, { role: 'STAFF', status: 'DISABLED' }, manager),
    ).rejects.toThrow(/own access/);
  });
  it('verification codes enforce expiry, purpose separation, five attempts, resend delay, and replacement', async () => {
    const auth = app.get(AuthService),
      mail = app.get(MailService);
    const captured: string[] = [];
    const spy = jest.spyOn(mail, 'code').mockImplementation(async (_email, code) => {
      captured.push(code);
    });
    try {
      const dto = {
        name: 'Code Tester',
        username: 'codetest',
        email: 'code@test.local',
        password: 'VerifyPassword!2026',
      };
      await auth.register(dto, 'code-tests');
      const user = await db.user.findUniqueOrThrow({ where: { email: dto.email } });
      await expect(auth.resend({ email: dto.email }, 'code-tests')).rejects.toThrow(/60 seconds/);
      await expect(
        auth.reset(
          { email: dto.email, code: captured[0], password: 'ResetPassword!2026' },
          'purpose',
        ),
      ).rejects.toThrow(/invalid/);
      for (let i = 0; i < 5; i++)
        await expect(
          auth.verify({ email: dto.email, code: '000000', password: dto.password }, 'attempts'),
        ).rejects.toThrow(/invalid/);
      await expect(
        auth.verify({ email: dto.email, code: captured[0], password: dto.password }, 'attempts'),
      ).rejects.toThrow(/invalid/);
      await db.passwordReset.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - 61000) },
      });
      await auth.resend({ email: dto.email }, 'replacement');
      expect(captured).toHaveLength(2);
      expect(await db.passwordReset.count({ where: { userId: user.id, consumedAt: null } })).toBe(
        1,
      );
      await db.passwordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(
        auth.verify({ email: dto.email, code: captured[1], password: dto.password }, 'expired'),
      ).rejects.toThrow(/expired/);
    } finally {
      spy.mockRestore();
    }
  });
  it('SMTP failures do not activate accounts and permit recovery by resending', async () => {
    const auth = app.get(AuthService),
      mail = app.get(MailService);
    const spy = jest
      .spyOn(mail, 'code')
      .mockRejectedValue(new ServiceUnavailableException('Email unavailable'));
    const dto = {
      name: 'Mail Recovery',
      username: 'recovery',
      email: 'recovery@test.local',
      password: 'RecoveryPassword!2026',
    };
    try {
      await expect(auth.register(dto, 'mail-failure')).rejects.toThrow(/Email unavailable/);
      const user = await db.user.findUniqueOrThrow({ where: { email: dto.email } });
      expect(user.status).toBe('PENDING');
      expect(user.emailVerifiedAt).toBeNull();
      expect(await db.passwordReset.count({ where: { userId: user.id, consumedAt: null } })).toBe(
        0,
      );
      spy.mockResolvedValue(undefined);
      await expect(auth.resend({ email: dto.email }, 'mail-recovered')).resolves.toMatchObject({
        delivery: 'local',
      });
    } finally {
      spy.mockRestore();
    }
  });
  it('login and code-request rate limits apply without leaking passwords or codes', async () => {
    const auth = app.get(AuthService);
    for (let i = 0; i < 15; i++)
      await expect(
        auth.login({ identity: 'nonexistent', password: 'bad' }, 'limit-test'),
      ).rejects.toThrow(/Invalid/);
    await expect(
      auth.login({ identity: 'nonexistent', password: 'bad' }, 'limit-test'),
    ).rejects.toMatchObject({ status: 429 });
    for (let i = 0; i < 3; i++) await auth.forgot({ email: 'absent@test.local' }, 'forgot-limit');
    await expect(auth.forgot({ email: 'absent@test.local' }, 'forgot-limit')).rejects.toMatchObject(
      { status: 429 },
    );
    const data = await catalog.all(manager);
    expect(data.users.every((u) => !('passwordHash' in u) && !('tokenVersion' in u))).toBe(true);
    const staffData = await catalog.all(staff);
    expect(
      staffData.users.every((u) => u.status === 'ACTIVE' && !!u.emailVerifiedAt && !('email' in u)),
    ).toBe(true);
  });
  it('invalid quantities, line collections, dates, foreign IDs, and extra fields reject atomically', async () => {
    const login = await mutate('/auth/login', {
      identity: 'manager',
      password: 'TestPassword!2026',
    }).expect(201);
    const cookie = login.headers['set-cookie'][0],
      p = await product();
    const base = dto('RECEIPT', p.id, 1);
    const bad = [
      { ...base, lines: [] },
      { ...base, lines: Array(51).fill(base.lines[0]) },
      { ...base, lines: [...base.lines, ...base.lines] },
      ...[-1, 0, 0.5, 1.0001, 1000000000].map((quantity) => ({
        ...base,
        lines: [{ productId: p.id, quantity }],
      })),
      { ...base, scheduledAt: 'yesterday' },
      { ...base, destinationId: 'missing' },
      { ...base, contactId: customer },
      { ...base, responsibleId: 'missing' },
      { ...base, notes: 'x'.repeat(1001) },
      { ...base, lines: [{ productId: 'missing', quantity: 1 }] },
      { ...base, lines: [{ productId: p.id, quantity: '1' }] },
      { ...base, createdById: staff.id },
    ];
    const count = await db.operation.count();
    for (const body of bad) await mutate('/operations', body, cookie).expect(400);
    expect(await db.operation.count()).toBe(count);
    expect(await balance(p.id)).toBe(0);
  });
  it('draft edits are atomic, retain reference, and cannot change operation type', async () => {
    const p = await product();
    const op = await create('RECEIPT', p.id, 3);
    const updated = await inventory.update(
      op.id,
      { ...dto('RECEIPT', p.id, 8), notes: 'Updated instructions' },
      manager,
    );
    expect(updated.reference).toBe(op.reference);
    expect(Number(updated.lines[0].quantity)).toBe(8);
    expect(updated.notes).toBe('Updated instructions');
    expect(await balance(p.id)).toBe(0);
    await expect(inventory.update(op.id, dto('DELIVERY', p.id, 8), manager)).rejects.toThrow(
      /type cannot change/,
    );
    await inventory.action(op.id, 'confirm', manager);
    await inventory.action(op.id, 'validate', manager);
    expect(await balance(p.id)).toBe(8);
  });
  it('archived products and inactive responsible users cannot enter new operations', async () => {
    const p = await product();
    await db.product.update({ where: { id: p.id }, data: { active: false } });
    await expect(create('RECEIPT', p.id, 1)).rejects.toThrow(/archived/);
    await expect(
      catalog.rule({ productId: p.id, locationId: from, minimum: 1, target: 10 }),
    ).rejects.toThrow(/active product/);
    await expect(
      catalog.product(
        {
          name: 'Archived opening',
          sku: 'ARCOPEN',
          categoryId: category,
          unit: 'PCS',
          unitCost: 0,
          active: false,
          initialStock: 5,
          locationId: from,
        },
        manager,
      ),
    ).rejects.toThrow(/archived product/);
    await db.product.update({ where: { id: p.id }, data: { active: true } });
    const inactive = await db.user.findUniqueOrThrow({ where: { username: 'recovery' } });
    await expect(
      inventory.create({ ...dto('RECEIPT', p.id, 1), responsibleId: inactive.id }, manager),
    ).rejects.toThrow(/responsible/);
  });
  it('canceled operations never post stock and cannot be revived', async () => {
    const p = await product();
    const op = await create('RECEIPT', p.id, 3);
    await inventory.action(op.id, 'cancel', manager);
    await expect(inventory.action(op.id, 'confirm', manager)).rejects.toThrow();
    await expect(inventory.action(op.id, 'validate', manager)).rejects.toThrow();
    expect(await balance(p.id)).toBe(0);
    expect(await db.ledgerEntry.count({ where: { line: { operationId: op.id } } })).toBe(0);
  });
  it('concurrent cancellation and validation end in one consistent state', async () => {
    const p = await product();
    const op = await create('RECEIPT', p.id, 11);
    await inventory.action(op.id, 'confirm', manager);
    await Promise.allSettled([
      inventory.action(op.id, 'cancel', manager),
      inventory.action(op.id, 'validate', manager),
    ]);
    const result = await db.operation.findUniqueOrThrow({ where: { id: op.id } });
    expect(['DONE', 'CANCELED']).toContain(result.status);
    expect(await balance(p.id)).toBe(result.status === 'DONE' ? 11 : 0);
    expect(await db.ledgerEntry.count({ where: { line: { operationId: op.id } } })).toBe(
      result.status === 'DONE' ? 1 : 0,
    );
  });
  it('cross-warehouse transfers preserve global quantity and warehouse reports', async () => {
    const p = await product();
    await receive(p.id, 20);
    const wh = await db.warehouse.create({ data: { name: 'Branch warehouse', code: 'BRANCH' } });
    const loc = await db.location.create({
      data: { name: 'Branch stock', code: 'STOCK', warehouseId: wh.id },
    });
    const op = await inventory.create(
      { ...dto('TRANSFER', p.id, 6), destinationId: loc.id },
      manager,
    );
    await inventory.action(op.id, 'confirm', manager);
    await inventory.action(op.id, 'validate', manager);
    expect(await balance(p.id)).toBe(14);
    expect(await balance(p.id, loc.id)).toBe(6);
    const rows = await reports.stock({ productId: p.id, warehouseId: wh.id });
    expect(rows.total).toBe(1);
    expect(rows.items[0].onHand).toBe(6);
    const moves = await reports.ledger({ productId: p.id, warehouseId: wh.id });
    expect(moves.total).toBe(1);
    expect(Number(moves.items[0].delta)).toBe(6);
  });
  it('reorder rules validate units and thresholds and update without duplicates', async () => {
    const p = await product();
    await expect(
      catalog.rule({ productId: p.id, locationId: from, minimum: 10, target: 5 }),
    ).rejects.toThrow(/at least/);
    await expect(
      catalog.rule({ productId: p.id, locationId: from, minimum: 1.5, target: 5 }),
    ).rejects.toThrow(/whole/);
    await catalog.rule({ productId: p.id, locationId: from, minimum: 2, target: 8 });
    await catalog.rule({ productId: p.id, locationId: from, minimum: 4, target: 12 });
    expect(await db.reorderRule.count({ where: { productId: p.id, locationId: from } })).toBe(1);
    expect((await reports.stockRows({ productId: p.id, locationId: from }))[0]).toMatchObject({
      status: 'OUT_OF_STOCK',
      suggested: 12,
    });
    await receive(p.id, 4);
    expect((await reports.stockRows({ productId: p.id, locationId: from }))[0]).toMatchObject({
      status: 'LOW_STOCK',
      suggested: 8,
    });
    await receive(p.id, 1);
    expect((await reports.stockRows({ productId: p.id, locationId: from }))[0]).toMatchObject({
      status: 'IN_STOCK',
      suggested: 0,
    });
  });
  it('case-insensitive searches, pagination, ledger filters, and invalid filter values behave consistently', async () => {
    const p = await product();
    await receive(p.id, 4);
    await receive(p.id, 3);
    const result = await reports.ledger({
      search: p.sku.toLowerCase(),
      type: 'RECEIPT',
      page: 1,
      limit: 1,
    });
    const second = await reports.ledger({ search: p.sku, type: 'RECEIPT', page: 2, limit: 1 });
    expect(result.total).toBe(2);
    expect(second.total).toBe(2);
    expect(result.items[0].id).not.toBe(second.items[0].id);
    expect(
      (await reports.ledger({ productId: p.id, from: '2000-01-01', to: '2001-01-01' })).total,
    ).toBe(0);
    expect(
      (await reports.stock({ search: p.sku.toLowerCase(), locationId: from, categoryId: category }))
        .items[0].onHand,
    ).toBe(7);
    const login = await mutate('/auth/login', {
      identity: 'manager',
      password: 'TestPassword!2026',
    }).expect(201);
    for (const query of ['page=0', 'limit=101', 'type=INVALID', 'from=invalid', 'status=BOGUS'])
      await request(app.getHttpServer())
        .get('/api/operations?' + query)
        .set('Cookie', login.headers['set-cookie'][0])
        .expect(400);
  });
  it('catalog uniqueness, input validation, profile updates, and protected history are enforced over HTTP', async () => {
    const login = await mutate('/auth/login', {
      identity: 'manager',
      password: 'TestPassword!2026',
    }).expect(201);
    const cookie = login.headers['set-cookie'][0];
    await mutate('/catalog/categories', { name: 'Unique category' }, cookie).expect(201);
    await mutate('/catalog/categories', { name: 'Unique category' }, cookie).expect(409);
    await mutate('/catalog/categories', { name: '   ' }, cookie).expect(400);
    await mutate('/catalog/warehouses', { name: 'Bad code', code: 'bad code' }, cookie).expect(400);
    await mutate(
      '/catalog/contacts',
      { name: 'Bad mail', type: 'SUPPLIER', email: 'invalid' },
      cookie,
    ).expect(400);
    await request(app.getHttpServer())
      .patch('/api/auth/profile')
      .set('X-StockSense-Client', 'web')
      .set('Cookie', cookie)
      .send({ name: 'Updated Manager' })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body.name).toBe('Updated Manager');
    expect(me.body.passwordHash).toBeUndefined();
    await request(app.getHttpServer())
      .patch('/api/auth/profile')
      .set('X-StockSense-Client', 'web')
      .set('Cookie', cookie)
      .send({ name: 'Changed', role: 'MANAGER' })
      .expect(400);
    const ledger = await db.ledgerEntry.findFirstOrThrow();
    await request(app.getHttpServer())
      .delete('/api/inventory/ledger/' + ledger.id)
      .set('X-StockSense-Client', 'web')
      .set('Cookie', cookie)
      .expect(404);
    expect(await db.ledgerEntry.findUnique({ where: { id: ledger.id } })).not.toBeNull();
  });
  it('positive and unchanged counts complete with the correct signed delta', async () => {
    const p = await product();
    await receive(p.id, 5);
    for (const [amount, delta] of [
      [8, 3],
      [8, 0],
    ]) {
      const op = await create('ADJUSTMENT', p.id, amount);
      await inventory.action(op.id, 'confirm', manager);
      await inventory.action(op.id, 'validate', manager);
      expect(await balance(p.id)).toBe(amount);
      const entries = await db.ledgerEntry.findMany({ where: { line: { operationId: op.id } } });
      expect(entries.reduce((n, x) => n + Number(x.delta), 0)).toBe(delta);
      expect((await db.operation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe('DONE');
    }
  });
  it('a short transfer waits and cancellation releases its later reservation', async () => {
    const p = await product();
    await receive(p.id, 2);
    const op = await create('TRANSFER', p.id, 5);
    expect((await inventory.action(op.id, 'confirm', manager)).status).toBe('WAITING');
    await receive(p.id, 3);
    expect((await inventory.action(op.id, 'confirm', manager)).status).toBe('READY');
    expect((await reports.stockRows({ productId: p.id, locationId: from }))[0].reserved).toBe(5);
    await inventory.action(op.id, 'cancel', manager);
    expect((await reports.stockRows({ productId: p.id, locationId: from }))[0].reserved).toBe(0);
    expect(await balance(p.id)).toBe(5);
    expect(await balance(p.id, to)).toBe(0);
  });
  it('catalog settings can be edited and empty archived products can be reactivated', async () => {
    const login = await mutate('/auth/login', {
      identity: 'manager',
      password: 'TestPassword!2026',
    }).expect(201);
    const cookie = login.headers['set-cookie'][0];
    const patch = (path: string, data: object) =>
      request(app.getHttpServer())
        .patch('/api/catalog/' + path)
        .set('X-StockSense-Client', 'web')
        .set('Cookie', cookie)
        .send(data);
    const wh = await db.warehouse.create({ data: { name: 'Edit warehouse', code: 'EDIT' } });
    const loc = await db.location.create({
      data: { name: 'Edit location', code: 'EDIT', warehouseId: wh.id },
    });
    const cat = await db.category.create({ data: { name: 'Edit category' } });
    const contact = await db.contact.create({ data: { name: 'Edit contact', type: 'CUSTOMER' } });
    await patch('warehouses/' + wh.id, {
      name: 'Edited warehouse',
      code: 'EDIT',
      address: 'New address',
    }).expect(200);
    await patch('locations/' + loc.id, {
      name: 'Edited location',
      code: 'EDIT2',
      warehouseId: wh.id,
    }).expect(200);
    await patch('categories/' + cat.id, { name: 'Edited category' }).expect(200);
    await patch('contacts/' + contact.id, {
      name: 'Edited contact',
      type: 'CUSTOMER',
      email: 'edited@test.local',
      phone: '123',
      address: 'New address',
    }).expect(200);
    const all = await catalog.all(manager);
    expect(all.warehouses.find((x) => x.id === wh.id)).toMatchObject({
      name: 'Edited warehouse',
      address: 'New address',
    });
    expect(all.locations.find((x) => x.id === loc.id)).toMatchObject({
      name: 'Edited location',
      code: 'EDIT2',
    });
    expect(all.categories.find((x) => x.id === cat.id)?.name).toBe('Edited category');
    expect(all.contacts.find((x) => x.id === contact.id)).toMatchObject({
      email: 'edited@test.local',
      phone: '123',
    });
    const p = await product();
    const data = { name: p.name, sku: p.sku, categoryId: category, unit: 'PCS', unitCost: 0 };
    await patch('products/' + p.id, { ...data, active: false }).expect(200);
    await patch('products/' + p.id, { ...data, active: true }).expect(200);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).active).toBe(true);
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
