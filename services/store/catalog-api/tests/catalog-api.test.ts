import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const stockOf = async (id: string) =>
  (await (await app.request(`/api/products/${id}`)).json()).data.stock as number;

describe('catalog-api', () => {
  it('reports health', async () => {
    const res = await app.request('/health');
    expect(await res.json()).toEqual({ status: 'ok', service: 'catalog-api' });
  });

  it('lists and searches products', async () => {
    const all = (await (await app.request('/api/products')).json()).data;
    expect(all.length).toBeGreaterThan(3);

    const found = (await (await app.request('/api/products?q=GRINDER')).json()).data;
    expect(found.map((p: { id: string }) => p.id)).toEqual(['p_grinder']);
  });

  it('404s an unknown product', async () => {
    expect((await app.request('/api/products/nope')).status).toBe(404);
  });

  it('prices an order in cents and decrements stock', async () => {
    const before = await stockOf('p_mug');
    const res = await post('/api/orders', {
      lines: [
        { productId: 'p_mug', quantity: 2 },
        { productId: 'p_filters', quantity: 1 },
      ],
    });

    expect(res.status).toBe(201);
    expect((await res.json()).data.totalCents).toBe(2 * 1800 + 900);
    expect(await stockOf('p_mug')).toBe(before - 2);
  });

  it('rejects an order that exceeds stock without taking any stock', async () => {
    const mugBefore = await stockOf('p_mug');
    const res = await post('/api/orders', {
      lines: [
        { productId: 'p_mug', quantity: 1 },
        { productId: 'p_scale', quantity: 1 },
      ],
    });

    expect(res.status).toBe(409);
    expect(await stockOf('p_mug')).toBe(mugBefore);
  });

  it('cannot oversell by splitting one product across lines', async () => {
    const stock = await stockOf('p_grinder');
    const res = await post('/api/orders', {
      lines: [
        { productId: 'p_grinder', quantity: stock },
        { productId: 'p_grinder', quantity: 1 },
      ],
    });

    expect(res.status).toBe(409);
    expect(await stockOf('p_grinder')).toBe(stock);
  });

  it('rejects malformed orders', async () => {
    for (const body of [{}, { lines: [] }, { lines: [{ productId: 'p_mug', quantity: 0 }] }]) {
      expect((await post('/api/orders', body)).status).toBe(400);
    }
    expect((await post('/api/orders', { lines: [{ productId: 'ghost', quantity: 1 }] })).status).toBe(404);
  });

  it('answers CORS preflight for the Vue app', async () => {
    const res = await app.request('/api/orders', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
