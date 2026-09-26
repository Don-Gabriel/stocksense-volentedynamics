import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const headers = { 'X-StockSense-Client': 'web' };
async function login(page: Page, identity = 'manager', password = 'StockSense!2026') {
  await page.goto('/login');
  await page.getByLabel('Login ID or email').fill(identity);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}
async function codeFor(page: Page, email: string) {
  const inbox = await (await page.request.get('http://127.0.0.1:8025/api/v1/messages')).json();
  const entry = inbox.messages.find((m: any) => m.To.some((t: any) => t.Address === email));
  expect(entry).toBeTruthy();
  const message = await (
    await page.request.get('http://127.0.0.1:8025/api/v1/message/' + entry.ID)
  ).json();
  return message.Text.match(/\b\d{6}\b/)[0];
}
test('signup, email verification, approval, password reset, and revocation through the UI', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const email = 'browserverify@stocksense.local';
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Browser Verified');
  await page.getByLabel('Login ID', { exact: true }).fill('browseruser');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('BrowserPassword!2026');
  await page.getByLabel('Confirm password', { exact: true }).fill('BrowserPassword!2026');
  await page.getByRole('button', { name: 'Create account & send code' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
  await expect(page.getByText('Development email mode:', { exact: false })).toBeVisible();
  await page.getByLabel('Verification code').fill(await codeFor(page, email));
  await page.getByLabel('Account password', { exact: true }).fill('BrowserPassword!2026');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByText(/Email verified. Ask your inventory manager/)).toBeVisible();
  await page.getByLabel('Login ID or email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('BrowserPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('manager must approve');
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await login(manager);
  await manager.goto('/settings?tab=team');
  const member = manager.getByRole('row').filter({ hasText: email });
  await expect(member).toContainText('Email verified');
  await member.getByRole('button', { name: 'Approve', exact: true }).click();
  await manager.getByRole('button', { name: 'Confirm access change' }).click();
  await expect(manager.getByRole('dialog')).not.toBeVisible();
  await expect(member).toContainText('Active');
  await login(page, email, 'BrowserPassword!2026');
  const recoveryContext = await browser.newContext();
  const recovery = await recoveryContext.newPage();
  await recovery.goto('/forgot-password');
  await recovery.getByLabel('Email address').fill(email);
  await recovery.getByRole('button', { name: 'Send reset code' }).click();
  await expect(recovery.getByRole('heading', { name: 'Set a new password.' })).toBeVisible();
  await recovery.getByLabel('Reset code').fill(await codeFor(recovery, email));
  await recovery.getByLabel('New password', { exact: true }).fill('ChangedPassword!2026');
  await recovery.getByLabel('Confirm password', { exact: true }).fill('ChangedPassword!2026');
  await recovery.getByRole('button', { name: 'Update password' }).click();
  await expect(
    recovery.getByText('Password updated. Sign in with your new password.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await login(recovery, email, 'ChangedPassword!2026');
  await member.getByRole('button', { name: 'Disable', exact: true }).click();
  await manager.getByRole('button', { name: 'Confirm access change' }).click();
  await expect(member).toContainText('Disabled');
  await recovery.reload();
  await expect(recovery.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await recoveryContext.close();
  await managerContext.close();
});
test('invalid authentication input, password visibility, mismatch, and reset errors', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter your login ID or email.')).toBeVisible();
  await page.getByLabel('Login ID or email').fill('missing');
  await page.getByLabel('Password', { exact: true }).fill('WrongPassword!2026');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid login');
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Full name').fill('Test Name');
  await page.getByLabel('Login ID', { exact: true }).fill('validuser');
  await page.getByLabel('Email address').fill('unused@stocksense.local');
  await page.getByLabel('Password', { exact: true }).fill('ValidPassword!2026');
  await page.getByLabel('Confirm password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Create account & send code' }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  await page.goto('/reset-password');
  await page.getByLabel('Email address').fill('unused@stocksense.local');
  await page.getByLabel('Reset code').fill('000000');
  await page.getByLabel('New password', { exact: true }).fill('ValidPassword!2026');
  await page.getByLabel('Confirm password', { exact: true }).fill('ValidPassword!2026');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid, expired, or already used');
});
test('catalog setup, editing, opening balances, archive protection, and profile update', async ({
  page,
}) => {
  test.setTimeout(60000);
  await login(page);
  async function add(tab: string, button: string, values: Record<string, string>) {
    await page.goto('/settings?tab=' + tab);
    await page.getByRole('button', { name: button, exact: true }).click();
    const modal = page.getByRole('dialog');
    for (const [label, value] of Object.entries(values))
      await modal.getByLabel(label, { exact: true }).fill(value);
    return modal;
  }
  let modal = await add('categories', 'Add category', { Name: 'Browser category' });
  await modal.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(modal).not.toBeVisible();
  modal = await add('warehouses', 'Add warehouse', {
    Name: 'Browser depot',
    'Short code': 'BDEPOT',
    Address: 'Test-only street',
  });
  await modal.getByRole('button', { name: 'Save warehouse', exact: true }).click();
  await expect(modal).not.toBeVisible();
  modal = await add('locations', 'Add location', { Name: 'Browser rack', 'Short code': 'BRACK' });
  await modal.getByLabel('Warehouse', { exact: true }).selectOption({ label: 'Browser depot' });
  await modal.getByRole('button', { name: 'Save location', exact: true }).click();
  await expect(modal).not.toBeVisible();
  modal = await add('contacts', 'Add contact', {
    Name: 'Browser supplier',
    Email: 'supplier@stocksense.local',
    Phone: '123456',
    Address: 'Sample address',
  });
  await modal.getByRole('button', { name: 'Save contact', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.goto('/products');
  await page.getByRole('button', { name: 'New product', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Name', { exact: true }).fill('Browser opening item');
  await modal.getByLabel('SKU', { exact: true }).fill('BOPEN-01');
  await modal.getByLabel('Category', { exact: true }).selectOption({ label: 'Browser category' });
  await modal.getByLabel('Quantity', { exact: true }).fill('15');
  await modal
    .getByLabel('Location', { exact: true })
    .selectOption({ label: 'BDEPOT / Browser rack' });
  await modal.getByRole('button', { name: 'Save product' }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Edit Browser opening item' }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Active product').uncheck();
  await modal.getByRole('button', { name: 'Save product' }).click();
  await expect(modal.getByRole('alert')).toContainText('Clear remaining stock');
  await modal.getByLabel('Active product').check();
  await modal.getByLabel('Description').fill('Edited description');
  await modal.getByRole('button', { name: 'Save product' }).click();
  await expect(modal).not.toBeVisible();
  await page.goto('/stock?search=BOPEN-01');
  await page.getByLabel('Stock location').selectOption({ label: 'BDEPOT / Browser rack' });
  await expect(page.getByRole('cell', { name: '15', exact: true })).toHaveCount(2);
  await page.goto('/history?search=BOPEN-01');
  await expect(page.getByRole('cell', { name: '+15 pcs', exact: true })).toBeVisible();
  await page.goto('/profile');
  await page.getByLabel('Full name').fill('Alex Test Manager');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.locator('.toast')).toContainText('profile');
  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Alex Test Manager');
});
test('draft edits, duplicate products, unsaved-change recovery, and cancellation', async ({
  page,
}) => {
  await login(page);
  await page.goto('/operations?type=RECEIPT');
  await page.getByRole('button', { name: 'New receipt', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Destination location').selectOption({ label: 'WH / Main Stock' });
  await modal.getByLabel('Supplier', { exact: true }).selectOption({ label: 'Atlas Metals' });
  await modal
    .getByLabel('Product 1', { exact: true })
    .selectOption({ label: 'Oak work desk · DSK-003' });
  await modal.getByLabel('Quantity 1').fill('5');
  await modal.getByRole('button', { name: 'Close dialog' }).click();
  await expect(modal.getByText('Discard unsaved changes?')).toBeVisible();
  await modal.getByRole('button', { name: 'Keep editing' }).click();
  await expect(modal.getByLabel('Quantity 1')).toHaveValue('5');
  await modal.getByRole('button', { name: 'Add product', exact: true }).click();
  await modal
    .getByLabel('Product 2', { exact: true })
    .selectOption({ label: 'Oak work desk · DSK-003' });
  await modal.getByRole('button', { name: 'Create draft' }).click();
  await expect(modal.getByRole('alert')).toContainText('Each product can appear only once');
  await modal.getByRole('button', { name: 'Remove product 2' }).click();
  await modal.getByRole('button', { name: 'Create draft' }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Edit draft' }).click();
  await modal.getByLabel('Quantity 1').fill('7');
  await modal.getByRole('button', { name: 'Save changes' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('cell', { name: '7', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel operation', exact: true }).click();
  await modal.getByRole('button', { name: 'Keep operation' }).click();
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel operation', exact: true }).click();
  await modal.getByRole('button', { name: 'Cancel operation', exact: true }).click();
  await expect(page.getByText('This operation was canceled.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(0);
});
test('filtered list return, persistent kanban, warehouse scope, safe dates, and not-found navigation', async ({
  page,
}) => {
  await login(page);
  await page.goto('/operations?type=DELIVERY&status=WAITING');
  await page.locator('a.reference').first().click();
  await page.getByRole('link', { name: 'Back to deliveries' }).click();
  await expect(page.getByLabel('Operation status')).toHaveValue('WAITING');
  await page.getByRole('button', { name: 'Kanban view' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Kanban view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('/stock');
  await page.getByLabel('Warehouse scope').selectOption({ label: 'South Store' });
  await page.reload();
  await expect(page.getByLabel('Warehouse scope').locator('option:checked')).toHaveText(
    'South Store',
  );
  await expect(page.getByRole('table').getByText('Main Stock', { exact: true })).toHaveCount(0);
  await page.getByLabel('Warehouse scope').selectOption('');
  await page.goto('/history?from=not-a-date&to=oops');
  await expect(page.getByRole('heading', { name: 'Move history', exact: true })).toBeVisible();
  await page.goto('/does-not-exist');
  await page.getByRole('link', { name: 'Go to overview' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
});
test('keyboard navigation, mobile drawer, form focus, and responsive widths', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.getByRole('tab', { name: /Warehouses/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Locations/ })).toBeFocused();
  await expect(page.getByRole('columnheader', { name: 'Location', exact: true })).toBeVisible();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Products', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'New product', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('network errors retain forms and allow a successful retry', async ({ page }) => {
  await login(page);
  await page.goto('/settings?tab=categories');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Name', { exact: true }).fill('Retry category');
  await page.route('**/api/catalog/categories', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Service temporarily unavailable. Please retry.' }),
    }),
  );
  await modal.getByRole('button', { name: 'Save category' }).click();
  await expect(modal.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(modal.getByLabel('Name', { exact: true })).toHaveValue('Retry category');
  await page.unroute('**/api/catalog/categories');
  await modal.getByRole('button', { name: 'Save category' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('table').getByText('Retry category')).toBeVisible();
});
test('shortage recovery, pick-pack delivery, and printable completed document', async ({
  page,
}) => {
  await login(page);
  async function post(path: string, data: object = {}) {
    const response = await page.request.post('/api' + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const catalog = await (await page.request.get('/api/catalog')).json();
  const location = catalog.locations.find((x: any) => x.name === 'Main Stock');
  const product = await post('/catalog/products', {
    name: 'Shortage test product',
    sku: 'SHORTAGE-UI',
    categoryId: catalog.categories[0].id,
    unit: 'PCS',
    unitCost: 2,
    initialStock: 2,
    locationId: location.id,
  });
  const delivery = await post('/operations', {
    type: 'DELIVERY',
    sourceId: location.id,
    contactId: catalog.contacts.find((x: any) => x.type === 'CUSTOMER').id,
    scheduledAt: new Date().toISOString(),
    lines: [{ productId: product.id, quantity: 5 }],
  });
  await page.goto('/operations/' + delivery.id);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.waiting-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check availability' })).toBeVisible();
  await expect(page.locator('.shortage-row')).toHaveCount(1);
  const receipt = await post('/operations', {
    type: 'RECEIPT',
    destinationId: location.id,
    contactId: catalog.contacts.find((x: any) => x.type === 'SUPPLIER').id,
    scheduledAt: new Date().toISOString(),
    lines: [{ productId: product.id, quantity: 3 }],
  });
  await post('/operations/' + receipt.id + '/confirm');
  await post('/operations/' + receipt.id + '/validate');
  await page.getByRole('button', { name: 'Check availability' }).click();
  await expect(page.locator('.waiting-banner')).not.toBeVisible();
  await page.getByRole('button', { name: 'Mark as picked' }).click();
  await page.getByRole('button', { name: 'Mark as packed' }).click();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as any).__printCalls = 0;
    window.print = () => {
      (window as any).__printCalls++;
    };
  });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__printCalls)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: delivery.reference, exact: true })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Shortage test product', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/print-document.png', fullPage: true });
});
test('reordering rules, replenishment suggestions, and empty-product archiving', async ({
  page,
}) => {
  await login(page);
  await page.goto('/settings?tab=rules');
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal
    .getByLabel('Product', { exact: true })
    .selectOption({ label: 'Oak work desk · DSK-003' });
  await modal.getByLabel('Location', { exact: true }).selectOption({ label: 'WH / Main Stock' });
  await modal.getByLabel('Minimum quantity').fill('100');
  await modal.getByLabel('Target quantity').fill('50');
  await modal.getByRole('button', { name: 'Save reordering rule' }).click();
  await expect(modal.getByRole('alert')).toContainText('at least the minimum');
  await modal.getByLabel('Target quantity').fill('150');
  await modal.getByRole('button', { name: 'Save reordering rule' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Oak work desk' })).toContainText('150');
  await page
    .getByRole('row')
    .filter({ hasText: 'Oak work desk' })
    .getByRole('button', { name: 'Edit reordering rule' })
    .click();
  await modal.getByLabel('Minimum quantity').fill('90');
  await modal.getByRole('button', { name: 'Save reordering rule' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Oak work desk' })).toContainText('90');
  await page.goto('/stock?search=DSK-003');
  await page.getByLabel('Stock location').selectOption({ label: 'WH / Main Stock' });
  await expect(page.getByRole('table').getByText('Low stock', { exact: true })).toBeVisible();
  await page.goto('/products');
  await page.getByRole('button', { name: 'New product', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Name', { exact: true }).fill('Archive test empty');
  await modal.getByLabel('SKU', { exact: true }).fill('ARC-UI');
  await modal.getByRole('button', { name: 'Save product' }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Edit Archive test empty' }).click();
  await modal.getByLabel('Active product').uncheck();
  await modal.getByRole('button', { name: 'Save product' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Archive test empty' })).toHaveCount(0);
  await page.getByLabel('Include archived').check();
  await expect(page.getByRole('row').filter({ hasText: 'Archive test empty' })).toContainText(
    'Archived',
  );
});
test('automated WCAG checks cover authentication, dashboard, tables, settings, and modal', async ({
  page,
}) => {
  test.setTimeout(60000);
  async function check(label: string) {
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      label,
    ).toEqual([]);
  }
  await page.goto('/login');
  await check('login');
  await page.goto('/signup');
  await check('signup');
  await login(page);
  await check('overview');
  await page.goto('/stock');
  await expect(page.getByRole('table')).toBeVisible();
  await check('stock');
  await page.goto('/settings?tab=team');
  await expect(page.getByRole('table')).toBeVisible();
  await check('team');
  await page.goto('/products');
  await page.getByRole('button', { name: 'New product', exact: true }).click();
  await check('product dialog');
});
test('global search, overdue quick filter, and dashboard warehouse changes', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Search inventory', { exact: true }).fill('TAP-010');
  await page.getByLabel('Search inventory', { exact: true }).press('Enter');
  await expect(page.getByLabel('Search stock')).toHaveValue('TAP-010');
  await expect(
    page.getByRole('table').getByText('Packing tape', { exact: true }).first(),
  ).toBeVisible();
  await page.goto('/');
  await page.locator('.card-receipt .late-pill').click();
  await expect(page.getByText('Showing overdue operations')).toBeVisible();
  await expect(page).toHaveURL(/late=true/);
  await page.getByRole('button', { name: 'Clear overdue filter' }).click();
  await expect(page).not.toHaveURL(/late=true/);
  await page.goto('/');
  await page.getByLabel('Dashboard location').selectOption({ label: 'WH / Main Stock' });
  await page.getByLabel('Warehouse scope').selectOption({ label: 'South Store' });
  await expect(page.getByLabel('Dashboard location')).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
});
