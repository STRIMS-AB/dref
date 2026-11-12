import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // The playground must start and work without a CDN or internet connection.
  await page.route(/https:\/\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Product', exact: true })).toBeVisible();
});

test('scope ordering preserves selection, membership and serialized order', async ({ page }) => {
  const scope = page.locator('.dc-scope-heading .dc-nav');
  await scope.filter({ hasText: 'catalog' }).click();
  await expect(page.getByRole('heading', { name: 'catalog', exact: true })).toBeVisible();
  const handle = page.getByRole('button', { name: 'Reorder scope catalog: drag or use Up / Down', exact: true });
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await expect(scope.first()).toContainText('inventory');
  await expect(handle).toBeFocused();
  await expect(page.getByRole('heading', { name: 'catalog', exact: true })).toBeVisible();
  await expect(page.locator('.dc-model-card')).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  await expect(scope.last()).toContainText('catalog');
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  const doc = JSON.parse(await page.getByRole('textbox', { name: 'JSON', exact: true }).inputValue());
  expect(doc.scopes.map((s) => s.name)).toEqual(['inventory', 'partners', 'catalog']);
  expect(doc.models.find((m) => m.name === 'Product').scope).toBe('catalog');
});

test('scope drag, collapse, search and model navigation', async ({ page }) => {
  const groups = page.locator('.dc-scope-group');
  await page.getByRole('button', { name: 'Reorder scope catalog: drag or use Up / Down', exact: true }).dragTo(groups.last());
  await expect(groups.last()).toContainText('catalog');
  await page.getByRole('button', { name: 'Collapse inventory', exact: true }).click();
  await expect(page.locator('.dc-nav-model').filter({ hasText: 'Warehouse' })).toBeHidden();
  await page.getByRole('textbox', { name: 'Find a scope or model…' }).fill('Warehouse');
  await page.locator('.dc-nav-model').filter({ hasText: 'Warehouse' }).click();
  await expect(page.getByRole('heading', { name: 'Warehouse', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Find a scope or model…' }).fill('nothing-matches');
  await expect(page.getByText('No matching scopes or models.')).toBeVisible();
});

test('fields, mappings and settings are focused workspaces with keyboard tabs', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('textbox', { name: 'Model name', exact: true })).toBeHidden();
  await page.getByRole('tab', { name: /^Fields/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /^Mappings/ })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'ERPProduct' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add property', exact: true })).toBeHidden();
  await page.getByRole('button', { name: '+ Add field', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Source', exact: true }).last()).toBeFocused();
  await page.getByRole('textbox', { name: 'Source', exact: true }).last().fill('new_source');
  await page.getByRole('combobox', { name: 'Target', exact: true }).last().fill('name');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Model name', exact: true }).fill('ProductRecord');
  await expect(page.locator('.dc-nav-model').first()).toContainText('ProductRecord');
  await page.getByRole('tab', { name: /^Fields/ }).click();
  await page.screenshot({ path: testInfo.outputPath('workspace-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('workspace-dark.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('mapping-only and read-only modes retain the correct boundaries', async ({ page }) => {
  await page.getByLabel('Workspace mode').selectOption('mappings');
  await expect(page.getByRole('tab', { name: /^Fields/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Reorder scope/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.dc textarea')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByLabel('Read only', { exact: true }).check();
  await expect(page.locator('.dc input, .dc select, .dc textarea, .dc-grip')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'product_id', exact: true })).toBeVisible();
});

test('field keyboard reorder follows the moved row and save clears dirty state', async ({ page }) => {
  const rows = page.locator('[data-reorder="fields"] tbody > tr');
  await rows.first().locator('.dc-grip').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(2).getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('id');
  await expect(rows.nth(2).locator('.dc-grip')).toBeFocused();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('mapping field ordering and validation navigation reach the right view', async ({ page }) => {
  await page.getByRole('tab', { name: /^Mappings/ }).click();
  const rows = page.locator('[data-reorder="mapping-fields"] tbody > tr');
  await rows.first().locator('.dc-grip').focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1).getByRole('textbox', { name: 'Source', exact: true })).toHaveValue('product_id');
  await expect(rows.nth(1).locator('.dc-grip')).toBeFocused();
  await page.getByRole('button', { name: 'Try validation', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Fields/ })).toHaveAttribute('aria-selected', 'true');
  await page.locator('.dc-pill-invalid').click();
  await expect(page.getByRole('tab', { name: /^Mappings/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Mapping definition requires a name.', { exact: true })).toBeVisible();
});

test('narrow dashboard embedding keeps the workspace inside its container', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 950 });
  await expect(page.getByRole('button', { name: 'Add property', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: /^Mappings/ }).click();
  await expect(page.getByRole('heading', { name: 'ERPProduct' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
