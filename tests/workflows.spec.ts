import { test, expect, Page } from '@playwright/test';
const login = async (page: Page, identity = 'manager') => {
  await page.goto('/login');
  await page.getByLabel('Login ID or email').fill(identity);
  await page.getByLabel('Password', { exact: true }).fill('StockSense!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
};
test('full receipt → delivery → transfer → count flow remains consistent after reload', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'New product', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Browser test widget');
  await dialog.getByLabel('SKU', { exact: true }).fill('BROWSER-01');
  await dialog.getByLabel('Unit cost').fill('45');
  await dialog.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  async function draft(type: string, amount: string) {
    await page.goto('/operations?type=' + type);
    await page.getByRole('button', { name: /^New / }).click();
    dialog = page.getByRole('dialog');
    if (type === 'RECEIPT') {
      await dialog.getByLabel('Destination location').selectOption({ label: 'WH / Main Stock' });
      await dialog.getByLabel('Supplier', { exact: true }).selectOption({ label: 'Atlas Metals' });
    }
    if (type === 'DELIVERY') {
      await dialog.getByLabel('Source location').selectOption({ label: 'WH / Main Stock' });
      await dialog
        .getByLabel('Customer', { exact: true })
        .selectOption({ label: 'Aurora Interiors' });
    }
    if (type === 'TRANSFER') {
      await dialog.getByLabel('Source location').selectOption({ label: 'WH / Main Stock' });
      await dialog
        .getByLabel('Destination location')
        .selectOption({ label: 'WH / Production Rack' });
    }
    if (type === 'ADJUSTMENT') {
      await dialog.getByLabel('Count location').selectOption({ label: 'WH / Main Stock' });
      await dialog.getByLabel('Reason for adjustment').fill('End-of-shift count');
    }
    await dialog
      .getByLabel('Product 1', { exact: true })
      .selectOption({ label: 'Browser test widget · BROWSER-01' });
    await dialog.getByLabel('Quantity 1').fill(amount);
    await dialog.getByRole('button', { name: 'Create draft' }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  }
  await draft('RECEIPT', '100');
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await draft('DELIVERY', '20');
  await page.getByRole('button', { name: 'Mark as picked' }).click();
  await page.getByRole('button', { name: 'Mark as packed' }).click();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await draft('TRANSFER', '30');
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await draft('ADJUSTMENT', '48');
  await expect(page.getByRole('cell', { name: '-2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await page.goto('/stock?search=BROWSER-01');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'Main Stock' });
  await expect(row.getByRole('cell', { name: '48', exact: true })).toHaveCount(2);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'Production Rack' })
      .getByRole('cell', { name: '30', exact: true }),
  ).toHaveCount(2);
  await page.goto('/history?search=BROWSER-01');
  await expect(page.getByRole('cell', { name: '-2 pcs', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '+100 pcs', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '-30 pcs', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '+30 pcs', exact: true })).toBeVisible();
});
test('search, filters, kanban, settings, and mobile navigation', async ({ page }) => {
  await login(page);
  await page.screenshot({ path: '.local/screenshots/overview-desktop.png', fullPage: true });
  await page.getByLabel('Dashboard operation type').selectOption('DELIVERY');
  await page.getByLabel('Dashboard status').selectOption('WAITING');
  await page.getByLabel('Dashboard category').selectOption({ label: 'Packaging' });
  await page.getByRole('link', { name: 'View all operations', exact: true }).click();
  await expect(page.getByLabel('Operation status')).toHaveValue('WAITING');
  await expect(page.getByLabel('Operation category').locator('option:checked')).toHaveText(
    'Packaging',
  );
  await expect(
    page.getByRole('table').getByText('Aurora Interiors', { exact: true }),
  ).toBeVisible();
  await page.goto('/operations?type=DELIVERY');
  await page.getByRole('button', { name: 'Kanban view' }).click();
  await expect(page.locator('.kanban-column')).toHaveCount(5);
  await page.getByLabel('Operation status').selectOption('WAITING');
  await expect(page.locator('.kanban-column')).toHaveCount(1);
  await expect(page.getByText('Aurora Interiors', { exact: true })).toBeVisible();
  await page.goto('/stock?search=TAP-010');
  await page.getByLabel('Stock location').selectOption({ label: 'WH / Main Stock' });
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('table').getByText('Low stock', { exact: true })).toBeVisible();
  await page.goto('/settings?tab=warehouses');
  await expect(page.getByRole('heading', { name: 'Central Warehouse' })).toBeVisible();
  await page.getByRole('tab', { name: /Reordering rules/ }).click();
  await expect(page.getByRole('columnheader', { name: 'Minimum' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Operations', exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/overview-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Stock on hand', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stock on hand', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('staff cannot edit catalog or create physical counts', async ({ page }) => {
  await login(page, 'warehouse');
  await page.goto('/products');
  await expect(page.getByRole('button', { name: 'New product', exact: true })).toHaveCount(0);
  await page.goto('/operations?type=ADJUSTMENT');
  await expect(page.getByRole('button', { name: 'New adjustment', exact: true })).toBeDisabled();
  await page.goto('/');
  await page.getByRole('button', { name: 'New operation', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Adjustment', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});
