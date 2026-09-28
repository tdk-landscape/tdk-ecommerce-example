import { describe, expect, it, vi } from 'vitest';
import { createCatalogApi, type Product } from '../src/api';
import { addToCart, cartCount, cartTotalCents, removeFromCart, toOrderLines } from '../src/cart';

const mug: Product = { id: 'p_mug', name: 'Mug', description: '', priceCents: 1800, stock: 2 };
const filters: Product = { id: 'p_filters', name: 'Filters', description: '', priceCents: 900, stock: 10 };

describe('cart', () => {
  it('adds units up to the stock limit', () => {
    let cart = addToCart({}, mug);
    cart = addToCart(cart, mug);
    cart = addToCart(cart, mug); // third exceeds stock of 2
    expect(cart).toEqual({ p_mug: 2 });
  });

  it('removes a line once its last unit goes', () => {
    expect(removeFromCart({ p_mug: 2 }, 'p_mug')).toEqual({ p_mug: 1 });
    expect(removeFromCart({ p_mug: 1 }, 'p_mug')).toEqual({});
    expect(removeFromCart({}, 'p_mug')).toEqual({});
  });

  it('totals in cents and maps to order lines', () => {
    const cart = { p_mug: 2, p_filters: 1 };
    expect(cartCount(cart)).toBe(3);
    expect(cartTotalCents(cart, [mug, filters])).toBe(2 * 1800 + 900);
    expect(toOrderLines(cart)).toEqual([
      { productId: 'p_mug', quantity: 2 },
      { productId: 'p_filters', quantity: 1 },
    ]);
  });
});

function respond(status: number, body?: unknown) {
  return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

describe('catalog api client', () => {
  it('searches with an encoded query', async () => {
    const doFetch = respond(200, { data: [mug] });
    const api = createCatalogApi('http://api.test', doFetch as unknown as typeof fetch);

    expect(await api.products(' tea & milk ')).toEqual([mug]);
    expect(doFetch).toHaveBeenCalledWith('http://api.test/api/products?q=tea%20%26%20milk');
  });

  it('posts checkout lines', async () => {
    const doFetch = respond(201, { data: { id: 'o_1', totalCents: 1800, lines: [] } });
    const api = createCatalogApi('http://api.test', doFetch as unknown as typeof fetch);

    await api.checkout([{ productId: 'p_mug', quantity: 1 }]);

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ lines: [{ productId: 'p_mug', quantity: 1 }] });
  });

  it('surfaces the stock error from the API', async () => {
    const api = createCatalogApi(
      'http://api.test',
      respond(409, { error: 'only 0 of Brew Scale in stock' }) as unknown as typeof fetch,
    );

    await expect(api.checkout([{ productId: 'p_scale', quantity: 1 }])).rejects.toThrow('only 0 of Brew Scale');
  });
});
