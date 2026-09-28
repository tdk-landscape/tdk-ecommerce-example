import { Hono } from 'hono';

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Integer cents, so totals never suffer floating point drift. */
  priceCents: number;
  stock: number;
}

export interface OrderLine {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  lines: Array<OrderLine & { name: string; unitPriceCents: number }>;
  totalCents: number;
  createdAt: string;
}

export const app = new Hono();

const products: Product[] = [
  { id: 'p_espresso', name: 'Espresso Beans 1kg', description: 'Dark roast, single origin.', priceCents: 2400, stock: 25 },
  { id: 'p_grinder', name: 'Burr Grinder', description: 'Stainless steel, 40 settings.', priceCents: 8900, stock: 6 },
  { id: 'p_kettle', name: 'Gooseneck Kettle', description: 'Temperature control, 0.9L.', priceCents: 6500, stock: 10 },
  { id: 'p_mug', name: 'Ceramic Mug', description: 'Hand glazed, 350ml.', priceCents: 1800, stock: 40 },
  { id: 'p_filters', name: 'Paper Filters x100', description: 'Fits V60 size 02.', priceCents: 900, stock: 100 },
  { id: 'p_scale', name: 'Brew Scale', description: 'Timer and 0.1g precision.', priceCents: 5900, stock: 0 },
];
const orders: Order[] = [];
let nextOrderId = 1;

// The Vue app runs on its own origin (app.*.localhost) and calls this API directly,
// so allow cross-origin requests.
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

// Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
app.get('/health', (c) => c.json({ status: 'ok', service: 'catalog-api' }));

app.get('/', (c) =>
  c.json({
    service: 'catalog-api',
    endpoints: ['GET /health', 'GET /api/products?q=', 'GET /api/products/:id', 'POST /api/orders'],
  }),
);

app.get('/api/products', (c) => {
  const q = c.req.query('q')?.trim().toLowerCase();
  const data = q
    ? products.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q))
    : products;
  return c.json({ data });
});

app.get('/api/products/:id', (c) => {
  const product = products.find((p) => p.id === c.req.param('id'));
  return product ? c.json({ data: product }) : c.json({ error: 'product not found' }, 404);
});

function parseLines(body: unknown): OrderLine[] | null {
  const lines = (body as { lines?: unknown })?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const parsed: OrderLine[] = [];
  for (const line of lines) {
    const { productId, quantity } = (line ?? {}) as Partial<OrderLine>;
    if (typeof productId !== 'string' || !Number.isInteger(quantity) || (quantity as number) < 1) {
      return null;
    }
    parsed.push({ productId, quantity: quantity as number });
  }
  return parsed;
}

// Creates an order atomically: every line is validated against stock before any is taken.
app.post('/api/orders', async (c) => {
  const lines = parseLines(await c.req.json().catch(() => null));
  if (!lines) return c.json({ error: 'lines must be a non-empty list of { productId, quantity >= 1 }' }, 400);

  const priced: Order['lines'] = [];
  for (const { productId, quantity } of lines) {
    const product = products.find((p) => p.id === productId);
    if (!product) return c.json({ error: `unknown product ${productId}` }, 404);
    if (product.stock < quantity) {
      return c.json({ error: `only ${product.stock} of ${product.name} in stock` }, 409);
    }
    priced.push({ productId, quantity, name: product.name, unitPriceCents: product.priceCents });
  }

  // Same product on two lines must not oversell: re-check the combined quantity.
  for (const product of products) {
    const wanted = lines.filter((l) => l.productId === product.id).reduce((n, l) => n + l.quantity, 0);
    if (wanted > product.stock) {
      return c.json({ error: `only ${product.stock} of ${product.name} in stock` }, 409);
    }
  }

  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId);
    if (product) product.stock -= line.quantity;
  }

  const order: Order = {
    id: `o_${nextOrderId++}`,
    lines: priced,
    totalCents: priced.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0),
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  return c.json({ data: order }, 201);
});

const port = process.env.PORT || 3000;
console.log('\n🚀 catalog-api running on http://localhost:' + port);
console.log('📊 Health check: http://localhost:' + port + '/health\n');

export default {
  port,
  fetch: app.fetch,
};
