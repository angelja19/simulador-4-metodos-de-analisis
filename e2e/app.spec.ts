import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.goto('./');
});

test('título, nodos resueltos y matriz de conductancias', async ({ page }, info) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Simulador 4 – Métodos y Técnicas en el Análisis de Circuitos');
  await expect(page.getByText('Sin errores').first()).toBeVisible();
  if (info.project.name === 'celular') await page.getByRole('tab', { name: /2\. Solución/ }).click();
  await expect(page.getByText('Concepto clave').first()).toBeVisible();
});

test('plantilla 4V_Δ por mallas y Thévenin', async ({ page }, info) => {
  await page.getByRole('button', { name: /Plantillas/ }).click();
  await page.locator('.card', { hasText: 'mallas con 4V_Δ' }).getByRole('button').click();
  await expect(page.getByText(/375 W/).first()).toBeVisible();
  await page.getByRole('button', { name: /4.6 Thévenin/ }).click();
  await expect(page.getByText('E_TH').first()).toBeVisible();
  await expect(page.getByText('9 V').first()).toBeVisible();
  await page.screenshot({ path: `docs/captura-${info.project.name}.png` });
});

test('error provocado: malla en circuito con cruce', async ({ page }) => {
  await page.getByRole('button', { name: /4.3 Mallas/ }).click();
  const c = {
    elements: [
      { id: 'e', kind: 'V', label: 'E', value: '10', x: 0, y: 0, rot: 1 },
      { id: 'r1', kind: 'R', label: 'R1', value: '10', x: 0, y: 0, rot: 0 },
      { id: 'r2', kind: 'R', label: 'R2', value: '10', x: 4, y: 12, rot: 0 },
      { id: 'g', kind: 'GND', label: 'Tierra', value: '', x: 0, y: 4, rot: 0 },
    ],
    wires: [
      { id: 'w1', a: { x: 4, y: 0 }, b: { x: 4, y: 4 } },
      { id: 'w2', a: { x: 4, y: 4 }, b: { x: 0, y: 4 } },
      { id: 'w3', a: { x: 2, y: -4 }, b: { x: 2, y: 12 } },
      { id: 'w4', a: { x: 2, y: 12 }, b: { x: 4, y: 12 } },
      { id: 'w5', a: { x: 8, y: 12 }, b: { x: 8, y: -4 } },
      { id: 'w6', a: { x: 8, y: -4 }, b: { x: 2, y: -4 } },
    ],
  };
  const enc = Buffer.from(JSON.stringify(c)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await page.goto(`./#c=${enc}`);
  await expect(page.getByText(/no planar/).first()).toBeVisible();
});
